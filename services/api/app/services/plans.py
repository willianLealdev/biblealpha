"""Plano do usuário (free ou pro)."""

import uuid
from datetime import UTC, datetime

from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Subscription


async def active_subscription(db: AsyncSession, user_id: uuid.UUID) -> Subscription | None:
    now = datetime.now(UTC)
    return await db.scalar(
        select(Subscription)
        .where(
            Subscription.user_id == user_id,
            Subscription.plan == "pro",
            Subscription.status.in_(("active", "past_due")),
            or_(Subscription.current_period_end.is_(None), Subscription.current_period_end > now),
        )
        .order_by(Subscription.created_at.desc())
        .limit(1)
    )


async def get_plan(db: AsyncSession, user_id: uuid.UUID) -> str:
    return "pro" if await active_subscription(db, user_id) else "free"
