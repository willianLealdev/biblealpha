"""Fluxo de uma pergunta à IA.

1. Confere se a IA está ligada, o orçamento global e a cota do usuário (Free/Pro).
2. Pergunta livre (sem passagem): classificador barato decide se é tema bíblico.
3. Busca no banco a passagem e o capítulo inteiro como contexto (a IA recebe o texto real).
4. Chama o modelo em streaming.
5. Confere as referências citadas na resposta contra o texto bíblico.
6. Grava uso, tokens e custo (US$ e R$) e dispara alertas de orçamento.
"""

import asyncio
import json
import logging
import uuid
from collections.abc import AsyncIterator
from dataclasses import dataclass
from datetime import UTC, date, datetime, timedelta
from decimal import Decimal

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.ai import costs, prompts
from app.ai.provider import Completion, ProviderError, get_provider
from app.bible.books import by_code, by_id, split_key, verse_key
from app.bible.reference import Reference, find_references, format_reference
from app.core.errors import AppError
from app.core.locales import content_lang
from app.db.session import get_sessionmaker
from app.models import AIConversation, AIMessage, AIUsage, BibleTranslation, BibleVerse, Role, User, UserRole
from app.services import email as email_service
from app.services.plans import get_plan
from app.services.settings import get_setting, set_setting

log = logging.getLogger("biblealpha.ai")

MAX_PASSAGE_VERSES = 80
HISTORY_TURNS = 6


@dataclass
class AskInput:
    translation: str
    mode: str
    question: str | None
    verse_key_start: int | None
    verse_key_end: int | None
    conversation_id: uuid.UUID | None


def _now() -> datetime:
    return datetime.now(UTC)


def _day_start(now: datetime) -> datetime:
    return now.replace(hour=0, minute=0, second=0, microsecond=0)


def _month_start(now: datetime) -> datetime:
    return _day_start(now).replace(day=1)


# ---------- Cotas e orçamento ----------


async def _cost_since(db: AsyncSession, since: datetime) -> Decimal:
    return await db.scalar(
        select(func.coalesce(func.sum(AIUsage.cost_usd), 0)).where(AIUsage.created_at >= since)
    )


async def _user_requests_since(db: AsyncSession, user_id: uuid.UUID, since: datetime) -> int:
    return await db.scalar(
        select(func.count())
        .select_from(AIUsage)
        .where(
            AIUsage.user_id == user_id,
            AIUsage.created_at >= since,
            AIUsage.feature != "classify",
            AIUsage.status.in_(("ok", "refused", "blocked")),
        )
    )


async def check_access(db: AsyncSession, user: User) -> str:
    """Devolve o plano do usuário ou lança erro com código que o app traduz (sem mostrar custos)."""
    if not (await get_setting(db, "ai.enabled")).get("value", True):
        raise AppError(503, "ai_unavailable", "AI is temporarily unavailable")
    plan = await get_plan(db, user.id)
    # Administrador: sem cotas nem tetos de uso (os limites são para os usuários)
    if "admin" in user.role_names:
        return plan
    quotas = await get_setting(db, "ai.quotas")
    budget = await get_setting(db, "ai.budget")
    now = _now()
    today_cost = await _cost_since(db, _day_start(now))

    # Teto absoluto do dia: protege contra custo descontrolado (vale para todos)
    if today_cost >= Decimal(str(budget["hard_daily_usd"])):
        raise AppError(503, "ai_unavailable", "AI is temporarily unavailable")

    if plan == "free":
        month_cost = await _cost_since(db, _month_start(now))
        if today_cost >= Decimal(str(budget["daily_usd"])) or month_cost >= Decimal(
            str(budget["monthly_usd"])
        ):
            raise AppError(503, "ai_unavailable_free", "AI is temporarily unavailable for the free plan")
        over_day = await _user_requests_since(db, user.id, _day_start(now)) >= int(quotas["free_daily"])
        over_month = await _user_requests_since(db, user.id, _month_start(now)) >= int(quotas["free_monthly"])
        if over_day or over_month:
            # Perguntas extras ganhas com uma oferta avulsa
            if (user.ai_bonus or 0) > 0:
                user.ai_bonus -= 1
                await db.flush()
                return plan
            if over_day:
                raise AppError(429, "ai_quota_free_daily", "Free daily AI limit reached")
            raise AppError(429, "ai_quota_free_monthly", "Free monthly AI limit reached")
    else:
        # Pro: uso livre, com teto de segurança invisível no uso normal
        if await _user_requests_since(db, user.id, now - timedelta(minutes=1)) >= int(
            quotas["pro_per_minute"]
        ):
            raise AppError(429, "ai_rate_limited", "Too many AI requests, wait a moment")
        if await _user_requests_since(db, user.id, _day_start(now)) >= int(quotas["pro_daily_cap"]):
            raise AppError(429, "ai_quota_pro_daily", "Daily safety limit reached")
    return plan


async def record_usage(
    db: AsyncSession,
    *,
    user_id: uuid.UUID | None,
    plan: str,
    feature: str,
    provider: str,
    completion: Completion,
    status: str,
    error_code: str | None = None,
) -> AIUsage:
    price = await costs.price_for(db, completion.model, date.today())
    usd = costs.cost_usd(price, completion.usage)
    rate = Decimal(str((await get_setting(db, "fx.usd_brl"))["rate"]))
    row = AIUsage(
        user_id=user_id,
        plan=plan,
        feature=feature,
        provider=provider,
        model=completion.model,
        input_tokens=completion.usage.input_tokens,
        output_tokens=completion.usage.output_tokens,
        cache_read_tokens=completion.usage.cache_read_tokens,
        cache_write_tokens=completion.usage.cache_write_tokens,
        cost_usd=usd,
        usd_brl=rate,
        cost_brl=(usd * rate).quantize(Decimal("0.000001")),
        latency_ms=completion.latency_ms,
        status=status,
        error_code=error_code,
        request_id=completion.request_id,
    )
    db.add(row)
    await db.flush()
    return row


async def check_budget_alerts(db: AsyncSession) -> None:
    """Avisa o administrador por e-mail ao passar de 80% e de 100% do orçamento diário (uma vez por dia)."""
    budget = await get_setting(db, "ai.budget")
    limit = Decimal(str(budget["daily_usd"]))
    if limit <= 0:
        return
    today = date.today().isoformat()
    spent = await _cost_since(db, _day_start(_now()))
    alerts = await get_setting(db, "ai.alerts")
    sent = set(alerts.get(today, []))
    to_send = [lvl for lvl in (80, 100) if spent >= limit * lvl / 100 and str(lvl) not in sent]
    if not to_send:
        return
    level = max(to_send)
    await set_setting(db, "ai.alerts", {today: sorted(sent | {str(lv) for lv in to_send})})
    await db.commit()
    recipients = (
        [budget["alert_email"]]
        if budget.get("alert_email")
        else list(
            await db.scalars(
                select(User.email)
                .join(UserRole, UserRole.user_id == User.id)
                .join(Role, Role.id == UserRole.role_id)
                .where(Role.name == "admin", User.deleted_at.is_(None))
            )
        )
    )
    subject = f"BibleAlpha: IA atingiu {level}% do orçamento diário (US$ {spent:.2f} de US$ {limit:.2f})"
    body = (
        f"O gasto com IA hoje chegou a US$ {spent:.2f}, {level}% do orçamento diário de US$ {limit:.2f}. "
        + ("O plano Free foi pausado até amanhã. " if level >= 100 else "")
        + "Ajuste o orçamento ou os modelos no painel administrativo."
    )
    for to in recipients:
        await email_service.send(
            email_service.EmailMessage(to=to, subject=subject, html=f"<p>{body}</p>", text=body)
        )


# ---------- Contexto bíblico ----------


async def _verses(db: AsyncSession, translation_id: uuid.UUID, start: int, end: int) -> list[BibleVerse]:
    return list(
        await db.scalars(
            select(BibleVerse)
            .where(BibleVerse.translation_id == translation_id, BibleVerse.verse_key.between(start, end))
            .order_by(BibleVerse.verse_key)
        )
    )


def _render(verses: list[BibleVerse]) -> str:
    return "\n".join(f"{v.chapter}:{v.verse} {v.text}" for v in verses)


async def build_context(
    db: AsyncSession, translation: BibleTranslation, start: int | None, end: int | None
) -> tuple[str | None, str | None, str | None]:
    """(rótulo da referência, texto da passagem, capítulo(s) como contexto)."""
    if not start:
        return None, None, None
    end = end or start
    b1, c1, v1 = split_key(start)
    b2, c2, v2 = split_key(end)
    if b1 != b2 or end < start:
        raise AppError(422, "invalid_reference", "Passage must be inside one book")
    book = by_id()[b1]
    passage = await _verses(
        db, translation.id, start if v1 else verse_key(b1, c1, 1), end if v2 else verse_key(b2, c2, 999)
    )
    if not passage:
        raise AppError(404, "verse_not_found", "Passage not found")
    if len(passage) > MAX_PASSAGE_VERSES:
        raise AppError(422, "passage_too_long", "Select a shorter passage")
    label = format_reference(
        Reference(book.code, c1, v1 or None, c2 if c2 != c1 else None, v2 or None), translation.language
    )
    chapter = await _verses(db, translation.id, verse_key(b1, c1, 1), verse_key(b2, c2, 999))
    return label, _render(passage), _render(chapter)


async def validate_references(db: AsyncSession, translation: BibleTranslation, text: str) -> list[str]:
    """Referências citadas na resposta que não existem nesta tradução."""
    invalid: list[str] = []
    for label, ref in find_references(text, translation.language, include_invalid=True):
        if ref is None:
            if label not in invalid:
                invalid.append(label)
            continue
        book = by_code()[ref.book]
        start = verse_key(book.id, ref.chapter, ref.verse_start or 1)
        exists = await db.scalar(
            select(func.count())
            .select_from(BibleVerse)
            .where(BibleVerse.translation_id == translation.id, BibleVerse.verse_key == start)
        )
        if not exists and label not in invalid:
            invalid.append(label)
    return invalid


# ---------- Pergunta ----------


def sse(event: dict) -> bytes:
    return f"data: {json.dumps(event, ensure_ascii=False, default=str)}\n\n".encode()


async def ask(db: AsyncSession, user: User, data: AskInput) -> AsyncIterator[bytes]:
    """Valida tudo antes de abrir o streaming (erros viram HTTP normal), depois devolve o gerador SSE."""
    plan = await check_access(db, user)
    models = await get_setting(db, "ai.models")
    locale = user.locale

    translation = await db.scalar(select(BibleTranslation).where(BibleTranslation.code == data.translation))
    if translation is None:
        raise AppError(404, "translation_not_found", "Translation not found")

    conversation: AIConversation | None = None
    history: list[dict] = []
    if data.conversation_id:
        conversation = await db.get(AIConversation, data.conversation_id)
        if conversation is None or conversation.user_id != user.id:
            raise AppError(404, "conversation_not_found", "Conversation not found")
        if not data.question:
            raise AppError(422, "question_required", "Write a question")
        start, end = conversation.verse_key_start, conversation.verse_key_end
        rows = list(
            await db.scalars(
                select(AIMessage)
                .where(AIMessage.conversation_id == conversation.id)
                .order_by(AIMessage.created_at.desc())
                .limit(HISTORY_TURNS * 2)
            )
        )
        history = [{"role": m.role, "content": m.content} for m in reversed(rows)]
        feature = "chat"
    else:
        start, end = data.verse_key_start, data.verse_key_end
        feature = "explain" if start else "chat"
        if not start and not data.question:
            raise AppError(422, "question_required", "Choose a passage or write a question")

    label, passage, chapter = await build_context(db, translation, start, end)

    # Pergunta livre, sem passagem: classificador barato antes do modelo principal
    if not start and data.question:
        cfg = models["classify"]
        provider = get_provider(cfg["model"])
        try:
            verdict = await provider.complete(
                model=cfg["model"],
                system=prompts.CLASSIFIER_SYSTEM,
                prompt=data.question,
                effort=cfg["effort"],
                max_tokens=int(cfg["max_tokens"]),
            )
        except ProviderError as e:
            log.warning("classificador falhou: %s", e.code)
            verdict = None
        if verdict is not None:
            off_topic = verdict.text.strip().upper().startswith("OFF")
            await record_usage(
                db,
                user_id=user.id,
                plan=plan,
                feature="classify",
                provider=provider.name,
                completion=verdict,
                status="blocked" if off_topic else "ok",
            )
            await db.commit()
            if off_topic:
                message = prompts.OFF_TOPIC[content_lang(locale)]

                async def refuse() -> AsyncIterator[bytes]:
                    yield sse({"type": "start", "conversation_id": None})
                    yield sse({"type": "delta", "text": message})
                    yield sse({"type": "done", "off_topic": True, "invalid_references": []})

                return refuse()

    user_content = prompts.build_user_message(
        locale=locale,
        mode=data.mode,
        translation_name=f"{translation.name} ({translation.abbreviation})",
        reference_label=label,
        passage_text=passage,
        chapter_context=chapter if data.mode != "simple" or not history else None,
        question=data.question,
    )

    if conversation is None:
        title = label or (data.question or "")[:120]
        conversation = AIConversation(
            user_id=user.id,
            title=title or "—",
            translation_code=translation.code,
            verse_key_start=start,
            verse_key_end=end or start,
            mode=data.mode,
        )
        db.add(conversation)
        await db.flush()
    user_msg = AIMessage(conversation_id=conversation.id, role="user", content=data.question or (label or ""))
    db.add(user_msg)
    await db.commit()

    cfg = models[feature]
    provider = get_provider(cfg["model"])
    messages = [*history, {"role": "user", "content": user_content}]
    conversation_id = conversation.id
    user_id = user.id

    async def stream() -> AsyncIterator[bytes]:
        result = Completion(model=cfg["model"])
        yield sse({"type": "start", "conversation_id": str(conversation_id)})
        status, error_code = "ok", None
        try:
            async for chunk in provider.stream(
                model=cfg["model"],
                system=prompts.SYSTEM_PROMPT,
                messages=messages,
                effort=cfg["effort"],
                max_tokens=int(cfg["max_tokens"]),
                result=result,
            ):
                yield sse({"type": "delta", "text": chunk})
            if result.stop_reason == "refusal":
                status, error_code = "refused", "refused"
        except ProviderError as e:
            status, error_code = "error", e.code
            log.error("IA falhou (%s): %s", e.code, e)
        except asyncio.CancelledError:
            status, error_code = "error", "client_disconnected"
            raise
        finally:
            # Sessão própria: a do request já pode ter sido fechada quando o streaming termina
            async with get_sessionmaker()() as s:
                usage = await record_usage(
                    s,
                    user_id=user_id,
                    plan=plan,
                    feature=feature,
                    provider=provider.name,
                    completion=result,
                    status=status,
                    error_code=error_code,
                )
                invalid: list[str] = []
                message_id = None
                if status == "ok" and result.text:
                    t = await s.get(BibleTranslation, translation.id)
                    invalid = await validate_references(s, t, result.text)
                    msg = AIMessage(
                        conversation_id=conversation_id,
                        role="assistant",
                        content=result.text,
                        invalid_references=invalid,
                        usage_id=usage.id,
                    )
                    s.add(msg)
                    await s.flush()
                    message_id = msg.id
                    conv = await s.get(AIConversation, conversation_id)
                    conv.updated_at = _now()
                await s.commit()
                await check_budget_alerts(s)
        if status == "ok":
            yield sse({"type": "done", "message_id": str(message_id), "invalid_references": invalid})
        else:
            yield sse({"type": "error", "code": error_code})

    return stream()
