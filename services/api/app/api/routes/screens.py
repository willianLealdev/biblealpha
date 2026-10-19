"""Telão da igreja: a tela no computador mostra um QR code; o pregador conecta pelo app e escolhe
o que aparece. A tela mostra só o texto enviado (sem o título da ministração) sobre o fundo criado pela IA."""

import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, Header, Response
from pydantic import BaseModel, StringConstraints
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import CurrentUser, current_user, request_meta
from app.core import ratelimit
from app.core.config import get_settings
from app.core.errors import AppError
from app.db.session import get_db
from app.models import ScreenSession, Sermon, SlideBackground
from app.screens import service
from app.services.audit import RequestMeta

router = APIRouter(prefix="/screens", tags=["screens"])


def _state(s: ScreenSession, bg: SlideBackground | None) -> dict:
    ended = s.ended_at is not None or s.expires_at < service._now()
    return {
        "id": str(s.id),
        "code": s.code,
        "status": "ended" if ended else "paired" if s.user_id else "waiting",
        "version": s.version,
        "slide": None if ended else s.slide,
        "background": service.background_out(bg),
    }


async def _own_sermon(db: AsyncSession, cu: CurrentUser, sermon_id: uuid.UUID) -> Sermon:
    s = await db.get(Sermon, sermon_id)
    if s is None or s.user_id != cu.user.id or s.deleted_at is not None:
        raise AppError(404, "sermon_not_found", "Sermon not found")
    return s


@router.post("", status_code=201)
async def open_screen(db: AsyncSession = Depends(get_db), meta: RequestMeta = Depends(request_meta)) -> dict:
    """Abre uma tela nova (sem login: é o computador ou telão da igreja)."""
    await ratelimit.hit(f"screen-open:{meta.ip}", limit=20, window_seconds=600)
    s, token = await service.create(db)
    pair_url = f"{get_settings().app_url.rstrip('/')}/pair?code={s.code}"
    return {**_state(s, None), "token": token, "pair_url": pair_url}


@router.get("/{screen_id}/state")
async def screen_state(
    screen_id: uuid.UUID,
    x_screen_token: Annotated[str | None, Header()] = None,
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Lido pela tela a cada segundo."""
    s = await service.for_display(db, screen_id, x_screen_token)
    return _state(s, await service.latest_background(db, s.sermon_id))


@router.get("/backgrounds/{background_id}")
async def background_image(background_id: uuid.UUID, db: AsyncSession = Depends(get_db)) -> Response:
    bg = await db.get(SlideBackground, background_id)
    if bg is None or bg.data is None:
        raise AppError(404, "image_not_found", "Image not found")
    return Response(
        bg.data,
        media_type=bg.mime or "image/webp",
        headers={"Cache-Control": "public, max-age=31536000, immutable"},
    )


class CodeIn(BaseModel):
    code: Annotated[str, StringConstraints(strip_whitespace=True, min_length=4, max_length=300)]


@router.post("/check")
async def check_code(
    body: CodeIn, cu: CurrentUser = Depends(current_user), db: AsyncSession = Depends(get_db)
) -> dict:
    """Confere o código lido/digitado antes de a pessoa escolher a ministração."""
    await ratelimit.hit(f"screen-check:{cu.user.id}", limit=20, window_seconds=600)
    s = await service.find_open(db, body.code)
    if s is None or (s.user_id is not None and s.user_id != cu.user.id):
        raise AppError(404, "screen_not_found", "Screen not found")
    return {"code": s.code}


class PairIn(BaseModel):
    code: Annotated[str, StringConstraints(strip_whitespace=True, min_length=4, max_length=300)]
    # Opcional: a conexão vale para todas as ministrações; esta só define o fundo inicial
    sermon_id: uuid.UUID | None = None


@router.post("/pair")
async def pair(
    body: PairIn, cu: CurrentUser = Depends(current_user), db: AsyncSession = Depends(get_db)
) -> dict:
    # Poucas tentativas: o código é curto
    await ratelimit.hit(f"screen-pair:{cu.user.id}", limit=10, window_seconds=600)
    sermon = await _own_sermon(db, cu, body.sermon_id) if body.sermon_id else None
    s = await service.pair(db, cu.user, body.code, sermon)
    bg = await service.latest_background(db, s.sermon_id)
    return {**_state(s, bg), **await service.allowance(db, cu.user)}


class SermonIn(BaseModel):
    sermon_id: uuid.UUID


@router.put("/{screen_id}/sermon")
async def use_sermon(
    screen_id: uuid.UUID,
    body: SermonIn,
    cu: CurrentUser = Depends(current_user),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """A tela já conectada passa a acompanhar outra ministração do pregador."""
    await ratelimit.hit(f"screen-sermon:{cu.user.id}", limit=60, window_seconds=60)
    s = await service.owned(db, screen_id, cu.user)
    sermon = await _own_sermon(db, cu, body.sermon_id)
    s = await service.use_sermon(db, s, sermon)
    bg = await service.latest_background(db, sermon.id)
    return {**_state(s, bg), **await service.allowance(db, cu.user)}


class SlideIn(BaseModel):
    text: Annotated[str, StringConstraints(strip_whitespace=True, max_length=4000)] = ""
    reference: Annotated[str, StringConstraints(strip_whitespace=True, max_length=120)] | None = None


@router.put("/{screen_id}/slide")
async def show_slide(
    screen_id: uuid.UUID,
    body: SlideIn,
    cu: CurrentUser = Depends(current_user),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Mostra um texto na tela (texto vazio: só o fundo)."""
    await ratelimit.hit(f"screen-slide:{cu.user.id}", limit=120, window_seconds=60)
    s = await service.owned(db, screen_id, cu.user)
    slide = {"text": body.text, "reference": body.reference or None} if body.text else None
    s = await service.show(db, s, slide)
    return _state(s, await service.latest_background(db, s.sermon_id))


@router.post("/{screen_id}/background")
async def new_background(
    screen_id: uuid.UUID, cu: CurrentUser = Depends(current_user), db: AsyncSession = Depends(get_db)
) -> dict:
    """A IA cria (ou troca) o fundo dos slides desta ministração."""
    if "admin" not in cu.user.role_names:
        await ratelimit.hit(f"screen-bg:{cu.user.id}", limit=5, window_seconds=600)
    s = await service.owned(db, screen_id, cu.user)
    sermon = await _own_sermon(db, cu, s.sermon_id) if s.sermon_id else None
    if sermon is None:
        raise AppError(404, "sermon_not_found", "Sermon not found")
    bg = await service.generate_background(db, cu.user, sermon)
    s = await service.show(db, s, s.slide)  # a tela redesenha com o fundo novo
    return {**_state(s, bg), **await service.allowance(db, cu.user)}


@router.delete("/{screen_id}", status_code=204)
async def end_screen(
    screen_id: uuid.UUID, cu: CurrentUser = Depends(current_user), db: AsyncSession = Depends(get_db)
) -> Response:
    s = await service.owned(db, screen_id, cu.user)
    s.ended_at = service._now()
    s.version += 1
    await db.commit()
    return Response(status_code=204)
