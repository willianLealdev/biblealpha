from datetime import UTC, datetime, timedelta

from sqlalchemy import select

from app.api.routes.billing import apply_gateway_event, current_price
from app.db.session import get_sessionmaker
from app.models import User
from tests.conftest import bearer, login, make_admin, register


async def test_price_versions_keep_existing_subscribers_price(client):
    await register(client, email="admin@example.com", name="Admin")
    await register(client, email="ana@example.com")
    await register(client, email="bruno@example.com", name="Bruno")
    await make_admin("admin@example.com")
    admin = await login(client, email="admin@example.com")

    # Usuário comum não define preço
    ana = await login(client, email="ana@example.com")
    assert (
        await client.post(
            "/api/v1/admin/billing/prices", headers=bearer(ana), json={"interval": "month", "amount": "1"}
        )
    ).status_code == 403

    r = await client.post(
        "/api/v1/admin/billing/prices", headers=bearer(admin), json={"interval": "month", "amount": "19.90"}
    )
    assert r.json()["amount"] == 19.9

    async with get_sessionmaker()() as db:
        ana_id = await db.scalar(select(User.id).where(User.email == "ana@example.com"))
        bruno_id = await db.scalar(select(User.id).where(User.email == "bruno@example.com"))
        price_v1 = await current_price(db, "month")
        await apply_gateway_event(
            db,
            user_id=ana_id,
            source="gateway",
            external_id="sub_ana",
            status="active",
            current_period_end=datetime.now(UTC) + timedelta(days=30),
            price_id=price_v1.id,
        )
        await db.commit()

    # Preço sobe para novos assinantes
    await client.post(
        "/api/v1/admin/billing/prices", headers=bearer(admin), json={"interval": "month", "amount": "24.90"}
    )
    plans = (await client.get("/api/v1/billing/plans")).json()
    assert [p["amount"] for p in plans["pro"]["prices"]] == [24.9]
    assert plans["free"]["ai_daily"] == 5

    async with get_sessionmaker()() as db:
        price_v2 = await current_price(db, "month")
        await apply_gateway_event(
            db,
            user_id=bruno_id,
            source="gateway",
            external_id="sub_bruno",
            status="active",
            current_period_end=datetime.now(UTC) + timedelta(days=30),
            price_id=price_v2.id,
        )
        # Renovação da Ana não troca a versão de preço
        await apply_gateway_event(
            db,
            user_id=ana_id,
            source="gateway",
            external_id="sub_ana",
            status="active",
            current_period_end=datetime.now(UTC) + timedelta(days=60),
            price_id=price_v2.id,
        )
        await db.commit()

    bruno = await login(client, email="bruno@example.com")
    ana_sub = (await client.get("/api/v1/me/subscription", headers=bearer(ana))).json()
    bruno_sub = (await client.get("/api/v1/me/subscription", headers=bearer(bruno))).json()
    assert ana_sub["plan"] == "pro" and ana_sub["subscription"]["price"]["amount"] == 19.9
    assert bruno_sub["subscription"]["price"]["amount"] == 24.9

    history = (await client.get("/api/v1/admin/billing/prices", headers=bearer(admin))).json()["prices"]
    assert [(p["amount"], p["is_current"]) for p in history] == [(24.9, True), (19.9, False)] or sorted(
        (p["amount"], p["is_current"]) for p in history
    ) == [(19.9, False), (24.9, True)]


async def test_expired_subscription_falls_back_to_free(client):
    await register(client)
    tokens = await login(client)
    async with get_sessionmaker()() as db:
        uid = await db.scalar(select(User.id))
        await apply_gateway_event(
            db,
            user_id=uid,
            source="gateway",
            external_id="sub_x",
            status="active",
            current_period_end=datetime.now(UTC) - timedelta(minutes=1),
            price_id=None,
        )
        await db.commit()
    assert (await client.get("/api/v1/me/subscription", headers=bearer(tokens))).json() == {
        "plan": "free",
        "subscription": None,
    }


async def test_canceled_subscription_lasts_until_period_end(client):
    """Quem cancela continua Ofertante até o fim do período que já pagou."""
    await register(client)
    tokens = await login(client)
    async with get_sessionmaker()() as db:
        uid = await db.scalar(select(User.id))
        await apply_gateway_event(
            db,
            user_id=uid,
            source="gateway",
            external_id="sub_c",
            status="canceled",
            current_period_end=datetime.now(UTC) + timedelta(days=10),
            price_id=None,
        )
        await db.commit()
    assert (await client.get("/api/v1/me/subscription", headers=bearer(tokens))).json()["plan"] == "pro"


def test_currency_follows_country():
    from app.billing.stripe_service import DONATION_LIMITS, currency_for

    assert currency_for(User(country="BR", locale="en")) == "BRL"
    assert currency_for(User(country="PT", locale="pt-BR")) == "USD"
    assert currency_for(User(country="US", locale="en")) == "USD"
    assert currency_for(User(country=None, locale="pt-BR")) == "BRL"
    assert DONATION_LIMITS["BRL"][0] == 5 and DONATION_LIMITS["USD"][0] == 3


async def test_donation_gives_three_extra_ai_questions(client):
    from app.billing.stripe_service import _donation_bonus
    from tests.test_ai import JOHN_3_16, ask, set_settings

    await register(client)
    await register(client, email="admin@example.com", name="Admin")
    await make_admin("admin@example.com")
    admin = await login(client, email="admin@example.com")
    tokens = await login(client)
    await set_settings(client, admin, quotas={"free_daily": 1})
    assert (await ask(client, tokens, verse_key_start=JOHN_3_16)).status_code == 200
    assert (await ask(client, tokens, verse_key_start=JOHN_3_16)).status_code == 429

    async with get_sessionmaker()() as db:
        uid = await db.scalar(select(User.id).where(User.email == "ana@example.com"))
        session = {
            "mode": "payment",
            "payment_status": "paid",
            "metadata": {"kind": "donation", "user_id": str(uid)},
        }
        await _donation_bonus(db, "checkout.session.completed", session)
        await db.commit()
    status = (await client.get("/api/v1/ai/status", headers=bearer(tokens))).json()
    assert status["bonus_questions"] == 3
    for _ in range(3):
        assert (await ask(client, tokens, verse_key_start=JOHN_3_16)).status_code == 200
    assert (await ask(client, tokens, verse_key_start=JOHN_3_16)).status_code == 429
