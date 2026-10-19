"""IA com o provedor de teste ("fake"): fluxo, cotas, orçamento, privacidade e painel do administrador."""

import json
from decimal import Decimal

from sqlalchemy import func, select

from app.db.session import get_sessionmaker
from app.models import AIConversation, AIMessage, AIUsage, User
from app.services import email as email_service
from tests.conftest import bearer, login, make_admin, register

JOHN_3_16 = 43003016


def events(response) -> list[dict]:
    return [json.loads(line[6:]) for line in response.text.splitlines() if line.startswith("data: ")]


async def ask(client, tokens, **body):
    payload = {"translation": "blivre", "mode": "simple", **body}
    return await client.post("/api/v1/ai/ask", headers=bearer(tokens), json=payload)


async def set_settings(client, admin_tokens, **changes):
    current = (await client.get("/api/v1/admin/settings", headers=bearer(admin_tokens))).json()
    body = {
        k: current[k]
        for k in (
            "enabled",
            "models",
            "quotas",
            "budget_daily_usd",
            "budget_monthly_usd",
            "budget_hard_daily_usd",
            "alert_email",
            "usd_brl",
        )
    }
    for k, v in changes.items():
        if isinstance(v, dict) and isinstance(body.get(k), dict):
            body[k] = {**body[k], **v}
        else:
            body[k] = v
    r = await client.put("/api/v1/admin/settings", headers=bearer(admin_tokens), json=body)
    assert r.status_code == 200, r.text
    return r.json()


async def test_explain_passage_streams_and_records_usage(client):
    await register(client)
    tokens = await login(client)
    r = await ask(client, tokens, verse_key_start=JOHN_3_16, verse_key_end=43003017, mode="exegesis")
    assert r.status_code == 200
    assert r.headers["content-type"].startswith("text/event-stream")
    ev = events(r)
    assert ev[0]["type"] == "start" and ev[0]["conversation_id"]
    text = "".join(e["text"] for e in ev if e["type"] == "delta")
    assert "Gênesis 1:1" in text
    assert ev[-1]["type"] == "done" and ev[-1]["invalid_references"] == []

    async with get_sessionmaker()() as db:
        usage = (await db.scalars(select(AIUsage))).all()
        assert [(u.feature, u.status, u.plan) for u in usage] == [("explain", "ok", "free")]
        assert usage[0].input_tokens > 0
        conv = await db.scalar(select(AIConversation))
        assert conv.title == "João 3:16–17"
        roles = [m.role for m in await db.scalars(select(AIMessage).order_by(AIMessage.created_at))]
        assert roles == ["user", "assistant"]


async def test_invented_references_are_flagged(client):
    await register(client)
    tokens = await login(client)
    r = await ask(client, tokens, verse_key_start=JOHN_3_16, question="INVALIDREF")
    done = events(r)[-1]
    assert done["invalid_references"] == ["João 30:1"]


async def test_follow_up_in_same_conversation(client):
    await register(client)
    tokens = await login(client)
    first = events(await ask(client, tokens, verse_key_start=JOHN_3_16))
    cid = first[0]["conversation_id"]
    r = await ask(client, tokens, conversation_id=cid, question="E o que significa unigênito?")
    assert events(r)[-1]["type"] == "done"
    conv = (await client.get(f"/api/v1/ai/conversations/{cid}", headers=bearer(tokens))).json()
    assert [m["role"] for m in conv["messages"]] == ["user", "assistant", "user", "assistant"]


async def test_off_topic_question_is_refused_cheaply(client):
    await register(client)
    tokens = await login(client)
    r = await ask(client, tokens, question="Qual é a cotação do dólar hoje?")
    ev = events(r)
    assert "estudo das Escrituras" in "".join(e.get("text", "") for e in ev)
    assert ev[-1]["off_topic"] is True
    async with get_sessionmaker()() as db:
        features = [(u.feature, u.status) for u in await db.scalars(select(AIUsage))]
    assert features == [("classify", "blocked")]


async def test_free_daily_quota_and_pro_bypass(client):
    await register(client, email="admin@example.com", name="Admin")
    await register(client)
    await make_admin("admin@example.com")
    admin = await login(client, email="admin@example.com")
    tokens = await login(client)
    await set_settings(client, admin, quotas={"free_daily": 2})

    status = (await client.get("/api/v1/ai/status", headers=bearer(tokens))).json()
    assert status == {"plan": "free", "enabled": True, "modes": status["modes"], "free_remaining_today": 2}

    for _ in range(2):
        assert (await ask(client, tokens, verse_key_start=JOHN_3_16)).status_code == 200
    blocked = await ask(client, tokens, verse_key_start=JOHN_3_16)
    assert blocked.status_code == 429
    assert blocked.json()["error"]["code"] == "ai_quota_free_daily"

    # Cortesia Pro dada pelo administrador libera a IA
    async with get_sessionmaker()() as db:
        uid = await db.scalar(select(User.id).where(User.email == "ana@example.com"))
    assert (
        await client.post(f"/api/v1/admin/users/{uid}/pro", headers=bearer(admin), json={"days": 30})
    ).json() == {"plan": "pro"}
    assert (await ask(client, tokens, verse_key_start=JOHN_3_16)).status_code == 200
    assert (await client.get("/api/v1/ai/status", headers=bearer(tokens))).json()["plan"] == "pro"


async def test_pro_safety_cap_per_minute(client):
    await register(client, email="admin@example.com", name="Admin")
    await register(client)
    await make_admin("admin@example.com")
    admin = await login(client, email="admin@example.com")
    tokens = await login(client)
    await set_settings(client, admin, quotas={"pro_per_minute": 2})
    async with get_sessionmaker()() as db:
        uid = await db.scalar(select(User.id).where(User.email == "ana@example.com"))
    await client.post(f"/api/v1/admin/users/{uid}/pro", headers=bearer(admin), json={})
    for _ in range(2):
        assert (await ask(client, tokens, verse_key_start=JOHN_3_16)).status_code == 200
    r = await ask(client, tokens, verse_key_start=JOHN_3_16)
    assert r.json()["error"]["code"] == "ai_rate_limited"


async def test_budget_pauses_free_and_alerts_admin(client):
    await register(client, email="admin@example.com", name="Admin")
    await register(client)
    admin_id = await make_admin("admin@example.com")
    admin = await login(client, email="admin@example.com")
    tokens = await login(client)
    await set_settings(client, admin, budget_daily_usd=1.0, budget_hard_daily_usd=5.0)

    # Simula gasto de US$ 0,90 hoje (90%): a próxima chamada dispara o alerta de 80%
    async with get_sessionmaker()() as db:
        db.add(
            AIUsage(
                user_id=admin_id,
                plan="pro",
                feature="explain",
                provider="anthropic",
                model="claude-opus-5-5",
                cost_usd=Decimal("0.90"),
                usd_brl=Decimal("5.4"),
                cost_brl=Decimal("4.86"),
                status="ok",
            )
        )
        await db.commit()
    email_service.outbox.clear()
    assert (await ask(client, tokens, verse_key_start=JOHN_3_16)).status_code == 200
    alerts = [m for m in email_service.outbox if "orçamento" in m.subject]
    assert len(alerts) == 1 and alerts[0].to == "admin@example.com" and "80%" in alerts[0].subject

    # Passou de 100%: Free pausado, Pro continua
    async with get_sessionmaker()() as db:
        db.add(
            AIUsage(
                user_id=admin_id,
                plan="pro",
                feature="explain",
                provider="anthropic",
                model="claude-opus-5-5",
                cost_usd=Decimal("0.20"),
                usd_brl=Decimal("5.4"),
                cost_brl=Decimal("1.08"),
                status="ok",
            )
        )
        await db.commit()
    r = await ask(client, tokens, verse_key_start=JOHN_3_16)
    assert r.json()["error"]["code"] == "ai_unavailable_free"
    await client.post(f"/api/v1/admin/users/{admin_id}/pro", headers=bearer(admin), json={})
    assert (await ask(client, admin, verse_key_start=JOHN_3_16)).status_code == 200


async def test_ai_switch_off(client):
    await register(client, email="admin@example.com", name="Admin")
    await make_admin("admin@example.com")
    admin = await login(client, email="admin@example.com")
    await set_settings(client, admin, enabled=False)
    r = await ask(client, admin, verse_key_start=JOHN_3_16)
    assert r.json()["error"]["code"] == "ai_unavailable"


async def test_admin_panel_costs_without_content(client):
    await register(client, email="admin@example.com", name="Admin")
    await register(client)
    admin_id = await make_admin("admin@example.com")
    admin = await login(client, email="admin@example.com")
    tokens = await login(client)
    events(await ask(client, tokens, verse_key_start=JOHN_3_16, question="Pergunta secreta sobre minha vida"))
    async with get_sessionmaker()() as db:
        db.add(
            AIUsage(
                user_id=admin_id,
                plan="pro",
                feature="chat",
                provider="anthropic",
                model="claude-opus-5-5",
                input_tokens=6000,
                output_tokens=2500,
                cost_usd=Decimal("0.074"),
                usd_brl=Decimal("5.4"),
                cost_brl=Decimal("0.3996"),
                status="ok",
            )
        )
        await db.commit()

    # Usuário comum não acessa nada do painel
    for path in ("/api/v1/admin/ai/overview", "/api/v1/admin/ai/users", "/api/v1/admin/settings"):
        assert (await client.get(path, headers=bearer(tokens))).status_code == 403

    overview = (await client.get("/api/v1/admin/ai/overview", headers=bearer(admin))).json()
    assert overview["month"]["requests"] == 2
    assert overview["month"]["cost_usd"] == 0.074
    assert {g["key"] for g in overview["by_feature"]} == {"explain", "chat"}
    assert overview["daily"][-1]["requests"] == 2

    ranking = (await client.get("/api/v1/admin/ai/users", headers=bearer(admin))).json()["users"]
    assert ranking[0]["email"] == "admin@example.com" and ranking[0]["cost_brl"] == 0.3996

    ana_id = next(u["user_id"] for u in ranking if u["email"] == "ana@example.com")
    detail = (await client.get(f"/api/v1/admin/ai/users/{ana_id}", headers=bearer(admin))).json()
    assert detail["requests"][0]["feature"] == "explain"
    assert "secreta" not in json.dumps(detail) and "secreta" not in json.dumps(overview)


async def test_admin_price_change_keeps_history(client):
    await register(client, email="admin@example.com", name="Admin")
    await make_admin("admin@example.com")
    admin = await login(client, email="admin@example.com")
    r = await client.post(
        "/api/v1/admin/ai/prices",
        headers=bearer(admin),
        json={
            "model": "claude-opus-5-5",
            "input_per_mtok": 3,
            "output_per_mtok": 15,
            "cache_read_per_mtok": 0.15,
            "cache_write_per_mtok": 3.75,
            "valid_from": "2030-01-01",
        },
    )
    opus = [p for p in r.json()["prices"] if p["model"] == "claude-opus-5-5"]
    assert [p["valid_from"] for p in opus] == ["2030-01-01", "2026-01-01"]

    bad = await client.put(
        "/api/v1/admin/settings",
        headers=bearer(admin),
        json={**r.json(), "budget_hard_daily_usd": 1, "budget_daily_usd": 5},
    )
    assert bad.status_code == 422


async def test_cost_calculation_uses_price_table():
    from datetime import date

    from app.ai.costs import cost_usd, price_for
    from app.ai.provider import Usage

    async with get_sessionmaker()() as db:
        price = await price_for(db, "claude-opus-5-5", date(2026, 10, 18))
        usage = Usage(input_tokens=6000, output_tokens=2500, cache_read_tokens=3000, cache_write_tokens=0)
        # 6000*4 + 2500*20 + 3000*0.20 = 24000 + 50000 + 600 = 74600 / 1e6
        assert cost_usd(price, usage) == Decimal("0.074600")
        assert (
            await price_for(db, "claude-opus-5-5-20261001", date(2026, 10, 18))
        ).model == "claude-opus-5-5"


async def test_conversations_are_private_and_deletable(client):
    await register(client, email="ana@example.com")
    await register(client, email="bruno@example.com", name="Bruno")
    ana = await login(client, email="ana@example.com")
    bruno = await login(client, email="bruno@example.com")
    cid = events(await ask(client, ana, verse_key_start=JOHN_3_16))[0]["conversation_id"]
    assert (await client.get(f"/api/v1/ai/conversations/{cid}", headers=bearer(bruno))).status_code == 404
    assert (await ask(client, bruno, conversation_id=cid, question="oi")).status_code == 404

    r = await client.patch(f"/api/v1/ai/conversations/{cid}", headers=bearer(ana), json={"saved": True})
    assert r.json()["saved"] is True
    saved = (await client.get("/api/v1/ai/conversations?saved=true", headers=bearer(ana))).json()[
        "conversations"
    ]
    assert [c["id"] for c in saved] == [cid]
    assert (await client.delete(f"/api/v1/ai/conversations/{cid}", headers=bearer(ana))).status_code == 204
    async with get_sessionmaker()() as db:
        assert await db.scalar(select(func.count()).select_from(AIMessage)) == 0


def test_study_prompt_requires_scripture_or_named_sources():
    from app.ai.prompts import SYSTEM_PROMPT

    assert "Grounding rules" in SYSTEM_PROMPT
    assert "the author AND the work" in SYSTEM_PROMPT
    assert "Forbidden: unattributed claims" in SYSTEM_PROMPT
    assert "## Fontes / Sources" in SYSTEM_PROMPT
    # Esclarece dúvidas e indica material existente, mas não produz ministrações/estudos
    assert "Do NOT write sermons, sermon outlines, Bible-study lessons" in SYSTEM_PROMPT
    assert "Para se aprofundar" in SYSTEM_PROMPT


async def test_ai_teacher_quiz(client):
    await register(client)
    tokens = await login(client)
    r = await client.post(
        "/api/v1/ai/quiz",
        headers=bearer(tokens),
        json={"translation": "blivre", "verse_key_start": 43003016, "verse_key_end": 43003018},
    )
    assert r.status_code == 200, r.text
    data = r.json()
    assert data["reference"].startswith("João 3:16") and data["questions"]
    q = data["questions"][0]
    assert len(q["options"]) >= 2 and 0 <= q["answer"] < len(q["options"])
    too_long = await client.post(
        "/api/v1/ai/quiz",
        headers=bearer(tokens),
        json={"translation": "blivre", "verse_key_start": 19001001, "verse_key_end": 19119176},
    )
    assert too_long.status_code == 422
