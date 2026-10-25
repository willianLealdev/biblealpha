"""Estudo visual do capítulo: ver (grátis, se já existir), gerar (cota) e ilustrações."""

import uuid

from fastapi import APIRouter, Depends, Response
from sqlalchemy import delete
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import CurrentUser, current_user, require_role
from app.core import ratelimit
from app.core.errors import AppError
from app.db.session import get_db
from app.devotional.service import BASE_LOCALE, devotional_locale
from app.models import VisualImage, VisualStudy
from app.services import bible as bible_service
from app.visual import service

router = APIRouter(prefix="/visual", tags=["visual"])


def _out(row: VisualStudy) -> dict:
    return {"book": row.book, "chapter": row.chapter, "locale": row.locale, "content": row.content}


@router.get("/images/{image_id}")
async def image(image_id: uuid.UUID, db: AsyncSession = Depends(get_db)) -> Response:
    row = await db.get(VisualImage, image_id)
    if row is None:
        raise AppError(404, "image_not_found", "Image not found")
    return Response(
        row.data, media_type=row.mime, headers={"Cache-Control": "public, max-age=31536000, immutable"}
    )


@router.get("/{book}/{chapter}")
async def get_study(
    book: str, chapter: int, cu: CurrentUser = Depends(current_user), db: AsyncSession = Depends(get_db)
) -> dict:
    """Estudo já gerado (no idioma do usuário; se só existir em português, é traduzido agora)."""
    b = bible_service.resolve_book_param(book)
    locale = await devotional_locale(db, cu.user.locale)
    row = await service.find(db, b, chapter, locale)
    if row is None:
        base = await service.find(db, b, chapter, BASE_LOCALE)
        if base is not None:
            row = await service.translated(db, base, locale)
    allowance = await service.allowance(db, cu.user)
    if row is None:
        return {"status": "none", **allowance}
    return {"status": "ready", **allowance, "study": _out(row)}


@router.post("/{book}/{chapter}")
async def create_study(
    book: str, chapter: int, cu: CurrentUser = Depends(current_user), db: AsyncSession = Depends(get_db)
) -> dict:
    """Gera o estudo do capítulo (conta na cota de estudos visuais; depois fica para todos)."""
    if "admin" not in cu.user.role_names:
        await ratelimit.hit(f"visual:{cu.user.id}", limit=5, window_seconds=600)
    b = bible_service.resolve_book_param(book)
    row = await service.generate(db, cu.user, b, chapter, cu.user.locale)
    return {"status": "ready", **(await service.allowance(db, cu.user)), "study": _out(row)}


@router.post("/{book}/{chapter}/mind-map")
async def create_mind_map(
    book: str, chapter: int, cu: CurrentUser = Depends(current_user), db: AsyncSession = Depends(get_db)
) -> dict:
    """Mapa mental para um estudo que já existe (feito uma vez por idioma; depois fica para todos)."""
    if "admin" not in cu.user.role_names:
        await ratelimit.hit(f"mindmap:{cu.user.id}", limit=5, window_seconds=600)
    b = bible_service.resolve_book_param(book)
    locale = await devotional_locale(db, cu.user.locale)
    row = await service.find(db, b, chapter, locale) or await service.find(db, b, chapter, BASE_LOCALE)
    if row is None:
        raise AppError(404, "study_not_found", "Generate the visual study first")
    row = await service.add_mind_map(db, cu.user, row)
    return {"status": "ready", **(await service.allowance(db, cu.user)), "study": _out(row)}


@router.delete("/{book}/{chapter}")
async def reset_study(
    book: str,
    chapter: int,
    _: CurrentUser = Depends(require_role("admin")),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Admin: apaga o estudo do capítulo (todos os idiomas) para gerar de novo."""
    b = bible_service.resolve_book_param(book)
    await db.execute(delete(VisualStudy).where(VisualStudy.book == b.code, VisualStudy.chapter == chapter))
    await db.execute(delete(VisualImage).where(VisualImage.book == b.code, VisualImage.chapter == chapter))
    await db.commit()
    return {"ok": True}
