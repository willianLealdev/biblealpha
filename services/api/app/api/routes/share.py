"""Imagem de versículo para compartilhar no feed ou no story (Instagram, WhatsApp etc.)."""

import base64
import binascii
import uuid
from typing import Literal

from fastapi import APIRouter, Depends, Response
from fastapi.concurrency import run_in_threadpool
from PIL import UnidentifiedImageError
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import CurrentUser, current_user
from app.core import ratelimit
from app.core.errors import AppError
from app.db.session import get_db
from app.models import SlideBackground
from app.share.render import PRESETS, render

router = APIRouter(prefix="/share", tags=["share"])

MAX_PHOTO = 8 * 1024 * 1024


class VerseImageIn(BaseModel):
    text: str = Field(min_length=1, max_length=1500)
    reference: str = Field(min_length=1, max_length=120)
    format: Literal["feed", "story"] = "feed"
    preset: str | None = Field(None, max_length=20)
    # Fundo da biblioteca de fundos da pessoa (telão)
    library_id: uuid.UUID | None = None
    # Foto escolhida pela pessoa, em base64 (não é guardada)
    photo: str | None = Field(None, max_length=MAX_PHOTO * 4 // 3 + 16)


@router.get("/presets")
async def presets() -> dict:
    return {"presets": [{"id": k, "colors": list(v)} for k, v in PRESETS.items()]}


@router.post("/verse-image")
async def verse_image(
    body: VerseImageIn, cu: CurrentUser = Depends(current_user), db: AsyncSession = Depends(get_db)
) -> Response:
    await ratelimit.hit(f"share-image:{cu.user.id}", limit=60, window_seconds=600)
    photo: bytes | None = None
    if body.photo:
        try:
            photo = base64.b64decode(body.photo.split(",", 1)[-1], validate=True)
        except (binascii.Error, ValueError):
            raise AppError(400, "invalid_image", "Invalid image") from None
        if len(photo) > MAX_PHOTO:
            raise AppError(413, "image_too_large", "Image too large")
    elif body.library_id:
        bg = await db.get(SlideBackground, body.library_id)
        if bg is None or bg.user_id != cu.user.id or bg.data is None:
            raise AppError(404, "image_not_found", "Image not found")
        photo = bg.data
    try:
        jpeg = await run_in_threadpool(
            render, body.text, body.reference, body.format, preset=body.preset, photo=photo
        )
    except (UnidentifiedImageError, OSError):
        raise AppError(400, "invalid_image", "Invalid image") from None
    return Response(jpeg, media_type="image/jpeg", headers={"Cache-Control": "no-store"})
