"""Painel do administrador: custos de IA (total e por usuário), configurações e cortesias Pro.

Só administradores (RBAC). Mostra metadados de uso; nunca o conteúdo de perguntas, respostas,
anotações ou ministrações dos usuários."""

import uuid
from datetime import UTC, date, datetime, timedelta
from decimal import Decimal
from typing import Annotated, Literal

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel, EmailStr, Field
from sqlalchemy import Date, Integer, and_, cast, distinct, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import CurrentUser, require_role
from app.core.errors import AppError
from app.db.session import get_db
from app.models import AIModelPrice, AIUsage, PaymentEvent, PlanPrice, Subscription, User
from app.services import audit
from app.services.plans import active_subscription
from app.services.settings import get_setting, set_setting

router = APIRouter(prefix="/admin", tags=["admin"])
admin_only = require_role("admin")

KNOWN_MODELS = (
    "claude-opus-5-5",
    "claude-sonnet-5-5",
    "claude-haiku-5-5",
    "claude-fable-5-1",
    "deepseek-flash",
    "deepseek-v4-pro",
)


def _now() -> datetime:
    return datetime.now(UTC)


def _day(now: datetime) -> datetime:
    return now.replace(hour=0, minute=0, second=0, microsecond=0)


def _money(v) -> float:
    return float(round(Decimal(v or 0), 4))


async def _totals(db: AsyncSession, since: datetime | None) -> dict:
    stmt = select(
        func.coalesce(func.sum(AIUsage.cost_usd), 0),
        func.coalesce(func.sum(AIUsage.cost_brl), 0),
        func.count(),
        func.count(distinct(AIUsage.user_id)),
    )
    if since:
        stmt = stmt.where(AIUsage.created_at >= since)
    usd, brl, n, users = (await db.execute(stmt)).one()
    return {"cost_usd": _money(usd), "cost_brl": _money(brl), "requests": n, "users": users}


async def _group(db: AsyncSession, column, since: datetime) -> list[dict]:
    rows = await db.execute(
        select(column, func.sum(AIUsage.cost_usd), func.sum(AIUsage.cost_brl), func.count())
        .where(AIUsage.created_at >= since)
        .group_by(column)
        .order_by(func.sum(AIUsage.cost_usd).desc())
    )
    return [{"key": k, "cost_usd": _money(u), "cost_brl": _money(b), "requests": n} for k, u, b, n in rows]


async def _donations(db: AsyncSession, since: datetime) -> dict:
    """Ofertas avulsas pagas no período (checkout do Stripe em modo "payment")."""
    payload = PaymentEvent.payload
    currency = func.upper(payload["currency"].astext).label("currency")
    rows = await db.execute(
        select(
            currency,
            func.count(),
            func.coalesce(func.sum(cast(payload["amount_total"].astext, Integer)), 0),
        )
        .where(
            PaymentEvent.event_type == "checkout.session.completed",
            PaymentEvent.created_at >= since,
            payload["mode"].astext == "payment",
            payload["payment_status"].astext == "paid",
        )
        .group_by(currency)
    )
    by_currency = [{"currency": c, "count": n, "amount": cents / 100} for c, n, cents in rows]
    return {"count": sum(x["count"] for x in by_currency), "by_currency": by_currency}


@router.get("/ai/overview")
async def ai_overview(_: CurrentUser = Depends(admin_only), db: AsyncSession = Depends(get_db)) -> dict:
    now = _now()
    today, month = _day(now), _day(now).replace(day=1)
    budget = await get_setting(db, "ai.budget")

    daily = await db.execute(
        select(
            cast(AIUsage.created_at, Date),
            func.sum(AIUsage.cost_usd),
            func.sum(AIUsage.cost_brl),
            func.count(),
        )
        .where(AIUsage.created_at >= today - timedelta(days=29))
        .group_by(cast(AIUsage.created_at, Date))
        .order_by(cast(AIUsage.created_at, Date))
    )

    # Economia do Pro: custo médio por assinante no mês × preço atual
    pro_subscribers = await db.scalar(
        select(func.count(distinct(Subscription.user_id))).where(
            Subscription.plan == "pro", Subscription.status.in_(("active", "past_due"))
        )
    )
    pro_cost_brl = await db.scalar(
        select(func.coalesce(func.sum(AIUsage.cost_brl), 0)).where(
            AIUsage.created_at >= month, AIUsage.plan == "pro"
        )
    )
    free_users = await db.scalar(
        select(func.count(distinct(AIUsage.user_id))).where(
            AIUsage.created_at >= month, AIUsage.plan == "free"
        )
    )
    free_cost_brl = await db.scalar(
        select(func.coalesce(func.sum(AIUsage.cost_brl), 0)).where(
            AIUsage.created_at >= month, AIUsage.plan == "free"
        )
    )
    price = await db.scalar(
        select(PlanPrice).where(
            PlanPrice.plan == "pro",
            PlanPrice.is_current.is_(True),
            PlanPrice.interval == "month",
            PlanPrice.currency == "BRL",
        )
    )
    avg_pro = Decimal(pro_cost_brl or 0) / pro_subscribers if pro_subscribers else None
    today_totals = await _totals(db, today)
    return {
        "today": today_totals,
        "month": await _totals(db, month),
        "all_time": await _totals(db, None),
        "by_feature": await _group(db, AIUsage.feature, month),
        "by_model": await _group(db, AIUsage.model, month),
        "by_plan": await _group(db, AIUsage.plan, month),
        "daily": [
            {"date": d.isoformat(), "cost_usd": _money(u), "cost_brl": _money(b), "requests": n}
            for d, u, b, n in daily
        ],
        "budget": {
            "daily_usd": budget["daily_usd"],
            "monthly_usd": budget["monthly_usd"],
            "hard_daily_usd": budget["hard_daily_usd"],
            "today_percent": round(today_totals["cost_usd"] / budget["daily_usd"] * 100, 1)
            if budget["daily_usd"]
            else None,
        },
        "economics": {
            "pro_subscribers": pro_subscribers or 0,
            "pro_price_brl_month": _money(price.amount) if price else None,
            "avg_ai_cost_per_pro_brl_month": _money(avg_pro) if avg_pro is not None else None,
            "margin_per_pro_brl_month": _money(price.amount - avg_pro)
            if price and avg_pro is not None
            else None,
            "donations_month": await _donations(db, month),
            "free_users_using_ai": free_users or 0,
            "avg_ai_cost_per_free_user_brl_month": _money(Decimal(free_cost_brl or 0) / free_users)
            if free_users
            else None,
        },
    }


@router.get("/ai/users")
async def ai_users(
    period: Literal["today", "month", "all"] = "month",
    limit: int = Query(50, ge=1, le=500),
    _: CurrentUser = Depends(admin_only),
    db: AsyncSession = Depends(get_db),
) -> dict:
    now = _now()
    since = {"today": _day(now), "month": _day(now).replace(day=1), "all": None}[period]
    stmt = (
        select(
            User.id,
            User.name,
            User.email,
            func.sum(AIUsage.cost_usd),
            func.sum(AIUsage.cost_brl),
            func.count(),
            func.max(AIUsage.created_at),
        )
        .join(User, User.id == AIUsage.user_id)
        .group_by(User.id)
        .order_by(func.sum(AIUsage.cost_usd).desc())
        .limit(limit)
    )
    if since:
        stmt = stmt.where(AIUsage.created_at >= since)
    out = []
    for uid, name, email, usd, brl, n, last in await db.execute(stmt):
        out.append(
            {
                "user_id": str(uid),
                "name": name,
                "email": email,
                "plan": "pro" if await active_subscription(db, uid) else "free",
                "cost_usd": _money(usd),
                "cost_brl": _money(brl),
                "requests": n,
                "last_used_at": last.isoformat() if last else None,
            }
        )
    return {"period": period, "users": out}


@router.get("/ai/users/{user_id}")
async def ai_user_detail(
    user_id: uuid.UUID, _: CurrentUser = Depends(admin_only), db: AsyncSession = Depends(get_db)
) -> dict:
    user = await db.get(User, user_id)
    if user is None:
        raise AppError(404, "user_not_found", "User not found")
    now = _now()
    rows = await db.scalars(
        select(AIUsage).where(AIUsage.user_id == user_id).order_by(AIUsage.created_at.desc()).limit(200)
    )
    sub = await active_subscription(db, user_id)
    return {
        "user": {
            "id": str(user.id),
            "name": user.name,
            "email": user.email,
            "created_at": user.created_at.isoformat(),
        },
        "plan": "pro" if sub else "free",
        "subscription": {
            "source": sub.source,
            "current_period_end": sub.current_period_end.isoformat() if sub.current_period_end else None,
            "note": sub.note,
        }
        if sub
        else None,
        "month": await _user_totals(db, user_id, _day(now).replace(day=1)),
        "all_time": await _user_totals(db, user_id, None),
        # Só metadados: funcionalidade, modelo, tokens, custo. Nunca o texto.
        "requests": [
            {
                "created_at": r.created_at.isoformat(),
                "feature": r.feature,
                "model": r.model,
                "plan": r.plan,
                "status": r.status,
                "input_tokens": r.input_tokens,
                "output_tokens": r.output_tokens,
                "cache_read_tokens": r.cache_read_tokens,
                "cost_usd": _money(r.cost_usd),
                "cost_brl": _money(r.cost_brl),
                "latency_ms": r.latency_ms,
            }
            for r in rows
        ],
    }


async def _user_totals(db: AsyncSession, user_id: uuid.UUID, since: datetime | None) -> dict:
    stmt = select(
        func.coalesce(func.sum(AIUsage.cost_usd), 0),
        func.coalesce(func.sum(AIUsage.cost_brl), 0),
        func.count(),
    ).where(AIUsage.user_id == user_id)
    if since:
        stmt = stmt.where(AIUsage.created_at >= since)
    usd, brl, n = (await db.execute(stmt)).one()
    return {"cost_usd": _money(usd), "cost_brl": _money(brl), "requests": n}


# ---------- Configurações ----------


class ModelConfig(BaseModel):
    model: Literal[KNOWN_MODELS]  # type: ignore[valid-type]
    effort: Literal["low", "medium", "high", "xhigh", "max"]
    max_tokens: int = Field(ge=16, le=64000)


Feature = Literal[
    "explain",
    "chat",
    "classify",
    "devotional",
    "sermon",
    "translate",
    "devotional_translate",
    "quiz",
    "visual_study",
    "slide_design",
]


class SettingsIn(BaseModel):
    enabled: bool
    models: dict[Feature, ModelConfig]
    quotas: dict[
        Literal["free_daily", "free_monthly", "pro_daily_cap", "pro_per_minute"],
        Annotated[int, Field(ge=0, le=100_000)],
    ]
    budget_daily_usd: float = Field(ge=0, le=100_000)
    budget_monthly_usd: float = Field(ge=0, le=1_000_000)
    budget_hard_daily_usd: float = Field(ge=0, le=100_000)
    alert_email: EmailStr | None = None
    usd_brl: float = Field(gt=0, le=100)


async def _settings_out(db: AsyncSession) -> dict:
    budget = await get_setting(db, "ai.budget")
    prices = await db.scalars(
        select(AIModelPrice).order_by(AIModelPrice.model, AIModelPrice.valid_from.desc())
    )
    return {
        "enabled": (await get_setting(db, "ai.enabled")).get("value", True),
        "models": await get_setting(db, "ai.models"),
        "quotas": await get_setting(db, "ai.quotas"),
        "budget_daily_usd": budget["daily_usd"],
        "budget_monthly_usd": budget["monthly_usd"],
        "budget_hard_daily_usd": budget["hard_daily_usd"],
        "alert_email": budget.get("alert_email"),
        "usd_brl": (await get_setting(db, "fx.usd_brl"))["rate"],
        "known_models": list(KNOWN_MODELS),
        "prices": [
            {
                "model": p.model,
                "input_per_mtok": float(p.input_per_mtok),
                "output_per_mtok": float(p.output_per_mtok),
                "cache_read_per_mtok": float(p.cache_read_per_mtok),
                "cache_write_per_mtok": float(p.cache_write_per_mtok),
                "valid_from": p.valid_from.isoformat(),
            }
            for p in prices
            if p.model != "fake"
        ],
    }


class MonthlyQuota(BaseModel):
    free_monthly: int = Field(ge=0, le=10_000)
    pro_monthly: int = Field(ge=0, le=10_000)


class DonationConfig(BaseModel):
    min_brl: float = Field(ge=1, le=100_000)
    max_brl: float = Field(ge=1, le=1_000_000)
    min_usd: float = Field(ge=1, le=100_000)
    max_usd: float = Field(ge=1, le=1_000_000)
    bonus_questions: int = Field(ge=0, le=1000)


class LimitsIn(BaseModel):
    visual: MonthlyQuota
    slides: MonthlyQuota
    donation: DonationConfig


async def _limits_out(db: AsyncSession) -> dict:
    return {
        "visual": await get_setting(db, "visual.quotas"),
        "slides": await get_setting(db, "slides.quotas"),
        "donation": await get_setting(db, "billing.donation"),
    }


@router.get("/limits")
async def get_limits(_: CurrentUser = Depends(admin_only), db: AsyncSession = Depends(get_db)) -> dict:
    """Limites por mês do que custa caro (estudo visual, fundos do telão) e valores da oferta avulsa."""
    return await _limits_out(db)


@router.put("/limits")
async def put_limits(
    body: LimitsIn, cu: CurrentUser = Depends(admin_only), db: AsyncSession = Depends(get_db)
) -> dict:
    d = body.donation
    if d.max_brl < d.min_brl or d.max_usd < d.min_usd:
        raise AppError(422, "invalid_amount", "The maximum must be at least the minimum")
    by = cu.user.id
    await set_setting(db, "visual.quotas", body.visual.model_dump(), by)
    await set_setting(db, "slides.quotas", body.slides.model_dump(), by)
    await set_setting(db, "billing.donation", d.model_dump(), by)
    audit.record(db, "admin.limits_updated", audit.RequestMeta(None, None), by)
    await db.commit()
    return await _limits_out(db)


@router.get("/settings")
async def get_settings_route(
    _: CurrentUser = Depends(admin_only), db: AsyncSession = Depends(get_db)
) -> dict:
    return await _settings_out(db)


@router.put("/settings")
async def put_settings(
    body: SettingsIn, cu: CurrentUser = Depends(admin_only), db: AsyncSession = Depends(get_db)
) -> dict:
    if body.budget_hard_daily_usd < body.budget_daily_usd:
        raise AppError(422, "invalid_budget", "The hard daily ceiling must be at least the daily budget")
    by = cu.user.id
    await set_setting(db, "ai.enabled", {"value": body.enabled}, by)
    await set_setting(db, "ai.models", {k: v.model_dump() for k, v in body.models.items()}, by)
    await set_setting(db, "ai.quotas", dict(body.quotas), by)
    await set_setting(
        db,
        "ai.budget",
        {
            "daily_usd": body.budget_daily_usd,
            "monthly_usd": body.budget_monthly_usd,
            "hard_daily_usd": body.budget_hard_daily_usd,
            "alert_email": body.alert_email,
        },
        by,
    )
    await set_setting(db, "fx.usd_brl", {"rate": body.usd_brl, "source": "manual"}, by)
    audit.record(db, "admin.settings_updated", audit.RequestMeta(None, None), by)
    await db.commit()
    return await _settings_out(db)


class PriceIn(BaseModel):
    model: Literal[KNOWN_MODELS]  # type: ignore[valid-type]
    input_per_mtok: float = Field(ge=0, le=1000)
    output_per_mtok: float = Field(ge=0, le=1000)
    cache_read_per_mtok: float = Field(ge=0, le=1000)
    cache_write_per_mtok: float = Field(ge=0, le=1000)
    valid_from: date


@router.post("/ai/prices")
async def add_price(
    body: PriceIn, cu: CurrentUser = Depends(admin_only), db: AsyncSession = Depends(get_db)
) -> dict:
    """Novo preço a partir de uma data. Chamadas anteriores mantêm o custo calculado na época."""
    db.add(AIModelPrice(**body.model_dump()))
    audit.record(db, "admin.price_added", audit.RequestMeta(None, None), cu.user.id, model=body.model)
    await db.commit()
    return await _settings_out(db)


# ---------- Cortesia Pro (sem cobrança) ----------


class GrantIn(BaseModel):
    days: int | None = Field(None, ge=1, le=3650)
    note: str | None = Field(None, max_length=300)


@router.post("/users/{user_id}/pro")
async def grant_pro(
    user_id: uuid.UUID,
    body: GrantIn,
    cu: CurrentUser = Depends(admin_only),
    db: AsyncSession = Depends(get_db),
) -> dict:
    user = await db.get(User, user_id)
    if user is None or user.deleted_at is not None:
        raise AppError(404, "user_not_found", "User not found")
    db.add(
        Subscription(
            user_id=user_id,
            plan="pro",
            status="active",
            source="manual",
            current_period_end=_now() + timedelta(days=body.days) if body.days else None,
            note=body.note,
        )
    )
    audit.record(db, "admin.pro_granted", audit.RequestMeta(None, None), cu.user.id, target=str(user_id))
    await db.commit()
    return {"plan": "pro"}


@router.delete("/users/{user_id}/pro")
async def revoke_pro(
    user_id: uuid.UUID, cu: CurrentUser = Depends(admin_only), db: AsyncSession = Depends(get_db)
) -> dict:
    rows = await db.scalars(
        select(Subscription).where(
            and_(
                Subscription.user_id == user_id,
                Subscription.source == "manual",
                Subscription.status == "active",
            )
        )
    )
    for s in rows:
        s.status = "canceled"
    audit.record(db, "admin.pro_revoked", audit.RequestMeta(None, None), cu.user.id, target=str(user_id))
    await db.commit()
    return {"plan": "pro" if await active_subscription(db, user_id) else "free"}


@router.get("/users")
async def search_users(
    q: str = Query("", max_length=100),
    _: CurrentUser = Depends(admin_only),
    db: AsyncSession = Depends(get_db),
) -> dict:
    stmt = select(User).where(User.deleted_at.is_(None))
    if q:
        stmt = stmt.where((User.email.ilike(f"%{q}%")) | (User.name.ilike(f"%{q}%")))
    rows = await db.scalars(stmt.order_by(User.created_at.desc()).limit(50))
    return {
        "users": [
            {
                "id": str(u.id),
                "name": u.name,
                "email": u.email,
                "plan": "pro" if await active_subscription(db, u.id) else "free",
                "created_at": u.created_at.isoformat(),
            }
            for u in rows
        ]
    }
