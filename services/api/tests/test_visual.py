from sqlalchemy import delete, insert

from app.bible import original
from app.db.session import get_sessionmaker
from app.models import AIUsage, BiblePlace, PlaceMention, VisualStudy
from tests.conftest import bearer, login, make_admin, register

PLACES = (
    '{"id":"a1","friendly_id":"Nazareth","identifications":[{"resolutions":[{"lonlat":"35.30,32.70","class":"human"}]}],'
    '"verses":[{"sort":"42004016"},{"sort":"42001026"}]}\n'
    '{"id":"a2","friendly_id":"Capernaum","identifications":[{"resolutions":[{"lonlat":"35.57,32.88","class":"human"}]}],'
    '"verses":[{"sort":"42004031"}]}\n'
    '{"id":"a3","friendly_id":"Unknown","identifications":[{"resolutions":[{}]}],"verses":[{"sort":"42004001"}]}\n'
)


async def test_visual_study_generate_cache_and_quota(client):
    places, mentions = original.parse_places(PLACES)
    assert [p["name"] for p in places] == ["Nazareth", "Capernaum"] and len(mentions) == 3
    async with get_sessionmaker()() as db:
        await db.execute(insert(BiblePlace), places)
        await db.execute(insert(PlaceMention), mentions)
        await db.commit()
    try:
        await register(client)
        tokens = await login(client)
        r = (await client.get("/api/v1/visual/LUK/4", headers=bearer(tokens))).json()
        assert r["status"] == "none" and r["can_generate"] and r["remaining"] == 3

        r = await client.post("/api/v1/visual/LUK/4", headers=bearer(tokens))
        assert r.status_code == 200, r.text
        study = r.json()["study"]["content"]
        # O mapa vem da base de lugares (nunca da IA), na ordem em que aparecem no capítulo
        assert [p["name"] for p in study["places"]] == ["Nazareth", "Capernaum"]
        assert study["places"][0]["verse"] == 16 and "OpenBible" in study["credits"][0]
        assert r.json()["remaining"] == 2

        # Outra pessoa vê o mesmo estudo sem gastar cota; em outro idioma, é traduzido
        await register(client, email="bia@example.com", name="Bia")
        bia = await login(client, email="bia@example.com")
        await client.patch("/api/v1/me", headers=bearer(bia), json={"locale": "es"})
        seen = (await client.get("/api/v1/visual/LUK/4", headers=bearer(bia))).json()
        assert seen["status"] == "ready" and seen["study"]["locale"] == "es" and seen["remaining"] == 3
        # Mesmos lugares e coordenadas; só o nome exibido muda de idioma
        strip = lambda ps: [(p["id"], p["lon"], p["lat"]) for p in ps]  # noqa: E731
        assert strip(seen["study"]["content"]["places"]) == strip(study["places"])
        assert study["places"][0]["label"] == "Nazareth"

        # Free: limite mensal
        async with get_sessionmaker()() as db:
            rows = (await db.execute(VisualStudy.__table__.select())).all()
            assert {r.locale for r in rows} == {"pt-BR", "es"}
        for chapter in (5, 6):
            assert (
                await client.post(f"/api/v1/visual/LUK/{chapter}", headers=bearer(tokens))
            ).status_code == 200
        over = await client.post("/api/v1/visual/LUK/7", headers=bearer(tokens))
        assert over.status_code == 402 and over.json()["error"]["code"] == "visual_quota"

        # Admin: sem limite e pode apagar para gerar de novo
        await make_admin()
        admin = await login(client)
        assert (await client.get("/api/v1/visual/LUK/7", headers=bearer(admin))).json()[
            "can_generate"
        ] is True
        assert (await client.delete("/api/v1/visual/LUK/4", headers=bearer(admin))).status_code == 200
        assert (await client.delete("/api/v1/visual/LUK/4", headers=bearer(bia))).status_code == 403
        assert (
            await client.get("/api/v1/visual/images/00000000-0000-0000-0000-000000000000")
        ).status_code == 404
    finally:
        async with get_sessionmaker()() as db:
            for model in (VisualStudy, PlaceMention, BiblePlace):
                await db.execute(delete(model))
            await db.execute(delete(AIUsage))
            await db.commit()
