import hashlib
import hmac
import json
import time

from sqlalchemy import delete, select

from app.ai.provider import AnthropicProvider, FakeProvider, get_provider
from app.billing import stripe_service
from app.db.session import get_sessionmaker
from app.models import PlanPrice, SystemSetting, User
from app.services import secrets
from tests.conftest import bearer, login, make_admin, register

WHSEC = "whsec_test_secret_for_signing"


async def _admin(client):
    await register(client)
    await make_admin()
    return await login(client)


async def test_keys_are_encrypted_masked_and_admin_only(client):
    tokens = await _admin(client)
    key = "sk-ant-api03-very-secret-value-ABCD"
    r = await client.put(
        "/api/v1/admin/integrations/anthropic_api_key", headers=bearer(tokens), json={"value": key}
    )
    assert r.status_code == 200, r.text
    item = next(x for x in r.json()["items"] if x["name"] == "anthropic_api_key")
    assert item["configured"] and item["source"] == "panel" and item["preview"] == "…ABCD"
    assert key not in r.text

    # No banco fica criptografada
    async with get_sessionmaker()() as db:
        row = await db.get(SystemSetting, "secret.anthropic_api_key")
        assert key not in json.dumps(row.value)

    # A IA passa a usar o Claude com essa chave, sem reiniciar
    provider = get_provider()
    assert isinstance(provider, AnthropicProvider) and provider.api_key == key

    # Formato errado é recusado; apagar volta ao modo sem chave
    bad = await client.put(
        "/api/v1/admin/integrations/stripe_secret_key", headers=bearer(tokens), json={"value": "abc"}
    )
    assert bad.status_code == 422 and bad.json()["error"]["code"] == "invalid_key_format"
    await client.put(
        "/api/v1/admin/integrations/anthropic_api_key", headers=bearer(tokens), json={"value": None}
    )
    assert isinstance(get_provider(), FakeProvider)

    await register(client, email="bia@example.com", name="Bia")
    user = await login(client, email="bia@example.com")
    assert (await client.get("/api/v1/admin/integrations", headers=bearer(user))).status_code == 403
    status = (await client.get("/api/v1/admin/integrations", headers=bearer(tokens))).json()
    assert status["stripe"]["webhook_url"].endswith("/api/v1/billing/stripe/webhook")


def _signed(payload: dict) -> tuple[bytes, str]:
    body = json.dumps(payload).encode()
    ts = int(time.time())
    sig = hmac.new(WHSEC.encode(), f"{ts}.".encode() + body, hashlib.sha256).hexdigest()
    return body, f"t={ts},v1={sig}"


async def test_stripe_webhook_activates_and_cancels_pro(client):
    tokens = await _admin(client)
    await client.put(
        "/api/v1/admin/integrations/stripe_webhook_secret", headers=bearer(tokens), json={"value": WHSEC}
    )
    async with get_sessionmaker()() as db:
        user_id = await db.scalar(select(User.id).where(User.email == "ana@example.com"))

    def event(eid: str, status: str, cancel=False) -> dict:
        return {
            "id": eid,
            "object": "event",
            "type": "customer.subscription.updated",
            "data": {
                "object": {
                    "id": "sub_123",
                    "object": "subscription",
                    "status": status,
                    "customer": "cus_123",
                    "cancel_at_period_end": cancel,
                    "metadata": {"user_id": str(user_id)},
                    "items": {
                        "data": [
                            {"price": {"id": "price_x"}, "current_period_end": int(time.time()) + 86400 * 30}
                        ]
                    },
                }
            },
        }

    body, sig = _signed(event("evt_1", "active"))
    r = await client.post("/api/v1/billing/stripe/webhook", content=body, headers={"stripe-signature": sig})
    assert r.status_code == 200 and r.json()["result"] == "processed"
    me = (await client.get("/api/v1/me/subscription", headers=bearer(tokens))).json()
    assert me["plan"] == "pro" and me["subscription"]["source"] == "stripe"

    # Reenvio do mesmo evento não duplica
    r = await client.post("/api/v1/billing/stripe/webhook", content=body, headers={"stripe-signature": sig})
    assert r.json()["result"] == "duplicate"

    # Assinatura inválida é recusada
    bad = await client.post(
        "/api/v1/billing/stripe/webhook", content=body, headers={"stripe-signature": "t=1,v1=00"}
    )
    assert bad.status_code == 400

    body, sig = _signed(event("evt_2", "canceled"))
    await client.post("/api/v1/billing/stripe/webhook", content=body, headers={"stripe-signature": sig})
    assert (await client.get("/api/v1/me/subscription", headers=bearer(tokens))).json()["plan"] == "free"


class _Obj:
    def __init__(self, **kw):
        self.__dict__.update(kw)


class _FakeStripe:
    """Imita o StripeClient: registra as chamadas e devolve ids fixos."""

    def __init__(self):
        self.calls: list[tuple[str, dict]] = []
        outer = self

        class Res:
            def __init__(self, name, result):
                self.name, self.result = name, result

            async def create_async(self, params=None, options=None):
                outer.calls.append((self.name, params))
                return self.result

        self.v1 = _Obj(
            products=Res("product", _Obj(id="prod_1")),
            prices=Res("price", _Obj(id="price_1")),
            customers=Res("customer", _Obj(id="cus_1")),
            checkout=_Obj(sessions=Res("checkout", _Obj(url="https://checkout.stripe.test/c/1"))),
            billing_portal=_Obj(sessions=Res("portal", _Obj(url="https://billing.stripe.test/p/1"))),
        )


async def test_checkout_uses_versioned_price_and_portal(client, monkeypatch):
    fake = _FakeStripe()
    monkeypatch.setattr(stripe_service, "client", lambda api_key=None: fake)
    monkeypatch.setattr(secrets, "get", lambda name: "sk_test_x" if name == "stripe_secret_key" else None)
    tokens = await _admin(client)
    try:
        await client.post(
            "/api/v1/admin/billing/prices",
            headers=bearer(tokens),
            json={"interval": "month", "currency": "USD", "amount": "4.99"},
        )
        await client.patch("/api/v1/me", headers=bearer(tokens), json={"locale": "es"})
        plans = (await client.get("/api/v1/billing/plans")).json()
        assert plans["checkout_available"] is True

        r = await client.post("/api/v1/billing/checkout", headers=bearer(tokens), json={"interval": "month"})
        assert r.status_code == 200, r.text
        assert r.json()["url"].startswith("https://checkout.stripe.test")
        price_call = next(p for name, p in fake.calls if name == "price")
        assert price_call["unit_amount"] == 499 and price_call["currency"] == "usd"
        session = next(p for name, p in fake.calls if name == "checkout")
        assert session["mode"] == "subscription" and session["customer"] == "cus_1"
        assert session["line_items"] == [{"price": "price_1", "quantity": 1}]

        portal = await client.post("/api/v1/billing/portal", headers=bearer(tokens))
        assert portal.json()["url"].startswith("https://billing.stripe.test")
    finally:
        async with get_sessionmaker()() as db:
            await db.execute(delete(PlanPrice).where(PlanPrice.currency == "USD"))
            await db.commit()


async def test_one_time_donation_checkout_and_limits(client, monkeypatch):
    fake = _FakeStripe()
    monkeypatch.setattr(stripe_service, "client", lambda api_key=None: fake)
    monkeypatch.setattr(secrets, "get", lambda name: "sk_test_x" if name == "stripe_secret_key" else None)
    tokens = await _admin(client)
    plans = (await client.get("/api/v1/billing/plans")).json()
    assert plans["donation_limits"]["BRL"] == [5.0, 10000.0]

    r = await client.post("/api/v1/billing/donate", headers=bearer(tokens), json={"amount": "37.50"})
    assert r.status_code == 200, r.text
    assert r.json()["url"].startswith("https://checkout.stripe.test")
    session = next(p for name, p in fake.calls if name == "checkout")
    assert session["mode"] == "payment" and session["submit_type"] == "donate"
    item = session["line_items"][0]["price_data"]
    assert item["unit_amount"] == 3750 and item["currency"] == "brl"  # conta em português → reais
    assert session["metadata"]["kind"] == "donation" and session["metadata"]["user_id"]
    assert session["success_url"].endswith("/pro?donation=success")
    assert not any(name == "price" for name, _ in fake.calls)  # oferta avulsa não cria Price recorrente

    # Dólar, e valores fora dos limites
    r = await client.post(
        "/api/v1/billing/donate", headers=bearer(tokens), json={"amount": "1", "currency": "USD"}
    )
    assert r.status_code == 200
    for body in ({"amount": "4.99"}, {"amount": "10001"}, {"amount": "2001", "currency": "USD"}):
        bad = await client.post("/api/v1/billing/donate", headers=bearer(tokens), json=body)
        assert bad.status_code == 422 and bad.json()["error"]["code"] == "invalid_amount", bad.text
    assert (await client.post("/api/v1/billing/donate", json={"amount": "10"})).status_code == 401


async def test_donation_webhook_is_recorded_without_subscription(client):
    tokens = await _admin(client)
    await client.put(
        "/api/v1/admin/integrations/stripe_webhook_secret", headers=bearer(tokens), json={"value": WHSEC}
    )
    async with get_sessionmaker()() as db:
        user_id = await db.scalar(select(User.id).where(User.email == "ana@example.com"))
    event = {
        "id": "evt_donation_1",
        "object": "event",
        "type": "checkout.session.completed",
        "data": {
            "object": {
                "id": "cs_1",
                "object": "checkout.session",
                "mode": "payment",
                "payment_status": "paid",
                "amount_total": 5000,
                "currency": "brl",
                "subscription": None,
                "metadata": {"kind": "donation", "user_id": str(user_id)},
            }
        },
    }
    body, sig = _signed(event)
    r = await client.post("/api/v1/billing/stripe/webhook", content=body, headers={"stripe-signature": sig})
    assert r.status_code == 200 and r.json()["result"] == "processed"
    me = (await client.get("/api/v1/me/subscription", headers=bearer(tokens))).json()
    assert me["plan"] == "free"  # oferta avulsa não vira assinatura

    overview = (await client.get("/api/v1/admin/ai/overview", headers=bearer(tokens))).json()
    donations = overview["economics"]["donations_month"]
    assert donations["count"] >= 1
    brl = next(d for d in donations["by_currency"] if d["currency"] == "BRL")
    assert brl["amount"] >= 50.0
