"""Devocional diário, devocional personalizado (IA), histórico, sequência e planos de leitura."""

import logging
import re
import uuid
from datetime import date, timedelta

from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.ai import service as ai_service
from app.ai.provider import Completion, ProviderError, get_provider
from app.bible.books import by_code, by_id, split_key, verse_key
from app.bible.reference import Reference, format_reference
from app.core.errors import AppError
from app.core.locales import LOCALE_PATTERN, content_lang, language_name
from app.devotional.catalog import PASSAGES, THEMES, item_for_day, reference
from app.devotional.prompts import SCHEMA, SYSTEM
from app.models import BibleTranslation, BibleVerse, DailyDevotional, User, UserDevotional
from app.services.settings import get_setting

log = logging.getLogger("biblealpha.devotional")

LENGTHS = {
    "short": "about 250 words in total",
    "medium": "about 450 words in total",
    "long": "about 800 words in total",
}


def translation_for(locale: str) -> str:
    return {"pt-BR": "blivre", "es": "rv1909"}.get(content_lang(locale), "web")


BASE_LOCALE = "pt-BR"


async def devotional_locale(db: AsyncSession, locale: str) -> str:
    """Idioma do devocional = idioma do app do usuário, qualquer que seja. O texto é escrito pelo
    Claude em português e traduzido (DeepSeek) para os outros idiomas na primeira abertura do dia."""
    raw = (locale or "").strip()
    if raw.lower()[:2] in ("pt", "en", "es"):
        return content_lang(raw)
    if re.fullmatch(LOCALE_PATTERN, raw):
        return raw
    return "en"


async def translation_code(db: AsyncSession, locale: str) -> str:
    """Bíblia do devocional: a tradução padrão do idioma (a mesma que o leitor abre); sem Bíblia
    naquele idioma, a WEB (inglês)."""
    if locale in ("pt-BR", "en", "es"):
        return translation_for(locale)
    from app.services import bible as bible_service

    return await bible_service.translation_for_language(db, locale) or "web"


async def passage_text(
    db: AsyncSession, code: str, start: int, end: int
) -> tuple[BibleTranslation, list[dict]]:
    t = await db.scalar(select(BibleTranslation).where(BibleTranslation.code == code))
    if t is None:
        raise AppError(404, "translation_not_found", "Translation not found")
    rows = await db.scalars(
        select(BibleVerse)
        .where(BibleVerse.translation_id == t.id, BibleVerse.verse_key.between(start, end))
        .order_by(BibleVerse.verse_key)
    )
    return t, [{"chapter": v.chapter, "verse": v.verse, "text": v.text} for v in rows]


async def checked_content(db: AsyncSession, translation: BibleTranslation, content: dict) -> dict:
    """Confere toda referência bíblica do devocional contra o texto. As inexistentes saem da lista
    de base bíblica e ficam registradas como aviso."""
    text = "\n".join(
        [content.get("context", ""), content.get("reflection", ""), content.get("application", "")]
        + list(content.get("questions", []))
        + list(content.get("references", []))
    )
    invalid = await ai_service.validate_references(db, translation, text)
    content["references"] = [r for r in content.get("references", []) if r not in invalid]
    content["invalid_references"] = invalid
    return content


def label_for(start: int, end: int, locale: str) -> str:
    """Rótulo da passagem; capítulo inteiro (1 a 199) aparece só como "Salmos 23"."""
    b, c1, v1 = split_key(start)
    _, c2, v2 = split_key(end)
    if v1 == 1 and v2 == 199:
        return format_reference(Reference(by_id()[b].code, c1, None, c2 if c2 != c1 else None, None), locale)
    return format_reference(
        Reference(by_id()[b].code, c1, v1 or None, c2 if c2 != c1 else None, v2 or None), locale
    )


def keys_for(ref: Reference) -> tuple[int, int]:
    book = by_code()[ref.book]
    start = verse_key(book.id, ref.chapter, ref.verse_start or 1)
    end = verse_key(book.id, ref.chapter_end or ref.chapter, ref.verse_end or ref.verse_start or 199)
    return start, end


def _prompt(
    locale: str, label: str, translation: BibleTranslation, verses: list[dict], theme: str | None, length: str
) -> str:
    body = "\n".join(f"{v['chapter']}:{v['verse']} {v['text']}" for v in verses)
    theme_line = f"<theme>{THEMES[theme]['en']}</theme>\n" if theme in THEMES else ""
    source = f"{translation.name} ({translation.abbreviation})"
    return (
        f"<answer_language>{language_name(locale)}</answer_language>\n"
        f"<length>{LENGTHS[length]}</length>\n{theme_line}"
        f'<passage reference="{label}" translation="{source}">\n{body}\n</passage>'
    )


def _fallback(locale: str, theme: str) -> dict:
    """Sem IA disponível: o devocional mostra a passagem com perguntas fixas, sem texto gerado."""
    lang = content_lang(locale)
    q = {
        "pt-BR": (
            "O que esta passagem revela sobre Deus?",
            "O que ela revela sobre as pessoas?",
            "Como posso viver isso hoje?",
        ),
        "es": (
            "¿Qué revela este pasaje acerca de Dios?",
            "¿Qué revela acerca de las personas?",
            "¿Cómo puedo vivir esto hoy?",
        ),
        "en": (
            "What does this passage reveal about God?",
            "What does it reveal about people?",
            "How can I live this out today?",
        ),
    }[lang]
    return {
        "title": THEMES[theme][lang],
        "context": "",
        "reflection": "",
        "application": "",
        "questions": list(q),
        "prayer": "",
        "fallback": True,
    }


async def generate_daily_content(
    db: AsyncSession, locale: str, theme: str | None, start: int, end: int, length: str = "medium"
) -> tuple[dict, str]:
    """Texto de um devocional para todos (custo do sistema). Sem IA: passagem com perguntas fixas."""
    code = await translation_code(db, locale)
    translation, verses = await passage_text(db, code, start, end)
    if not verses:
        raise AppError(404, "verse_not_found", "Passage not found")
    b, c1, v1 = split_key(start)
    _, c2, v2 = split_key(end)
    label = format_reference(
        Reference(by_id()[b].code, c1, v1 or None, c2 if c2 != c1 else None, v2 or None), locale
    )
    content, model = _fallback(locale, theme if theme in THEMES else "faith"), "none"
    if (await get_setting(db, "ai.enabled")).get("value", True):
        cfg = (await get_setting(db, "ai.models"))["devotional"]
        provider = get_provider(cfg["model"])
        try:
            content, completion = await provider.complete_json(
                model=cfg["model"],
                system=SYSTEM,
                prompt=_prompt(locale, label, translation, verses, theme, length),
                schema=SCHEMA,
                effort=cfg["effort"],
                max_tokens=int(cfg["max_tokens"]),
            )
            content = await checked_content(db, translation, content)
            model = completion.model
            # Custo do sistema (sem usuário): aparece no painel como "devotional_daily"
            await ai_service.record_usage(
                db,
                user_id=None,
                plan="system",
                feature="devotional_daily",
                provider=provider.name,
                completion=completion,
                status="ok",
            )
        except ProviderError as e:
            log.error("devocional diário sem IA (%s)", e.code)
    return content, model


async def find_daily(db: AsyncSession, day: date, locale: str) -> DailyDevotional | None:
    return await db.scalar(
        select(DailyDevotional).where(DailyDevotional.day == day, DailyDevotional.locale == locale)
    )


TRANSLATE_SYSTEM = (
    "You translate Christian devotionals for BibleAlpha. Translate every text field of the JSON from "
    "Brazilian Portuguese into the requested language, faithfully and naturally, as a native Christian "
    "reader of that language would write it. Do not add, remove or change ideas. Keep markdown. "
    "Write Bible references with the book names commonly used in Bibles of that language "
    "(for example 'João 3:16' becomes 'John 3:16' in English). Keep the same JSON keys."
)


async def translate_content(db: AsyncSession, content: dict, locale: str) -> tuple[dict, str] | None:
    """Traduz o devocional (custo do sistema, registrado no painel como "devotional_translate")."""
    import json

    if not (await get_setting(db, "ai.enabled")).get("value", True):
        return None
    cfg = (await get_setting(db, "ai.models"))["devotional_translate"]
    provider = get_provider(cfg["model"])
    source = {k: v for k, v in content.items() if k in SCHEMA["properties"]}
    prompt = (
        f"<target_language>{language_name(locale)} ({locale})</target_language>\n"
        f"<devotional>\n{json.dumps(source, ensure_ascii=False)}\n</devotional>"
    )
    try:
        data, completion = await provider.complete_json(
            model=cfg["model"],
            system=TRANSLATE_SYSTEM,
            prompt=prompt,
            schema=SCHEMA,
            effort=cfg["effort"],
            max_tokens=int(cfg["max_tokens"]),
        )
    except ProviderError as e:
        log.error("tradução do devocional para %s falhou (%s)", locale, e.code)
        return None
    await ai_service.record_usage(
        db,
        user_id=None,
        plan="system",
        feature="devotional_translate",
        provider=provider.name,
        completion=completion,
        status="ok",
    )
    if not isinstance(data, dict) or not str(data.get("title", "")).strip():
        return None
    # As referências já foram conferidas no original; a tradução só muda o nome dos livros
    translated = {**source, **{k: v for k, v in data.items() if k in SCHEMA["properties"]}}
    translated["invalid_references"] = []
    if content.get("fallback"):
        translated["fallback"] = True
    return translated, f"translate:{completion.model}"


async def retranslate_day(day: date) -> None:
    """Refaz as traduções de um dia depois que o português foi editado (mantém as editadas à mão)."""
    from app.db.session import get_sessionmaker

    async with get_sessionmaker()() as db:
        base = await find_daily(db, day, BASE_LOCALE)
        if base is None:
            return
        rows = await db.scalars(
            select(DailyDevotional).where(DailyDevotional.day == day, DailyDevotional.locale != BASE_LOCALE)
        )
        for row in rows:
            if row.model == "admin":
                continue
            translated = await translate_content(db, base.content, row.locale)
            if translated:
                row.content, row.model = translated
                row.theme = base.theme
                row.verse_key_start, row.verse_key_end = base.verse_key_start, base.verse_key_end
                await db.commit()


async def daily(db: AsyncSession, locale: str, day: date | None = None) -> DailyDevotional:
    day = day or date.today()
    locale = await devotional_locale(db, locale)
    existing = await db.scalar(
        select(DailyDevotional).where(DailyDevotional.day == day, DailyDevotional.locale == locale)
    )
    if existing:
        return existing

    code = await translation_code(db, locale)
    if locale == BASE_LOCALE:
        item = item_for_day(day)
        theme = item.theme
        start, end = keys_for(reference(item.ref))
        content, model = await generate_daily_content(db, locale, theme, start, end)
    else:
        base = await daily(db, BASE_LOCALE, day)
        theme, start, end = base.theme, base.verse_key_start, base.verse_key_end
        translated = await translate_content(db, base.content, locale)
        if translated is None:
            # Tradução indisponível agora: mostra o original e tenta de novo na próxima abertura
            return base
        content, model = translated
    row = DailyDevotional(
        day=day,
        locale=locale,
        theme=theme,
        translation_code=code,
        verse_key_start=start,
        verse_key_end=end,
        content=content,
        model=model,
    )
    db.add(row)
    try:
        await db.commit()
    except IntegrityError:
        # Outro pedido gerou o mesmo dia ao mesmo tempo: usa o que foi salvo
        await db.rollback()
        row = await db.scalar(
            select(DailyDevotional).where(DailyDevotional.day == day, DailyDevotional.locale == locale)
        )
    return row


async def personal(
    db: AsyncSession, user: User, *, theme: str | None, start: int | None, end: int | None, length: str
) -> UserDevotional:
    """Devocional sob medida: passagem e/ou tema escolhidos pelo usuário (conta na cota de IA)."""
    plan = await ai_service.check_access(db, user)
    locale = user.locale
    if start is None:
        if theme not in THEMES:
            raise AppError(422, "theme_or_passage_required", "Choose a theme or a passage")
        # Passagem do catálogo para o tema, variando a cada pedido
        options = PASSAGES[theme]
        ref = reference(options[uuid.uuid4().int % len(options)])
        start, end = keys_for(ref)
    end = end or start
    code = translation_for(locale)
    translation, verses = await passage_text(db, code, start, end)
    if not verses:
        raise AppError(404, "verse_not_found", "Passage not found")
    if len(verses) > 40:
        raise AppError(422, "passage_too_long", "Select a shorter passage")
    b, c1, v1 = split_key(start)
    _, c2, v2 = split_key(end)
    label = format_reference(
        Reference(by_id()[b].code, c1, v1 or None, c2 if c2 != c1 else None, v2 or None), locale
    )
    cfg = (await get_setting(db, "ai.models"))["devotional"]
    provider = get_provider(cfg["model"])
    try:
        content, completion = await provider.complete_json(
            model=cfg["model"],
            system=SYSTEM,
            prompt=_prompt(locale, label, translation, verses, theme, length),
            schema=SCHEMA,
            effort=cfg["effort"],
            max_tokens=int(cfg["max_tokens"]),
        )
        content = await checked_content(db, translation, content)
        status = "ok"
    except ProviderError as e:
        completion, status = Completion(model=cfg["model"]), "error"
        await ai_service.record_usage(
            db,
            user_id=user.id,
            plan=plan,
            feature="devotional",
            provider=provider.name,
            completion=completion,
            status=status,
            error_code=e.code,
        )
        await db.commit()
        raise AppError(502, "ai_failed", "Could not generate the devotional") from e
    await ai_service.record_usage(
        db,
        user_id=user.id,
        plan=plan,
        feature="devotional",
        provider=provider.name,
        completion=completion,
        status=status,
    )
    row = UserDevotional(
        user_id=user.id,
        kind="ai",
        theme=theme,
        translation_code=code,
        verse_key_start=start,
        verse_key_end=end,
        content=content,
    )
    db.add(row)
    await db.commit()
    await ai_service.check_budget_alerts(db)
    return row


async def streak(db: AsyncSession, user_id: uuid.UUID, today: date | None = None) -> dict:
    today = today or date.today()
    days = set(
        await db.scalars(
            select(UserDevotional.completed_on).where(
                UserDevotional.user_id == user_id,
                UserDevotional.completed_on.is_not(None),
            )
        )
    )
    current = 0
    cursor = today if today in days else today - timedelta(days=1)
    while cursor in days:
        current += 1
        cursor -= timedelta(days=1)
    last60 = [(today - timedelta(days=i)).isoformat() for i in range(59, -1, -1)]
    return {
        "current_streak": current,
        "total_completed": len(days),
        "calendar": [{"date": d, "done": date.fromisoformat(d) in days} for d in last60],
    }
