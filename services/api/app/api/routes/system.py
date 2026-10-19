from fastapi import APIRouter, Depends
from sqlalchemy import func, select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import CurrentUser, require_role
from app.core.config import get_settings
from app.db.session import get_db
from app.models import User

router = APIRouter(tags=["system"])


@router.get("/health")
async def health(db: AsyncSession = Depends(get_db)) -> dict:
    await db.execute(text("SELECT 1"))
    return {"status": "ok", "env": get_settings().env}


@router.get("/admin/overview")
async def admin_overview(
    _: CurrentUser = Depends(require_role("admin")), db: AsyncSession = Depends(get_db)
) -> dict:
    """Primeiro endpoint administrativo: só números agregados, nunca conteúdo de usuários."""
    total = await db.scalar(select(func.count()).select_from(User).where(User.deleted_at.is_(None)))
    verified = await db.scalar(
        select(func.count())
        .select_from(User)
        .where(User.deleted_at.is_(None), User.email_verified_at.is_not(None))
    )
    return {"users": {"total": total, "verified": verified}}
