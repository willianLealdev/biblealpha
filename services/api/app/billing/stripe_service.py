"""Contribuições pelo Stripe (o mundo todo). O BibleAlpha não tem fins lucrativos: não vende
plano; o "Ofertante" (código interno "pro") contribui todo mês, e qualquer pessoa pode dar uma
oferta avulsa no valor que quiser.

- Checkout: página de pagamento hospedada pelo Stripe (cartão, Apple Pay, Google Pay e os
  meios locais que o Stripe oferecer em cada país). O app só abre a URL.
- Portal do cliente: o usuário troca o cartão, vê faturas e cancela sem falar com ninguém.
- Webhook: o Stripe avisa a API; a assinatura é atualizada por `apply_gateway_event`.
- Oferta avulsa: Checkout em modo "payment" (submit_type="donate"); fica só registrada em
  payment_events, sem criar assinatura.

O preço vem da versão vigente (PlanPrice). Cada versão vira um Price no Stripe; quem já assina
continua no Price contratado quando o admin muda o valor para novos assinantes.
"""

import logging
import uuid
from datetime import UTC, datetime
from decimal import Decimal

import stripe
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.core.errors import AppError
from app.models import PaymentEvent, PlanPrice, User
from app.services import secrets
from app.services.settings import get_setting, set_setting

log = logging.getLogger(__name__)

SOURCE = "stripe"
PRODUCT_KEY = "stripe.product"
# Eventos que o webhook precisa receber (configurados no painel do Stripe)
WEBHOOK_EVENTS = [
    "checkout.session.completed",
    "customer.subscription.created",
    "customer.subscription.updated",
    "customer.subscription.deleted",
    "invoice.paid",
    "invoice.payment_failed",
]

_STATUS = {
    "active": "active",
    "trialing": "active",
    "past_due": "past_due",
    "unpaid": "past_due",
    "canceled": "canceled",
    "incomplete_expired": "expired",
    "paused": "canceled",
}


def configured() -> bool:
    return bool(secrets.get("stripe_secret_key"))


def client(api_key: str | None = None) -> stripe.StripeClient:
    key = api_key or secrets.get("stripe_secret_key")
    if not key:
        raise AppError(503, "payments_unavailable", "Payments are not configured")
    return stripe.StripeClient(key, http_client=stripe.HTTPXClient(), max_network_retries=2)


def currency_for(locale: str) -> str:
    """Brasil paga em reais; o resto do mundo em dólar (o Stripe mostra o valor convertido
    para a moeda local quando a conversão automática estiver ligada no Stripe)."""
    return "BRL" if locale.lower().startswith("pt") else "USD"


async def _product_id(db: AsyncSession, sc: stripe.StripeClient) -> str:
    current = (await get_setting(db, PRODUCT_KEY)).get("id")
    if current:
        return current
    product = await sc.v1.products.create_async(
        params={"name": "BibleAlpha — Ofertante", "metadata": {"app": "biblealpha", "plan": "pro"}}
    )
    await set_setting(db, PRODUCT_KEY, {"id": product.id})
    return product.id


async def ensure_price(db: AsyncSession, price: PlanPrice, sc: stripe.StripeClient | None = None) -> str:
    """Price do Stripe para uma versão de preço (cria na primeira vez)."""
    if price.stripe_price_id:
        return price.stripe_price_id
    sc = sc or client()
    created = await sc.v1.prices.create_async(
        params={
            "product": await _product_id(db, sc),
            "currency": price.currency.lower(),
            "unit_amount": int((Decimal(price.amount) * 100).to_integral_value()),
            "recurring": {"interval": price.interval},
            "metadata": {"plan_price_id": str(price.id)},
        }
    )
    price.stripe_price_id = created.id
    await db.flush()
    return created.id


async def ensure_customer(db: AsyncSession, user: User, sc: stripe.StripeClient) -> str:
    if user.stripe_customer_id:
        return user.stripe_customer_id
    customer = await sc.v1.customers.create_async(
        params={
            "email": user.email,
            "name": user.name or None,
            "preferred_locales": [user.locale],
            "metadata": {"user_id": str(user.id)},
        }
    )
    user.stripe_customer_id = customer.id
    await db.flush()
    return customer.id


async def checkout_url(db: AsyncSession, user: User, price: PlanPrice) -> str:
    sc = client()
    price_id = await ensure_price(db, price, sc)
    customer = await ensure_customer(db, user, sc)
    base = get_settings().app_url.rstrip("/")
    session = await sc.v1.checkout.sessions.create_async(
        params={
            "mode": "subscription",
            "customer": customer,
            "line_items": [{"price": price_id, "quantity": 1}],
            "client_reference_id": str(user.id),
            "subscription_data": {"metadata": {"user_id": str(user.id), "plan_price_id": str(price.id)}},
            "allow_promotion_codes": True,
            "locale": "auto",
            "success_url": f"{base}/pro?checkout=success",
            "cancel_url": f"{base}/pro?checkout=cancel",
        }
    )
    await db.commit()
    return session.url


# Limites da oferta avulsa por moeda (mínimo cobre a taxa do Stripe; máximo evita erro de digitação)
DONATION_LIMITS = {"BRL": (Decimal("5"), Decimal("10000")), "USD": (Decimal("1"), Decimal("2000"))}


def check_donation(amount: Decimal, currency: str) -> None:
    low, high = DONATION_LIMITS[currency]
    if not (low <= amount <= high):
        raise AppError(422, "invalid_amount", f"Amount must be between {low} and {high} {currency}")


async def donation_url(db: AsyncSession, user: User, amount: Decimal, currency: str) -> str:
    """Oferta única no valor escolhido pelo usuário."""
    check_donation(amount, currency)
    sc = client()
    customer = await ensure_customer(db, user, sc)
    base = get_settings().app_url.rstrip("/")
    meta = {"kind": "donation", "user_id": str(user.id)}
    session = await sc.v1.checkout.sessions.create_async(
        params={
            "mode": "payment",
            "submit_type": "donate",
            "customer": customer,
            "line_items": [
                {
                    "quantity": 1,
                    "price_data": {
                        "currency": currency.lower(),
                        "unit_amount": int((amount * 100).to_integral_value()),
                        "product_data": {"name": "BibleAlpha — Oferta"},
                    },
                }
            ],
            "client_reference_id": str(user.id),
            "metadata": meta,
            "payment_intent_data": {"metadata": meta},
            "locale": "auto",
            "success_url": f"{base}/pro?donation=success",
            "cancel_url": f"{base}/pro?donation=cancel",
        }
    )
    await db.commit()
    return session.url


def is_donation(event_type: str, data: dict) -> bool:
    return event_type == "checkout.session.completed" and (
        data.get("mode") == "payment" or (data.get("metadata") or {}).get("kind") == "donation"
    )


async def portal_url(user: User) -> str:
    if not user.stripe_customer_id:
        raise AppError(404, "no_billing_account", "No subscription billing account")
    sc = client()
    session = await sc.v1.billing_portal.sessions.create_async(
        params={
            "customer": user.stripe_customer_id,
            "return_url": f"{get_settings().app_url.rstrip('/')}/pro",
        }
    )
    return session.url


def _period_end(sub: dict) -> datetime | None:
    # Versões novas da API trazem o período em cada item da assinatura
    ts = sub.get("current_period_end")
    if ts is None:
        items = (sub.get("items") or {}).get("data") or []
        ts = items[0].get("current_period_end") if items else None
    return datetime.fromtimestamp(ts, UTC) if ts else None


async def _user_for(db: AsyncSession, sub: dict) -> User | None:
    meta = sub.get("metadata") or {}
    if meta.get("user_id"):
        try:
            user = await db.get(User, uuid.UUID(meta["user_id"]))
        except ValueError:
            user = None
        if user:
            return user
    customer = sub.get("customer")
    if customer:
        return await db.scalar(select(User).where(User.stripe_customer_id == customer))
    return None


async def apply_subscription(db: AsyncSession, sub: dict) -> None:
    from app.api.routes.billing import apply_gateway_event

    status = _STATUS.get(sub.get("status", ""))
    if status is None:  # incomplete: pagamento ainda não confirmado
        return
    user = await _user_for(db, sub)
    if user is None:
        log.error("Assinatura do Stripe %s sem usuário correspondente", sub.get("id"))
        return
    price_id = None
    meta_price = (sub.get("metadata") or {}).get("plan_price_id")
    if meta_price:
        try:
            price_id = uuid.UUID(meta_price)
        except ValueError:
            price_id = None
    if price_id is None:
        items = (sub.get("items") or {}).get("data") or []
        stripe_price = items[0]["price"]["id"] if items else None
        if stripe_price:
            row = await db.scalar(select(PlanPrice).where(PlanPrice.stripe_price_id == stripe_price))
            price_id = row.id if row else None
    await apply_gateway_event(
        db,
        user_id=user.id,
        source=SOURCE,
        external_id=sub["id"],
        status=status,
        current_period_end=_period_end(sub),
        price_id=price_id,
        cancel_at_period_end=bool(sub.get("cancel_at_period_end")),
    )


async def handle_webhook(db: AsyncSession, payload: bytes, signature: str | None) -> str:
    secret = secrets.get("stripe_webhook_secret")
    if not secret:
        raise AppError(503, "payments_unavailable", "Stripe webhook secret is not configured")
    try:
        event = stripe.Webhook.construct_event(payload, signature or "", secret)
    except (ValueError, stripe.SignatureVerificationError):
        raise AppError(400, "invalid_signature", "Invalid Stripe signature") from None

    # Idempotente: o Stripe pode reenviar o mesmo evento
    if await db.scalar(select(PaymentEvent.id).where(PaymentEvent.external_id == event.id)):
        return "duplicate"
    data = event.data.object.to_dict() if hasattr(event.data.object, "to_dict") else dict(event.data.object)
    row = PaymentEvent(source=SOURCE, external_id=event.id, event_type=event.type, payload=data)
    db.add(row)

    if is_donation(event.type, data):
        # Oferta avulsa: fica registrada (payment_events) e entra no resumo do painel
        log.info("Oferta avulsa recebida: %s %s", data.get("amount_total"), data.get("currency"))
    elif event.type.startswith("customer.subscription."):
        await apply_subscription(db, data)
    elif event.type in ("checkout.session.completed", "invoice.paid", "invoice.payment_failed"):
        sub_id = data.get("subscription") or (
            ((data.get("parent") or {}).get("subscription_details") or {}).get("subscription")
        )
        if sub_id:
            sub = await client().v1.subscriptions.retrieve_async(sub_id)
            await apply_subscription(db, sub.to_dict())
    row.processed_at = datetime.now(UTC)
    await db.commit()
    return "processed"


async def test_connection(api_key: str | None = None) -> dict:
    """Confere a chave: lê o saldo da conta (não altera nada)."""
    balance = await client(api_key).v1.balance.retrieve_async()
    return {"livemode": bool(balance.livemode)}
