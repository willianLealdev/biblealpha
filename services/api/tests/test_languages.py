from app.api.routes import languages
from tests.conftest import bearer, login, make_admin, register

SOURCE = {"common": {f"k{i}": f"Text {i}" for i in range(60)}, "bible": {"downloading": "Downloading {pct}%"}}


async def test_builtin_languages_are_listed(client):
    items = (await client.get("/api/v1/languages")).json()
    assert [x["code"] for x in items] == ["pt-BR", "en", "es"]


async def test_admin_adds_language_and_app_downloads_it(client, monkeypatch):
    async def fake_translate(db, cu, code, flat):
        # A IA devolve um texto sem o marcador {pct}: esse fica de fora (o app usa o inglês)
        out = {k: f"FR {v}" for k, v in flat.items() if "{" not in v}
        out["bible.downloading"] = "Téléchargement"
        return {k: v for k, v in out.items() if k != "bible.downloading"}

    monkeypatch.setattr(languages, "_translate", fake_translate)
    await register(client)
    await make_admin()
    tokens = await login(client)

    r = await client.post(
        "/api/v1/admin/languages",
        headers=bearer(tokens),
        json={"code": "fr", "name": "Français", "source": SOURCE},
    )
    assert r.status_code == 200, r.text
    assert r.json()["translated"] == 60 and r.json()["total"] == 61

    # Só aparece no app depois de ativado
    assert "fr" not in [x["code"] for x in (await client.get("/api/v1/languages")).json()]
    await client.patch("/api/v1/admin/languages/fr", headers=bearer(tokens), json={"enabled": True})
    assert "fr" in [x["code"] for x in (await client.get("/api/v1/languages")).json()]

    d = (await client.get("/api/v1/languages/fr")).json()
    assert d["dictionary"]["common"]["k1"] == "FR Text 1" and d["version"] == 1
    assert d["books"]["GEN"]["name"].startswith("FR Genesis")

    # Correção pelo painel sobe a versão (o app baixa de novo)
    r = await client.patch(
        "/api/v1/admin/languages/fr",
        headers=bearer(tokens),
        json={"texts": {"bible.downloading": "Téléchargement {pct}%"}},
    )
    assert r.json()["version"] == 2
    d = (await client.get("/api/v1/languages/fr")).json()
    assert d["dictionary"]["bible"]["downloading"] == "Téléchargement {pct}%"

    assert (
        await client.post(
            "/api/v1/admin/languages",
            headers=bearer(tokens),
            json={"code": "es", "name": "Español", "source": SOURCE},
        )
    ).status_code == 422
    assert (await client.delete("/api/v1/admin/languages/fr", headers=bearer(tokens))).status_code == 200
    assert (await client.get("/api/v1/languages/fr")).status_code == 404


async def test_translate_keeps_placeholders_with_fake_provider(client):
    await register(client)
    await make_admin()
    tokens = await login(client)
    r = await client.post(
        "/api/v1/admin/languages",
        headers=bearer(tokens),
        json={"code": "de", "name": "Deutsch", "source": SOURCE},
    )
    # O provedor de teste não devolve as chaves: nada é traduzido, nada quebra
    assert r.status_code == 200 and r.json()["translated"] == 0
    await client.delete("/api/v1/admin/languages/de", headers=bearer(tokens))


async def test_world_languages_and_countries(client):
    data = (await client.get("/api/v1/languages/world")).json()
    codes = {x["code"]: x for x in data["languages"]}
    assert len(codes) > 100 and codes["pt-BR"]["status"] == "ready" and codes["de"]["status"] == "new"
    assert codes["es"]["bible"] == "rv1909" and codes["en"]["bible"] == "web"
    ch = next(c for c in data["countries"] if c["code"] == "CH")
    assert ch["languages"] == ["de", "fr", "it", "rm"]
    assert all(lang in codes for c in data["countries"] for lang in c["languages"])


async def test_user_language_is_translated_on_first_pick(client, monkeypatch):
    async def fake_translate(db, user_id, code, flat):
        return {k: f"DE {v}" for k, v in flat.items()}

    monkeypatch.setattr(languages, "_translate", fake_translate)
    await register(client)
    await make_admin()
    admin = await login(client)
    # Sem os textos em inglês enviados pelo app do admin, ainda não dá para preparar
    await register(client, email="bia@example.com", name="Bia")
    user = await login(client, email="bia@example.com")
    r = await client.post("/api/v1/languages/de/prepare", headers=bearer(user))
    assert r.status_code == 503

    r = await client.put(
        "/api/v1/admin/languages/source", headers=bearer(admin), json={"hash": "v1", "source": SOURCE}
    )
    assert r.json()["changed"] is True
    assert (
        await client.put(
            "/api/v1/admin/languages/source", headers=bearer(admin), json={"hash": "v1", "source": SOURCE}
        )
    ).json()["changed"] is False

    await languages._translate_language("de")  # o que o pedido abaixo dispara em segundo plano
    r = await client.post("/api/v1/languages/de/prepare", headers=bearer(user))
    assert r.json()["status"] == "ready"
    d = (await client.get("/api/v1/languages/de")).json()
    assert d["dictionary"]["common"]["k1"] == "DE Text 1" and d["books"]["GEN"]["name"].startswith("DE")
    world = (await client.get("/api/v1/languages/world")).json()
    assert next(x for x in world["languages"] if x["code"] == "de")["status"] == "ready"
    assert (await client.post("/api/v1/languages/xx/prepare", headers=bearer(user))).status_code == 404


async def test_country_is_saved_on_sign_up_and_profile(client):
    r = await client.post(
        "/api/v1/auth/register",
        json={
            "name": "Hans",
            "email": "hans@example.com",
            "password": "Graça&Paz123",
            "accept_terms": True,
            "locale": "de",
            "country": "CH",
        },
    )
    assert r.status_code == 201, r.text
    from tests.conftest import last_token

    await client.post("/api/v1/auth/verify-email", json={"token": last_token("/verify-email")})
    tokens = await login(client, email="hans@example.com")
    me = (await client.get("/api/v1/me", headers=bearer(tokens))).json()
    assert me["country"] == "CH" and me["locale"] == "de"
    me = (await client.patch("/api/v1/me", headers=bearer(tokens), json={"country": "BR"})).json()
    assert me["country"] == "BR"
    assert (
        await client.patch("/api/v1/me", headers=bearer(tokens), json={"country": "brasil"})
    ).status_code == 422
