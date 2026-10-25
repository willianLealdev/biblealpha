"""Capas da página Aprender: desenhadas pela IA de imagem e guardadas no banco.

O servidor gera sozinho as que faltam (ver `ensure_auto_covers`): quando um plano novo entra no catálogo,
a capa dele aparece sem ninguém precisar pedir. O admin ainda pode refazer qualquer uma.

As capas ficam na tabela `visual_images` com `book = "LRN"` e a chave no começo do prompt
("[book:GEN] ..."), para não precisar de tabela nova."""

import asyncio
import base64
import logging
import time

import httpx
from sqlalchemy import delete, select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.ai import service as ai_service
from app.ai.provider import Completion, Usage
from app.core.config import get_settings
from app.core.errors import AppError
from app.db.session import get_sessionmaker
from app.learn.catalog import all_keys, cover_prompt
from app.models import User, VisualImage
from app.services import secrets
from app.services.settings import get_setting

log = logging.getLogger("biblealpha.learn")
BOOK = "LRN"
SIZE = "1024x1536"  # retrato, como pôster
# Regra do sistema: toda imagem gerada é em qualidade média (no tamanho do app fica igual e custa 1/4)
QUALITY = "medium"


def _tag(key: str) -> str:
    return f"[{key}] "


async def cover_keys(db: AsyncSession) -> dict[str, str]:
    """Chave → id da imagem, para todas as capas já geradas."""
    rows = await db.execute(select(VisualImage.id, VisualImage.prompt).where(VisualImage.book == BOOK))
    out: dict[str, str] = {}
    for image_id, prompt in rows:
        if prompt.startswith("[") and "] " in prompt:
            out[prompt[1 : prompt.index("] ")]] = str(image_id)
    return out


async def generate_cover(db: AsyncSession, key: str, admin: User | None) -> str:
    prompt = cover_prompt(key)
    if prompt is None:
        raise AppError(404, "cover_not_found", "Unknown cover")
    api_key = secrets.get("openai_api_key")
    if not api_key:
        raise AppError(503, "images_unavailable", "Image generation is not configured")
    cfg = await get_setting(db, "visual.images")
    body = {
        "model": cfg["model"],
        "prompt": prompt,
        "size": SIZE,
        "quality": QUALITY,
        "n": 1,
        "output_format": "webp",
        "output_compression": 82,
    }
    try:
        async with httpx.AsyncClient(timeout=240) as client:
            r = await client.post(
                "https://api.openai.com/v1/images/generations",
                headers={"Authorization": f"Bearer {api_key}"},
                json=body,
            )
            r.raise_for_status()
            data = r.json()
            raw = base64.b64decode(data["data"][0]["b64_json"])
    except (httpx.HTTPError, KeyError, IndexError, ValueError) as e:
        log.error("capa %s falhou: %s", key, str(e)[:200])
        raise AppError(502, "image_failed", "Image generation failed") from None
    usage = data.get("usage") or {}
    await ai_service.record_usage(
        db,
        user_id=admin.id if admin else None,
        plan="admin" if admin else "system",
        feature="learn_cover",
        provider="openai",
        completion=Completion(
            model=cfg["model"],
            usage=Usage(
                input_tokens=int(usage.get("input_tokens") or 0),
                output_tokens=int(usage.get("output_tokens") or 0),
            ),
        ),
        status="ok",
    )
    # Uma capa por chave: a nova substitui a antiga
    await db.execute(
        delete(VisualImage).where(VisualImage.book == BOOK, VisualImage.prompt.startswith(_tag(key)))
    )
    image = VisualImage(
        book=BOOK,
        chapter=0,
        position=0,
        prompt=_tag(key) + prompt,
        mime="image/webp",
        data=raw,
        model=cfg["model"],
    )
    db.add(image)
    await db.commit()
    return str(image.id)


async def delete_cover(db: AsyncSession, key: str) -> None:
    await db.execute(
        delete(VisualImage).where(VisualImage.book == BOOK, VisualImage.prompt.startswith(_tag(key)))
    )
    await db.commit()


# ---------- Geração automática ----------

_task: asyncio.Task | None = None
_paused_until = 0.0
LOCK_ID = 7_301_224  # trava do Postgres: só um processo da API desenha por vez


async def missing_keys(db: AsyncSession) -> list[str]:
    done = await cover_keys(db)
    return [k for k in all_keys() if k not in done]


async def _auto_covers() -> None:
    """Desenha as capas que faltam, uma por vez. Para se der erro (tenta de novo mais tarde)."""
    global _paused_until
    async with get_sessionmaker()() as db:
        conn = await db.connection()
        if not await conn.scalar(text(f"SELECT pg_try_advisory_lock({LOCK_ID})")):
            return
        try:
            while secrets.get("openai_api_key"):
                missing = await missing_keys(db)
                if not missing:
                    return
                log.info("capa automática: %s (faltam %d)", missing[0], len(missing))
                try:
                    await generate_cover(db, missing[0], None)
                except AppError:
                    _paused_until = time.monotonic() + 30 * 60
                    return
                await asyncio.sleep(1)
        finally:
            await conn.execute(text(f"SELECT pg_advisory_unlock({LOCK_ID})"))
            await db.commit()


def ensure_auto_covers() -> None:
    """Liga a geração automática em segundo plano (uma vez por processo). Só no site no ar: no computador
    de desenvolvimento e nos testes as capas não são desenhadas sozinhas (custariam à toa)."""
    global _task
    if get_settings().env not in ("production", "staging") or not secrets.get("openai_api_key"):
        return
    if (_task and not _task.done()) or time.monotonic() < _paused_until:
        return
    _task = asyncio.create_task(_auto_covers())
