from datetime import UTC, datetime, timedelta

from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import CurrentUser, current_user
from app.bible.books import by_code, by_id
from app.core import ratelimit
from app.core.errors import AppError
from app.db.session import get_db
from app.models import ReadingHistory, ReadingProgress
from app.services import sync as sync_service

router = APIRouter(tags=["study"])


@router.post("/sync")
async def sync(
    body: sync_service.SyncIn, cu: CurrentUser = Depends(current_user), db: AsyncSession = Depends(get_db)
) -> dict:
    await ratelimit.hit(f"sync:{cu.user.id}", limit=120, window_seconds=60)
    sync_service.require_sane_batch(body)
    return await sync_service.sync(db, cu.user, body)


class ProgressIn(BaseModel):
    translation_code: str = Field(min_length=1, max_length=20)
    book: str = Field(min_length=3, max_length=3)
    chapter: int = Field(ge=1, le=150)
    verse: int | None = Field(None, ge=1, le=200)


def _progress_out(p: ReadingProgress | None) -> dict | None:
    if p is None:
        return None
    return {
        "translation_code": p.translation_code,
        "book": by_id()[p.book_id].code,
        "chapter": p.chapter,
        "verse": p.verse,
        "updated_at": p.updated_at.isoformat() if p.updated_at else None,
    }


@router.get("/me/reading-progress")
async def get_progress(cu: CurrentUser = Depends(current_user), db: AsyncSession = Depends(get_db)) -> dict:
    return {"progress": _progress_out(await db.get(ReadingProgress, cu.user.id))}


@router.put("/me/reading-progress")
async def put_progress(
    body: ProgressIn, cu: CurrentUser = Depends(current_user), db: AsyncSession = Depends(get_db)
) -> dict:
    book = by_code().get(body.book.upper())
    if book is None or body.chapter > book.chapters:
        raise AppError(422, "invalid_reference", "Invalid book or chapter")
    now = datetime.now(UTC)
    progress = await db.get(ReadingProgress, cu.user.id)
    if progress is None:
        progress = ReadingProgress(
            user_id=cu.user.id, translation_code=body.translation_code, book_id=book.id, chapter=body.chapter
        )
        db.add(progress)
    progress.translation_code = body.translation_code
    progress.book_id, progress.chapter, progress.verse, progress.updated_at = (
        book.id,
        body.chapter,
        body.verse,
        now,
    )

    # Histórico: um registro por capítulo por dia
    recent = await db.scalar(
        select(ReadingHistory.id).where(
            ReadingHistory.user_id == cu.user.id,
            ReadingHistory.book_id == book.id,
            ReadingHistory.chapter == body.chapter,
            ReadingHistory.read_on > now - timedelta(hours=24),
        )
    )
    if recent is None:
        db.add(ReadingHistory(user_id=cu.user.id, book_id=book.id, chapter=body.chapter, read_on=now))
    await db.commit()
    return {"progress": _progress_out(progress)}


@router.get("/me/reading-history")
async def reading_history(
    cu: CurrentUser = Depends(current_user), db: AsyncSession = Depends(get_db)
) -> dict:
    rows = await db.scalars(
        select(ReadingHistory)
        .where(ReadingHistory.user_id == cu.user.id)
        .order_by(ReadingHistory.read_on.desc())
        .limit(100)
    )
    return {
        "history": [
            {"book": by_id()[r.book_id].code, "chapter": r.chapter, "read_on": r.read_on.isoformat()}
            for r in rows
        ]
    }
