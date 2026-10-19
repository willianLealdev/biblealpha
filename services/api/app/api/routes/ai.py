"""IA para o usuário: perguntar sobre uma passagem, conversas e avaliação das respostas.
Nenhuma rota daqui expõe custos ou tokens."""

import uuid
from datetime import UTC, datetime
from typing import Annotated, Literal

from fastapi import APIRouter, Depends, Response, status
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field, StringConstraints
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.ai import service as ai_service
from app.ai.prompts import MODES
from app.ai.quiz import make_quiz
from app.api.deps import CurrentUser, current_user
from app.core import ratelimit
from app.core.errors import AppError
from app.db.session import get_db
from app.models import AIConversation, AIMessage
from app.services.plans import get_plan
from app.services.settings import get_setting

router = APIRouter(prefix="/ai", tags=["ai"])

Mode = Literal[tuple(MODES)]  # type: ignore[valid-type]
ADMIN_ONLY_MODES = ("sermon",)


class AskIn(BaseModel):
    translation: str = Field(min_length=1, max_length=20)
    mode: Mode = "simple"  # type: ignore[valid-type]
    question: Annotated[str, StringConstraints(strip_whitespace=True, max_length=2000)] | None = None
    verse_key_start: int | None = Field(None, ge=1_001_000, le=66_999_999)
    verse_key_end: int | None = Field(None, ge=1_001_000, le=66_999_999)
    conversation_id: uuid.UUID | None = None


@router.post("/ask")
async def ask(body: AskIn, cu: CurrentUser = Depends(current_user), db: AsyncSession = Depends(get_db)):
    # "Para pregação" produz material para ministrar: só o administrador
    if body.mode in ADMIN_ONLY_MODES and "admin" not in cu.user.role_names:
        raise AppError(403, "admin_only", "This mode is not available")
    await ratelimit.hit(f"ai:{cu.user.id}", limit=20, window_seconds=60)
    stream = await ai_service.ask(
        db,
        cu.user,
        ai_service.AskInput(
            translation=body.translation,
            mode=body.mode,
            question=body.question or None,
            verse_key_start=body.verse_key_start,
            verse_key_end=body.verse_key_end,
            conversation_id=body.conversation_id,
        ),
    )
    return StreamingResponse(
        stream,
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


class QuizIn(BaseModel):
    translation: str = Field(min_length=1, max_length=20)
    verse_key_start: int = Field(ge=1_001_001, le=66_999_999)
    verse_key_end: int | None = Field(None, ge=1_001_001, le=66_999_999)
    count: int = Field(5, ge=3, le=10)


@router.post("/quiz")
async def quiz(
    body: QuizIn, cu: CurrentUser = Depends(current_user), db: AsyncSession = Depends(get_db)
) -> dict:
    """Professor com IA: perguntas de compreensão sobre a passagem (conta na cota do modo gratuito)."""
    end = body.verse_key_end or body.verse_key_start
    if end < body.verse_key_start or end - body.verse_key_start > 80:
        raise AppError(422, "passage_too_long", "Select a shorter passage")
    return await make_quiz(db, cu.user, body.translation, body.verse_key_start, end, body.count)


@router.get("/status")
async def ai_status(cu: CurrentUser = Depends(current_user), db: AsyncSession = Depends(get_db)) -> dict:
    """O que o app precisa saber para a tela de IA: plano e quantas perguntas restam (só no Free)."""
    plan = await get_plan(db, cu.user.id)
    enabled = (await get_setting(db, "ai.enabled")).get("value", True)
    is_admin = "admin" in cu.user.role_names
    modes = [m for m in MODES if is_admin or m not in ADMIN_ONLY_MODES]
    out: dict = {"plan": plan, "enabled": enabled, "modes": modes}
    if plan == "free":
        quotas = await get_setting(db, "ai.quotas")
        now = datetime.now(UTC)
        used = await ai_service._user_requests_since(db, cu.user.id, ai_service._day_start(now))
        out["free_remaining_today"] = max(0, int(quotas["free_daily"]) - used)
    return out


def _conversation_out(c: AIConversation) -> dict:
    return {
        "id": str(c.id),
        "title": c.title,
        "translation": c.translation_code,
        "verse_key_start": c.verse_key_start,
        "verse_key_end": c.verse_key_end,
        "mode": c.mode,
        "saved": c.saved,
        "updated_at": c.updated_at.isoformat(),
    }


@router.get("/conversations")
async def list_conversations(
    saved: bool | None = None, cu: CurrentUser = Depends(current_user), db: AsyncSession = Depends(get_db)
) -> dict:
    stmt = select(AIConversation).where(AIConversation.user_id == cu.user.id)
    if saved is not None:
        stmt = stmt.where(AIConversation.saved.is_(saved))
    rows = await db.scalars(stmt.order_by(AIConversation.updated_at.desc()).limit(100))
    return {"conversations": [_conversation_out(c) for c in rows]}


async def _own(db: AsyncSession, cu: CurrentUser, conversation_id: uuid.UUID) -> AIConversation:
    c = await db.get(AIConversation, conversation_id)
    if c is None or c.user_id != cu.user.id:
        raise AppError(404, "conversation_not_found", "Conversation not found")
    return c


@router.get("/conversations/{conversation_id}")
async def get_conversation(
    conversation_id: uuid.UUID, cu: CurrentUser = Depends(current_user), db: AsyncSession = Depends(get_db)
) -> dict:
    c = await _own(db, cu, conversation_id)
    messages = await db.scalars(
        select(AIMessage).where(AIMessage.conversation_id == c.id).order_by(AIMessage.created_at)
    )
    return {
        **_conversation_out(c),
        "messages": [
            {
                "id": str(m.id),
                "role": m.role,
                "content": m.content,
                "invalid_references": m.invalid_references,
                "feedback": m.feedback,
                "created_at": m.created_at.isoformat(),
            }
            for m in messages
        ],
    }


class ConversationPatch(BaseModel):
    saved: bool | None = None
    title: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=200)] | None = (
        None
    )


@router.patch("/conversations/{conversation_id}")
async def update_conversation(
    conversation_id: uuid.UUID,
    body: ConversationPatch,
    cu: CurrentUser = Depends(current_user),
    db: AsyncSession = Depends(get_db),
) -> dict:
    c = await _own(db, cu, conversation_id)
    if body.saved is not None:
        c.saved = body.saved
    if body.title:
        c.title = body.title
    await db.commit()
    await db.refresh(c)
    return _conversation_out(c)


@router.delete("/conversations/{conversation_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_conversation(
    conversation_id: uuid.UUID, cu: CurrentUser = Depends(current_user), db: AsyncSession = Depends(get_db)
) -> Response:
    c = await _own(db, cu, conversation_id)
    await db.execute(delete(AIConversation).where(AIConversation.id == c.id))
    await db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


class FeedbackIn(BaseModel):
    value: Literal[1, -1, 0]


@router.post("/messages/{message_id}/feedback")
async def feedback(
    message_id: uuid.UUID,
    body: FeedbackIn,
    cu: CurrentUser = Depends(current_user),
    db: AsyncSession = Depends(get_db),
) -> dict:
    m = await db.get(AIMessage, message_id)
    c = await db.get(AIConversation, m.conversation_id) if m else None
    if m is None or c is None or c.user_id != cu.user.id or m.role != "assistant":
        raise AppError(404, "message_not_found", "Message not found")
    m.feedback = body.value or None
    await db.commit()
    return {"feedback": m.feedback}
