"""Planos e assinatura.

- Público: planos e preços atuais.
- Usuário: a própria assinatura.
- Admin: novas versões de preço (quem já assina mantém o preço contratado).

A cobrança é feita pelo Stripe (app/billing/stripe_service.py): checkout, portal do cliente e
webhook, que chega aqui normalizado em `apply_gateway_event`.
"""

import logging
import uuid
from datetime import UTC, date, datetime
from decimal import Decimal
from typing import Literal

from fastapi import APIRouter, Depends, Request
from pydantic import BaseModel, Field
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import CurrentUser, current_user, require_role
from app.billing import stripe_service
from app.core.errors import AppError
from app.db.session import get_db
from app.models import PlanPrice, Subscription
from app.services import audit
from app.services.plans import active_subscription
from app.services.settings import get_setting

router = APIRouter(tags=["billing"])
admin_only = require_role("admin")

PRO_FEATURES = ["ai_unlimited", "advanced_analysis", "sermon_ai_tools", "priority_support"]


def _price_out(p: PlanPrice) -> dict:
    return {
        "id": str(p.id),
        "plan": p.plan,
        "interval": p.interval,
        "currency": p.currency,
        "amount": float(p.amount),
        "valid_from": p.valid_from.isoformat(),
        "is_current": p.is_current,
    }


@router.get("/billing/plans")
async def plans(db: AsyncSession = Depends(get_db)) -> dict:
    quotas = await get_setting(db, "ai.quotas")
    prices = await db.scalars(
        select(PlanPrice).where(PlanPrice.is_current.is_(True)).order_by(PlanPrice.interval)
    )
    return {
        "free": {"ai_daily": quotas["free_daily"], "ai_monthly": quotas["free_monthly"]},
        "pro": {"features": PRO_FEATURES, "prices": [_price_out(p) for p in prices]},
        # Sem chave do Stripe no painel, o app mostra "em breve"
        "checkout_available": stripe_service.configured(),
        # Limites da oferta avulsa por moeda
        "donation_limits": {
            c: [float(lo), float(hi)] for c, (lo, hi) in (await stripe_service.donation_limits(db)).items()
        },
        "donation_bonus_questions": int(
            (await get_setting(db, "billing.donation")).get("bonus_questions", 3)
        ),
    }


@router.get("/me/subscription")
async def my_subscription(
    cu: CurrentUser = Depends(current_user), db: AsyncSession = Depends(get_db)
) -> dict:
    sub = await active_subscription(db, cu.user.id)
    if sub is None:
        return {"plan": "free", "subscription": None}
    price = await db.get(PlanPrice, sub.price_id) if sub.price_id else None
    return {
        "plan": "pro",
        "subscription": {
            "status": sub.status,
            "source": sub.source,
            "current_period_end": sub.current_period_end.isoformat() if sub.current_period_end else None,
            "cancel_at_period_end": sub.cancel_at_period_end,
            # Preço contratado (não muda quando o preço para novos assinantes muda)
            "price": _price_out(price) if price else None,
        },
    }


class PriceIn(BaseModel):
    interval: Literal["month", "year"]
    currency: Literal["BRL", "USD", "EUR"] = "BRL"
    amount: Decimal = Field(gt=0, le=10_000, decimal_places=2)
    valid_from: date | None = None


@router.get("/admin/billing/prices")
async def admin_prices(_: CurrentUser = Depends(admin_only), db: AsyncSession = Depends(get_db)) -> dict:
    rows = await db.scalars(select(PlanPrice).order_by(PlanPrice.interval, PlanPrice.valid_from.desc()))
    return {"prices": [_price_out(p) for p in rows]}


@router.post("/admin/billing/prices")
async def admin_new_price(
    body: PriceIn, cu: CurrentUser = Depends(admin_only), db: AsyncSession = Depends(get_db)
) -> dict:
    """Novo preço para NOVOS assinantes. A versão anterior deixa de ser oferecida, mas continua
    valendo para quem já assina com ela."""
    await db.execute(
        update(PlanPrice)
        .where(
            PlanPrice.plan == "pro",
            PlanPrice.interval == body.interval,
            PlanPrice.currency == body.currency,
            PlanPrice.is_current.is_(True),
        )
        .values(is_current=False)
    )
    price = PlanPrice(
        plan="pro",
        interval=body.interval,
        currency=body.currency,
        amount=body.amount,
        valid_from=body.valid_from or date.today(),
        is_current=True,
    )
    db.add(price)
    await db.flush()
    # Já cria o preço no Stripe (se configurado); se falhar, é criado na primeira assinatura
    if stripe_service.configured():
        try:
            await stripe_service.ensure_price(db, price)
        except Exception:  # Stripe fora do ar ou chave inválida: não impede salvar o preço
            logging.getLogger(__name__).exception("Não foi possível criar o preço no Stripe agora")
    audit.record(
        db,
        "admin.price_changed",
        audit.RequestMeta(None, None),
        cu.user.id,
        interval=body.interval,
        amount=str(body.amount),
    )
    await db.commit()
    return _price_out(price)


async def current_price(db: AsyncSession, interval: str, currency: str = "BRL") -> PlanPrice | None:
    return await db.scalar(
        select(PlanPrice).where(
            PlanPrice.plan == "pro",
            PlanPrice.interval == interval,
            PlanPrice.currency == currency,
            PlanPrice.is_current.is_(True),
        )
    )


async def apply_gateway_event(
    db: AsyncSession,
    *,
    user_id: uuid.UUID,
    source: str,
    external_id: str,
    status: Literal["active", "past_due", "canceled", "expired"],
    current_period_end: datetime | None,
    price_id: uuid.UUID | None,
    cancel_at_period_end: bool = False,
) -> Subscription:
    """Estado normalizado vindo de qualquer meio de pagamento (gateway web, Apple, Google)."""
    sub = await db.scalar(
        select(Subscription).where(Subscription.source == source, Subscription.external_id == external_id)
    )
    if sub is None:
        sub = Subscription(
            user_id=user_id,
            plan="pro",
            source=source,
            external_id=external_id,
            status=status,
            price_id=price_id,
        )
        db.add(sub)
    # A versão de preço é a da contratação: renovações não trocam price_id
    sub.status = status
    sub.current_period_end = current_period_end
    sub.cancel_at_period_end = cancel_at_period_end
    sub.updated_at = datetime.now(UTC)
    await db.flush()
    return sub


class CheckoutIn(BaseModel):
    interval: Literal["month", "year"] = "month"


@router.post("/billing/checkout")
async def checkout(
    body: CheckoutIn, cu: CurrentUser = Depends(current_user), db: AsyncSession = Depends(get_db)
) -> dict:
    """Abre o pagamento do Pro no Stripe. O app redireciona para a URL devolvida."""
    if await active_subscription(db, cu.user.id):
        raise AppError(409, "already_pro", "You already have an active subscription")
    currency = stripe_service.currency_for(cu.user)
    price = await current_price(db, body.interval, currency) or await current_price(db, body.interval, "USD")
    if price is None:
        raise AppError(503, "price_not_set", "The Pro price is not set yet")
    return {"url": await stripe_service.checkout_url(db, cu.user, price)}


class DonateIn(BaseModel):
    amount: Decimal = Field(gt=0, decimal_places=2)
    currency: Literal["BRL", "USD"] | None = None


@router.post("/billing/donate")
async def donate(
    body: DonateIn, cu: CurrentUser = Depends(current_user), db: AsyncSession = Depends(get_db)
) -> dict:
    """Oferta avulsa no valor que o usuário quiser (não cria assinatura). A moeda segue o país."""
    currency = stripe_service.currency_for(cu.user)
    await stripe_service.check_donation(db, body.amount, currency)
    return {"url": await stripe_service.donation_url(db, cu.user, body.amount, currency)}


@router.post("/billing/portal")
async def portal(cu: CurrentUser = Depends(current_user)) -> dict:
    """Portal do Stripe: trocar cartão, ver faturas, cancelar."""
    return {"url": await stripe_service.portal_url(cu.user)}


@router.post("/billing/stripe/webhook", include_in_schema=False)
async def stripe_webhook(request: Request, db: AsyncSession = Depends(get_db)) -> dict:
    payload = await request.body()
    result = await stripe_service.handle_webhook(db, payload, request.headers.get("stripe-signature"))
    return {"received": True, "result": result}
