from datetime import date, timedelta

from sqlalchemy import func, select

from app.db.session import get_sessionmaker
from app.devotional.catalog import PASSAGES, catalog, item_for_day, plans, reference
from app.models import AIUsage, DailyDevotional, PlanEnrollment
from tests.conftest import bearer, login, make_admin, register


def test_catalog_and_plans_are_valid_references():
    for refs in PASSAGES.values():
        for r in refs:
            reference(r)
    for p in plans().values():
        assert p.days, p.code
        for day in p.days:
            for r in day:
                reference(r)
    # Bíblia em um ano cobre todos os 1.189 capítulos, sem repetir
    chapters = []
    for day in plans()["bible-1-year"].days:
        for r in day:
            ref = reference(r)
            chapters += [(ref.book, c) for c in range(ref.chapter, (ref.chapter_end or ref.chapter) + 1)]
    assert len(chapters) == len(set(chapters)) == 1189


def test_daily_devotional_never_repeats_within_a_year():
    assert len(catalog()) == len({i.ref for i in catalog()}) == 366
    for year in (2026, 2027, 2028):  # 2028 é bissexto
        start = date(year, 1, 1)
        days = (date(year + 1, 1, 1) - start).days
        seen = [item_for_day(start + timedelta(days=i)).ref for i in range(days)]
        assert len(set(seen)) == days
    # Cada ano tem uma ordem diferente
    assert item_for_day(date(2026, 3, 1)) != item_for_day(date(2027, 3, 1))


async def test_every_catalog_passage_exists_in_the_bibles(client):
    from app.devotional.service import keys_for, passage_text

    async with get_sessionmaker()() as db:
        for item in catalog():
            start, end = keys_for(reference(item.ref))
            for code in ("blivre", "web", "rv1909"):
                _, verses = await passage_text(db, code, start, end)
                assert verses, (item.ref, code)


async def test_daily_devotional_generated_once_per_day(client):
    await register(client)
    tokens = await login(client)
    a = (await client.get("/api/v1/devotionals/today", headers=bearer(tokens))).json()
    b = (await client.get("/api/v1/devotionals/today", headers=bearer(tokens))).json()
    assert a["id"] == b["id"]
    assert a["verses"] and a["translation"] == "BLIVRE"
    assert set(a["content"]) >= {"title", "reflection", "application", "questions", "prayer"}
    async with get_sessionmaker()() as db:
        assert await db.scalar(select(func.count()).select_from(DailyDevotional)) == 1
        # Custo do sistema, sem usuário
        usage = (await db.scalars(select(AIUsage))).all()
        assert [(u.feature, u.plan, u.user_id) for u in usage] == [("devotional_daily", "system", None)]


async def test_mark_complete_and_streak(client):
    await register(client)
    tokens = await login(client)
    r = await client.post(
        "/api/v1/devotionals/today/mark",
        headers=bearer(tokens),
        json={"completed": True, "favorite": True, "note": "Minha anotação"},
    )
    body = r.json()
    assert body["current_streak"] == 1 and body["mine"]["favorite"] is True
    today = (await client.get("/api/v1/devotionals/today", headers=bearer(tokens))).json()
    assert today["mine"]["note"] == "Minha anotação"
    favs = (await client.get("/api/v1/me/devotionals?favorites=true", headers=bearer(tokens))).json()[
        "devotionals"
    ]
    assert len(favs) == 1 and favs[0]["kind"] == "daily"


async def test_personal_devotional_is_admin_only(client):
    await register(client, email="bia@example.com", name="Bia")
    user = await login(client, email="bia@example.com")
    r = await client.post("/api/v1/devotionals/personal", headers=bearer(user), json={"theme": "hope"})
    assert r.status_code == 403

    await register(client)
    await make_admin()
    tokens = await login(client)
    r = await client.post(
        "/api/v1/devotionals/personal", headers=bearer(tokens), json={"theme": "hope", "length": "short"}
    )
    assert r.status_code == 200, r.text
    assert r.json()["kind"] == "ai" and r.json()["theme_label"] == "Esperança"
    r = await client.post(
        "/api/v1/devotionals/personal",
        headers=bearer(tokens),
        json={"verse_key_start": 19023001, "verse_key_end": 19023006},
    )
    assert r.json()["reference"] == "Salmos 23:1–6"
    assert (
        await client.post("/api/v1/devotionals/personal", headers=bearer(tokens), json={})
    ).status_code == 422


async def test_admin_schedules_and_publishes_devotional_for_everyone(client):
    from datetime import date as _date

    await register(client)
    await make_admin()
    admin = await login(client)
    agenda = (await client.get("/api/v1/admin/devotionals?days=7", headers=bearer(admin))).json()
    assert len(agenda["days"]) == 7 and len(agenda["themes"]) == 28
    today = _date.today().isoformat()

    # Gera com a IA nos três idiomas, com uma passagem escolhida
    r = await client.post(
        "/api/v1/admin/devotionals/generate",
        headers=bearer(admin),
        json={"day": today, "reference": "Salmos 23", "theme": "trust"},
    )
    assert r.status_code == 200, r.text
    assert [d["locale"] for d in r.json()["days"]] == ["pt-BR", "en", "es"]
    assert r.json()["days"][2]["reference"] == "Salmos 23"

    # Texto escrito pelo admin aparece para todos naquele dia
    saved = await client.put(
        "/api/v1/admin/devotionals",
        headers=bearer(admin),
        json={
            "day": today,
            "locale": "pt-BR",
            "theme": "trust",
            "reference": "Sl 23:1-4",
            "content": {
                "title": "O Senhor é o meu pastor",
                "reflection": "Veja também João 10:11.",
                "questions": [],
            },
        },
    )
    assert saved.status_code == 200, saved.text
    assert saved.json()["status"] == "edited"
    await register(client, email="bia@example.com", name="Bia")
    user = await login(client, email="bia@example.com")
    seen = (await client.get("/api/v1/devotionals/today", headers=bearer(user))).json()
    assert seen["content"]["title"] == "O Senhor é o meu pastor" and seen["reference"] == "Salmos 23:1–4"
    assert seen["content"]["invalid_references"] == []
    assert (await client.get("/api/v1/admin/devotionals", headers=bearer(user))).status_code == 403

    # Voltar ao automático mantém o dia (e quem já marcou como concluído)
    back = await client.delete(f"/api/v1/admin/devotionals/{today}/pt-BR", headers=bearer(admin))
    assert back.json()["status"] == "auto"


async def test_own_devotional(client):
    await register(client)
    tokens = await login(client)
    r = await client.post(
        "/api/v1/me/devotionals",
        headers=bearer(tokens),
        json={
            "title": "Meu devocional",
            "verse_key_start": 43015001,
            "verse_key_end": 43015005,
            "reflection": "Permanecer.",
        },
    )
    assert r.json()["content"]["title"] == "Meu devocional"
    mine = (await client.get("/api/v1/me/devotionals", headers=bearer(tokens))).json()["devotionals"]
    assert [d["kind"] for d in mine] == ["own"]


async def test_reading_plan_lifecycle(client):
    await register(client)
    tokens = await login(client)
    catalog_ = (await client.get("/api/v1/reading-plans", headers=bearer(tokens))).json()["plans"]
    assert {"bible-1-year", "nt-90", "psalms-30", "parables-30"} <= {p["code"] for p in catalog_}
    detail = (await client.get("/api/v1/reading-plans/psalms-30", headers=bearer(tokens))).json()
    assert detail["schedule"][0]["readings"][0]["label"] == "Salmos 1–5"

    start = date.today() - timedelta(days=4)  # começou há 5 dias (hoje é o dia 5)
    e = (
        await client.post(
            "/api/v1/me/reading-plans",
            headers=bearer(tokens),
            json={"code": "psalms-30", "start_date": start.isoformat()},
        )
    ).json()
    assert e["current_day"] == 5 and e["behind"] == 4
    eid = e["id"]
    for d in (1, 2):
        e = (
            await client.post(
                f"/api/v1/me/reading-plans/{eid}/days/{d}", headers=bearer(tokens), json={"done": True}
            )
        ).json()
    assert e["done_days"] == [1, 2] and e["behind"] == 2 and e["progress"] == round(2 / 30 * 100, 1)

    # Reprogramar: hoje passa a ser o primeiro dia não lido (3)
    e = (
        await client.post(
            f"/api/v1/me/reading-plans/{eid}/action", headers=bearer(tokens), json={"action": "reschedule"}
        )
    ).json()
    assert e["current_day"] == 3 and e["behind"] == 0

    e = (
        await client.post(
            f"/api/v1/me/reading-plans/{eid}/action", headers=bearer(tokens), json={"action": "pause"}
        )
    ).json()
    assert e["status"] == "paused"
    async with get_sessionmaker()() as db:
        row = await db.get(PlanEnrollment, __import__("uuid").UUID(eid))
        # Simula: pausado há 3 dias, no dia 3 do plano
        row.start_date -= timedelta(days=3)
        row.paused_on = date.today() - timedelta(days=3)
        await db.commit()
    e = (
        await client.post(
            f"/api/v1/me/reading-plans/{eid}/action", headers=bearer(tokens), json={"action": "resume"}
        )
    ).json()
    # Os dias pausados não contam: continua no dia 3
    assert e["status"] == "active" and e["current_day"] == 3

    # Outro usuário não acessa
    await register(client, email="bruno@example.com", name="Bruno")
    bruno = await login(client, email="bruno@example.com")
    assert (
        await client.post(
            f"/api/v1/me/reading-plans/{eid}/days/3", headers=bearer(bruno), json={"done": True}
        )
    ).status_code == 404
    assert (await client.delete(f"/api/v1/me/reading-plans/{eid}", headers=bearer(tokens))).status_code == 204


async def test_notification_preferences(client):
    await register(client)
    tokens = await login(client)
    assert (await client.get("/api/v1/me/notifications", headers=bearer(tokens))).json()[
        "devotional_time"
    ] is None
    r = await client.put(
        "/api/v1/me/notifications",
        headers=bearer(tokens),
        json={"devotional_time": "06:30", "plan_reminders": False},
    )
    assert r.json()["devotional_time"] == "06:30"
    bad = await client.put(
        "/api/v1/me/notifications", headers=bearer(tokens), json={"devotional_time": "25:99"}
    )
    assert bad.status_code == 422


async def test_devotional_is_bible_only_with_checked_references(client):
    from app.devotional.prompts import SCHEMA, SYSTEM
    from app.devotional.service import checked_content
    from app.models import BibleTranslation

    assert "100% biblical" in SYSTEM and "Do NOT use outside sources" in SYSTEM
    assert "references" in SCHEMA["required"]

    await register(client)
    tokens = await login(client)
    today = (await client.get("/api/v1/devotionals/today", headers=bearer(tokens))).json()
    assert today["content"]["references"] and today["content"]["invalid_references"] == []

    # Uma referência inventada sai da base bíblica e vira aviso
    async with get_sessionmaker()() as db:
        t = await db.scalar(select(BibleTranslation).where(BibleTranslation.code == "blivre"))
        content = await checked_content(
            db,
            t,
            {"reflection": "Veja João 3:16 e também João 30:1.", "references": ["João 3:16", "João 30:1"]},
        )
    assert content["references"] == ["João 3:16"]
    assert content["invalid_references"] == ["João 30:1"]


async def test_devotionals_are_prepared_ahead_in_each_language(client):
    from app.devotional import prewarm

    assert await prewarm.prepare(days_ahead=1) == 6  # 3 idiomas x hoje e amanhã
    assert await prewarm.prepare(days_ahead=1) == 0  # nada é gerado duas vezes
    async with get_sessionmaker()() as db:
        locales = sorted(
            await db.scalars(select(DailyDevotional.locale).where(DailyDevotional.day == date.today()))
        )
    assert locales == ["en", "es", "pt-BR"]


async def test_devotional_comes_in_the_user_language(client):
    await register(client)
    tokens = await login(client)
    await client.patch("/api/v1/me", headers=bearer(tokens), json={"locale": "es"})
    es = (await client.get("/api/v1/devotionals/today", headers=bearer(tokens))).json()
    assert es["translation"] == "RV1909"
    # Qualquer idioma: o devocional em português é traduzido (uma vez por dia e idioma)
    await client.patch("/api/v1/me", headers=bearer(tokens), json={"locale": "fr"})
    fr = (await client.get("/api/v1/devotionals/today", headers=bearer(tokens))).json()
    again = (await client.get("/api/v1/devotionals/today", headers=bearer(tokens))).json()
    assert fr["id"] == again["id"] and fr["translation"] == "WEB"  # sem Bíblia francesa no teste
    async with get_sessionmaker()() as db:
        rows = {
            r.locale: r
            for r in await db.scalars(select(DailyDevotional).where(DailyDevotional.day == date.today()))
        }
        usage = [u.feature for u in (await db.scalars(select(AIUsage))).all()]
    assert rows["fr"].model.startswith("translate:") and rows["es"].model.startswith("translate:")
    assert rows["fr"].verse_key_start == rows["pt-BR"].verse_key_start
    assert usage.count("devotional_daily") == 1 and usage.count("devotional_translate") == 2


async def test_my_devotionals_lists_only_completed(client):
    await register(client)
    tokens = await login(client)
    assert (await client.get("/api/v1/me/devotionals?completed=true", headers=bearer(tokens))).json()[
        "devotionals"
    ] == []
    await client.post("/api/v1/devotionals/today/mark", headers=bearer(tokens), json={"favorite": True})
    assert (await client.get("/api/v1/me/devotionals?completed=true", headers=bearer(tokens))).json()[
        "devotionals"
    ] == []
    await client.post("/api/v1/devotionals/today/mark", headers=bearer(tokens), json={"completed": True})
    done = (await client.get("/api/v1/me/devotionals?completed=true", headers=bearer(tokens))).json()[
        "devotionals"
    ]
    assert len(done) == 1 and done[0]["kind"] == "daily" and done[0]["mine"]["completed_on"]


async def test_daily_made_without_ai_is_redone_when_ai_returns(client):
    """Sem IA (ex.: antes de as chaves serem cadastradas) sai a versão reserva curta; depois ela é refeita."""
    from app.devotional import service
    from app.services.settings import set_setting

    async with get_sessionmaker()() as db:
        await set_setting(db, "ai.enabled", {"value": False})
        await db.commit()
        short = await service.daily(db, "pt-BR")
        assert service.incomplete(short) and short.model == "none"
        await set_setting(db, "ai.enabled", {"value": True})
        await db.commit()
        full = await service.daily(db, "pt-BR")
        assert full.id == short.id and not service.incomplete(full) and full.model != "none"


async def test_plan_day_counts_in_streak(client):
    from tests.conftest import bearer, login, register

    await register(client)
    h = bearer(await login(client))
    e = (await client.post("/api/v1/me/reading-plans", json={"code": "miracles-30"}, headers=h)).json()
    assert (await client.get("/api/v1/me/devotionals/stats", headers=h)).json()["current_streak"] == 0
    await client.post(f"/api/v1/me/reading-plans/{e['id']}/days/1", json={"done": True}, headers=h)
    stats = (await client.get("/api/v1/me/devotionals/stats", headers=h)).json()
    assert stats["current_streak"] == 1 and stats["calendar"][-1]["done"]
