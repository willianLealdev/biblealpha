"""Texto bíblico: público (não exige login), somente leitura e com cache longo."""

import hashlib
import json
from typing import Literal

from fastapi import APIRouter, Depends, Query, Request, Response
from sqlalchemy import func, select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import request_meta
from app.bible import ebible
from app.bible import original as original_data
from app.bible.books import all_books, verse_key
from app.core import ratelimit
from app.core.errors import AppError
from app.core.locales import content_lang
from app.db.session import get_db
from app.models import BibleVerse, CrossReference, GlossTranslation, LexiconEntry, OriginalWord
from app.services import bible as bible_service
from app.services.audit import RequestMeta

router = APIRouter(prefix="/bible", tags=["bible"])

# O texto de uma edição nunca muda; uma edição nova tem outro hash
IMMUTABLE = "public, max-age=86400, stale-while-revalidate=604800"


def _etag_response(request: Request, etag: str, body: bytes) -> Response:
    tag = f'"{etag}"'
    headers = {"ETag": tag, "Cache-Control": IMMUTABLE}
    if request.headers.get("if-none-match") == tag:
        return Response(status_code=304, headers=headers)
    return Response(body, media_type="application/json", headers=headers)


# Nomes de idioma dos textos que vêm com o servidor (os do eBible.org trazem no catálogo)
_LANGUAGE_NAMES = {
    "pt-BR": ("Português", "Portuguese"),
    "en": ("English", "English"),
    "es": ("Español", "Spanish"),
}


def _summary(t, defaults: set[str]) -> dict:
    notes = t.notes or {}
    native, english = _LANGUAGE_NAMES.get(t.language, (None, None))
    return {
        "code": t.code,
        "name": t.name,
        "abbreviation": t.abbreviation,
        "language": t.language,
        "language_name": notes.get("language_name") or native or t.language,
        "language_name_en": notes.get("language_name_en") or english or t.language,
        "description": (t.description or "")[:160],
        "year": t.year,
        "license": t.license,
        "verse_count": t.verse_count,
        "sha256": t.source_sha256,
        # Padrão do idioma (o app abre nela quando o usuário ainda não escolheu outra)
        "is_default": t.code in defaults,
        # Livros disponíveis quando a tradução é incompleta (ex.: só o Novo Testamento)
        "books": ebible.book_codes(notes),
        "direction": notes.get("direction", "ltr"),
    }


@router.get("/translations")
async def translations(request: Request, db: AsyncSession = Depends(get_db)) -> Response:
    """Lista resumida (são mais de mil traduções). Com ETag: o app só baixa de novo se mudar."""
    items = await bible_service.list_translations(db)
    defaults = await bible_service.default_codes(db, items)
    body = json.dumps([_summary(t, defaults) for t in items], ensure_ascii=False).encode()
    tag = f'"{hashlib.sha256(body).hexdigest()[:24]}"'
    headers = {"ETag": tag, "Cache-Control": "no-cache"}
    if request.headers.get("if-none-match") == tag:
        return Response(status_code=304, headers=headers)
    return Response(body, media_type="application/json", headers=headers)


@router.get("/translations/{code}")
async def translation_detail(code: str, db: AsyncSession = Depends(get_db)) -> dict:
    t = await bible_service.get_translation(db, code)
    defaults = await bible_service.default_codes(db, await bible_service.list_translations(db))
    return {
        **_summary(t, defaults),
        "description": t.description,
        "edition": t.edition,
        "license_url": t.license_url,
        "attribution": t.attribution,
        "source_url": t.source_url,
        "notes": t.notes,
    }


@router.get("/books")
async def books() -> list[dict]:
    return [
        {
            "id": b.id,
            "code": b.code,
            "testament": b.testament,
            "chapters": b.chapters,
            "names": {
                "pt-BR": {"name": b.pt.name, "abbr": b.pt.abbr},
                "en": {"name": b.en.name, "abbr": b.en.abbr},
                "es": {"name": b.es.name, "abbr": b.es.abbr},
            },
        }
        for b in all_books()
    ]


@router.get("/{code}/chapters/{book}/{chapter}")
async def chapter(
    code: str, book: str, chapter: int, request: Request, db: AsyncSession = Depends(get_db)
) -> Response:
    translation = await bible_service.get_translation(db, code)
    b = bible_service.resolve_book_param(book)
    data = await bible_service.get_chapter(db, translation, b, chapter)
    body = json.dumps(data, ensure_ascii=False).encode()
    return _etag_response(request, f"{translation.source_sha256[:16]}-{b.code}-{chapter}", body)


@router.get("/{code}/passage")
async def passage(
    code: str, ref: str = Query(min_length=2, max_length=200), db: AsyncSession = Depends(get_db)
):
    translation = await bible_service.get_translation(db, code)
    return {"passages": await bible_service.get_passage(db, translation, ref)}


@router.get("/{code}/search")
async def search(
    code: str,
    q: str = Query(min_length=2, max_length=200),
    testament: Literal["OT", "NT"] | None = None,
    book: str | None = None,
    limit: int = Query(30, ge=1, le=100),
    offset: int = Query(0, ge=0, le=50_000),
    db: AsyncSession = Depends(get_db),
    meta: RequestMeta = Depends(request_meta),
) -> dict:
    await ratelimit.hit(f"search:{meta.ip}", limit=120, window_seconds=60)
    translation = await bible_service.get_translation(db, code)
    b = bible_service.resolve_book_param(book) if book else None
    return await bible_service.search(db, translation, q, testament, b, limit, offset)


@router.get("/{code}/download")
async def download(code: str, request: Request, db: AsyncSession = Depends(get_db)) -> Response:
    translation = await bible_service.get_translation(db, code)
    body = await bible_service.download(db, translation)
    return _etag_response(request, translation.source_sha256, body)


# ---------- Fase 6: originais, léxico, referências cruzadas e comparador ----------


GLOSS_SYSTEM = (
    "You translate the word-by-word glosses of a Hebrew/Greek interlinear Bible from English into "
    "the requested language, for Bible readers. Each gloss is a short meaning of one original word "
    "(e.g. 'in/ beginning', 'he created', '<obj.>'). Keep it short, keep slashes '/' and brackets, "
    "use the usual Bible vocabulary of that language. Return every item with the same source."
)
_GLOSS_SCHEMA = {
    "type": "object",
    "properties": {
        "items": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {"source": {"type": "string"}, "text": {"type": "string"}},
                "required": ["source", "text"],
                "additionalProperties": False,
            },
        }
    },
    "required": ["items"],
    "additionalProperties": False,
}


async def _localized_glosses(db: AsyncSession, glosses: set[str], lang: str) -> dict[str, str]:
    """Significados das palavras no idioma do usuário: guardados; os que faltam são traduzidos agora."""
    from app.ai import service as ai_service
    from app.ai.provider import ProviderError, get_provider
    from app.core.locales import language_name
    from app.services.settings import get_setting

    wanted = {g for g in glosses if g}
    if not wanted:
        return {}
    rows = await db.scalars(
        select(GlossTranslation).where(GlossTranslation.locale == lang, GlossTranslation.source.in_(wanted))
    )
    found = {r.source: r.text for r in rows}
    missing = sorted(wanted - set(found))
    if missing:
        cfg = (await get_setting(db, "ai.models"))["translate"]
        provider = get_provider(cfg["model"])
        for i in range(0, len(missing), 150):
            part = missing[i : i + 150]
            prompt = (
                f"<target_language>{language_name(lang)} ({lang})</target_language>\n"
                f"<glosses>{json.dumps(part, ensure_ascii=False)}</glosses>"
            )
            try:
                data, completion = await provider.complete_json(
                    model=cfg["model"],
                    system=GLOSS_SYSTEM,
                    prompt=prompt,
                    schema=_GLOSS_SCHEMA,
                    effort=cfg["effort"],
                    max_tokens=int(cfg["max_tokens"]),
                )
            except ProviderError:
                break  # sem tradução agora: mostra em inglês e tenta de novo na próxima abertura
            await ai_service.record_usage(
                db,
                user_id=None,
                plan="system",
                feature="gloss_translate",
                provider=provider.name,
                completion=completion,
                status="ok",
            )
            new = {}
            for item in data.get("items", []) if isinstance(data, dict) else []:
                src, text = item.get("source"), item.get("text")
                if src in part and isinstance(text, str) and text.strip():
                    new[src] = text.strip()[:300]
            if new:
                await db.execute(
                    pg_insert(GlossTranslation)
                    .values([{"locale": lang, "source": k, "text": v} for k, v in new.items()])
                    .on_conflict_do_nothing()
                )
                await db.commit()
                found.update(new)
    return found


@router.get("/original/{book}/{chapter}")
async def original_chapter(
    book: str, chapter: int, verse: int | None = None, locale: str = "en", db: AsyncSession = Depends(get_db)
) -> dict:
    """Hebraico/aramaico (AT) ou grego (NT), palavra por palavra, com Strong e tradução da palavra."""
    b = bible_service.resolve_book_param(book)
    start = verse_key(b.id, chapter, verse or 0)
    end = verse_key(b.id, chapter, verse or 999)
    rows = await db.scalars(
        select(OriginalWord)
        .where(OriginalWord.verse_key.between(start, end))
        .order_by(OriginalWord.verse_key, OriginalWord.position)
    )
    rows = list(rows)
    # Significado de cada palavra no idioma do usuário (o espanhol do NT já vem do STEPBible)
    lang = content_lang(locale) if locale.lower()[:2] in ("pt", "en", "es") else locale
    localized: dict[str, str] = {}
    if lang != "en":
        need = {w.gloss_en for w in rows if not (lang == "es" and w.gloss_es)}
        localized = await _localized_glosses(db, need, lang)
    verses: dict[int, list[dict]] = {}
    for w in rows:
        verses.setdefault(w.verse_key % 1000, []).append(
            {
                "text": w.text,
                "translit": w.translit,
                "gloss_en": w.gloss_en,
                "gloss_es": w.gloss_es,
                "gloss": (
                    w.gloss_es if lang == "es" and w.gloss_es else localized.get(w.gloss_en, w.gloss_en)
                ),
                "strong": w.strong,
                "morph": w.morph,
            }
        )
    return {
        "book": b.code,
        "chapter": chapter,
        "language": "hebrew" if b.testament == "OT" else "greek",
        "direction": "rtl" if b.testament == "OT" else "ltr",
        "verses": [{"verse": v, "words": words} for v, words in sorted(verses.items())],
        "credit": original_data.CREDITS["original"],
    }


LEXICON_TRANSLATE_SYSTEM = (
    "You translate entries of a Biblical Hebrew/Greek lexicon for Bible study. Translate the gloss and the "
    "definition into the requested language. Keep Hebrew/Greek words, Strong numbers, Bible references and "
    "numbering exactly as they are. Return the same JSON keys."
)
_LEX_SCHEMA = {
    "type": "object",
    "properties": {"gloss": {"type": "string"}, "definition": {"type": "string"}},
    "required": ["gloss", "definition"],
    "additionalProperties": False,
}


@router.get("/lexicon/{strong}")
async def lexicon(strong: str, locale: str = "en", db: AsyncSession = Depends(get_db)) -> dict:
    """Verbete do léxico (Strong estendido). Em outro idioma, a explicação é traduzida uma vez
    (DeepSeek) e guardada para todos."""
    entry = await db.get(LexiconEntry, strong)
    if entry is None:
        entry = await db.scalar(
            select(LexiconEntry).where(func.upper(LexiconEntry.base) == strong[:5].upper()).limit(1)
        )
    if entry is None:
        raise AppError(404, "lexicon_not_found", "Lexicon entry not found")
    gloss, definition = entry.gloss, entry.definition
    lang = content_lang(locale) if locale.lower()[:2] in ("pt", "en", "es") else locale
    if lang != "en":
        cached = (entry.i18n or {}).get(lang) or await _translate_lexicon(db, entry, lang)
        if cached:
            gloss, definition = cached["gloss"], cached["definition"]
    occurrences = await db.scalar(
        select(func.count()).select_from(OriginalWord).where(OriginalWord.strong == entry.strong)
    )
    sample = await db.scalars(
        select(OriginalWord.verse_key)
        .where(OriginalWord.strong == entry.strong)
        .group_by(OriginalWord.verse_key)
        .order_by(OriginalWord.verse_key)
        .limit(12)
    )
    return {
        "strong": entry.strong,
        "lemma": entry.lemma,
        "translit": entry.translit,
        "morph": entry.morph,
        "gloss": gloss,
        "definition": definition,
        "occurrences": occurrences,
        "verses": list(sample),
        "credit": original_data.CREDITS["original"],
    }


async def _translate_lexicon(db: AsyncSession, entry: LexiconEntry, lang: str) -> dict | None:
    from app.ai import service as ai_service
    from app.ai.provider import ProviderError, get_provider
    from app.core.locales import language_name
    from app.services.settings import get_setting

    cfg = (await get_setting(db, "ai.models"))["translate"]
    provider = get_provider(cfg["model"])
    source = json.dumps({"gloss": entry.gloss, "definition": entry.definition[:4000]}, ensure_ascii=False)
    prompt = f"<target_language>{language_name(lang)} ({lang})</target_language>\n<entry>{source}</entry>"
    try:
        data, completion = await provider.complete_json(
            model=cfg["model"],
            system=LEXICON_TRANSLATE_SYSTEM,
            prompt=prompt,
            schema=_LEX_SCHEMA,
            effort=cfg["effort"],
            max_tokens=int(cfg["max_tokens"]),
        )
    except ProviderError:
        return None
    await ai_service.record_usage(
        db,
        user_id=None,
        plan="system",
        feature="lexicon_translate",
        provider=provider.name,
        completion=completion,
        status="ok",
    )
    if not isinstance(data, dict) or not data.get("definition"):
        return None
    cached = {"gloss": str(data.get("gloss", ""))[:300], "definition": str(data["definition"])[:6000]}
    entry.i18n = {**(entry.i18n or {}), lang: cached}
    await db.commit()
    return cached


@router.get("/crossrefs/{key}")
async def crossrefs(
    key: int,
    translation: str = "blivre",
    limit: int = Query(20, ge=1, le=60),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Referências cruzadas de um versículo (as mais votadas primeiro), com o texto na tradução."""
    t = await bible_service.get_translation(db, translation)
    rows = (
        await db.scalars(
            select(CrossReference)
            .where(CrossReference.from_key == key)
            .order_by(CrossReference.votes.desc())
            .limit(limit)
        )
    ).all()
    out = []
    for r in rows:
        texts = (
            await db.scalars(
                select(BibleVerse.text)
                .where(BibleVerse.translation_id == t.id, BibleVerse.verse_key.between(r.to_start, r.to_end))
                .order_by(BibleVerse.verse_key)
                .limit(6)
            )
        ).all()
        out.append({"start": r.to_start, "end": r.to_end, "votes": r.votes, "text": " ".join(texts)})
    return {"items": out, "credit": original_data.CREDITS["crossrefs"]}


@router.get("/compare")
async def compare(
    start: int,
    end: int | None = None,
    translations: str = Query(min_length=2, max_length=400),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """O mesmo trecho em várias traduções, lado a lado."""
    end = end or start
    if end < start or end - start > 200:
        raise AppError(422, "passage_too_long", "Select a shorter passage")
    out = []
    for code in dict.fromkeys(c.strip() for c in translations.split(",") if c.strip()):
        try:
            t = await bible_service.get_translation(db, code)
        except AppError:
            continue
        rows = (
            await db.execute(
                select(BibleVerse.verse, BibleVerse.text)
                .where(BibleVerse.translation_id == t.id, BibleVerse.verse_key.between(start, end))
                .order_by(BibleVerse.verse_key)
            )
        ).all()
        out.append(
            {
                "code": t.code,
                "name": t.name,
                "abbreviation": t.abbreviation,
                "language": t.language,
                "verses": [{"verse": v, "text": text} for v, text in rows],
            }
        )
        if len(out) >= 8:
            break
    return {"items": out}
