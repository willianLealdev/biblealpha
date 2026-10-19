"""Plano do usuário (free ou pro)."""

import uuid
from datetime import UTC, datetime

from sqlalchemy import and_, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Subscription


async def active_subscription(db: AsyncSession, user_id: uuid.UUID) -> Subscription | None:
    now = datetime.now(UTC)
    return await db.scalar(
        select(Subscription)
        .where(
            Subscription.user_id == user_id,
            Subscription.plan == "pro",
            or_(
                and_(
                    Subscription.status.in_(("active", "trialing", "past_due")),
                    or_(Subscription.current_period_end.is_(None), Subscription.current_period_end > now),
                ),
                # Cancelou: continua valendo até o fim do período que já pagou
                and_(Subscription.status == "canceled", Subscription.current_period_end > now),
            ),
        )
        .order_by(Subscription.created_at.desc())
        .limit(1)
    )


async def get_plan(db: AsyncSession, user_id: uuid.UUID) -> str:
    return "pro" if await active_subscription(db, user_id) else "free"
