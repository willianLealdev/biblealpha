"""Página Aprender (estilo Netflix): capas dos livros e dos planos. Gerar e apagar capas é só do admin."""

import uuid

from fastapi import APIRouter, Depends, Response
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import CurrentUser, require_role
from app.core.errors import AppError
from app.db.session import get_db
from app.learn import service
from app.learn.catalog import all_keys
from app.models import VisualImage

router = APIRouter(tags=["learn"])
admin_only = require_role("admin")


@router.get("/learn/covers")
async def covers(response: Response, db: AsyncSession = Depends(get_db)) -> dict:
    """Chave da capa → id da imagem (o id muda quando a capa é refeita; a imagem fica em cache)."""
    response.headers["Cache-Control"] = "public, max-age=120"
    covers = await service.cover_keys(db)
    # Faltou capa (por exemplo, um plano novo)? O servidor começa a desenhar sozinho.
    if len(covers) < len(all_keys()):
        service.ensure_auto_covers()
    return {"covers": covers}


@router.get("/learn/covers/image/{image_id}")
async def cover_image(image_id: uuid.UUID, db: AsyncSession = Depends(get_db)) -> Response:
    image = await db.get(VisualImage, image_id)
    if image is None or image.book != service.BOOK:
        raise AppError(404, "image_not_found", "Image not found")
    return Response(
        image.data, media_type=image.mime, headers={"Cache-Control": "public, max-age=31536000, immutable"}
    )


@router.get("/admin/learn/covers")
async def admin_covers(_: CurrentUser = Depends(admin_only), db: AsyncSession = Depends(get_db)) -> dict:
    done = await service.cover_keys(db)
    service.ensure_auto_covers()
    return {"items": [{"key": k, "image_id": done.get(k)} for k in all_keys()]}


@router.post("/admin/learn/covers/{key}")
async def generate(
    key: str, cu: CurrentUser = Depends(admin_only), db: AsyncSession = Depends(get_db)
) -> dict:
    """Gera (ou refaz) uma capa. Uma por vez: o painel chama em sequência para gerar as que faltam."""
    return {"key": key, "image_id": await service.generate_cover(db, key, cu.user)}


@router.delete("/admin/learn/covers/{key}", status_code=204)
async def remove(key: str, _: CurrentUser = Depends(admin_only), db: AsyncSession = Depends(get_db)) -> None:
    await service.delete_cover(db, key)
