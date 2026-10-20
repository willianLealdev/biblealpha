from datetime import UTC, datetime, timedelta

from app.agenda import reminders
from app.services import email as email_service
from tests.conftest import bearer, login, make_admin, register


async def _sermon(client, headers, title="Jesus chorou"):
    r = await client.post("/api/v1/sermons", headers=headers, json={"title": title})
    assert r.status_code == 201, r.text
    return r.json()


async def test_screen_pairing_and_slides(client):
    # A tela abre sem login e mostra o código / QR code
    opened = await client.post("/api/v1/screens")
    assert opened.status_code == 201
    screen = opened.json()
    assert screen["status"] == "waiting" and len(screen["code"]) == 6
    assert screen["pair_url"].endswith(f"/pair?code={screen['code']}")
    display = {"X-Screen-Token": screen["token"]}
    state_url = f"/api/v1/screens/{screen['id']}/state"
    assert (await client.get(state_url)).status_code == 404  # sem o token da tela, nada
    assert (await client.get(state_url, headers=display)).json()["status"] == "waiting"

    await register(client)
    ana = bearer(await login(client))
    s = await _sermon(client, ana)
    # O app confere o código lido antes de pedir a ministração
    ok = await client.post("/api/v1/screens/check", headers=ana, json={"code": screen["pair_url"]})
    assert ok.status_code == 200 and ok.json()["code"] == screen["code"]
    bad = await client.post("/api/v1/screens/check", headers=ana, json={"code": "ZZZZ99"})
    assert bad.status_code == 404
    # Pareia com o link lido do QR code
    r = await client.post(
        "/api/v1/screens/pair", headers=ana, json={"code": screen["pair_url"], "sermon_id": s["id"]}
    )
    assert r.status_code == 200, r.text
    assert r.json()["status"] == "paired"

    r = await client.put(
        f"/api/v1/screens/{screen['id']}/slide",
        headers=ana,
        json={"text": "Jesus chorou.", "reference": "João 11:35"},
    )
    assert r.status_code == 200
    state = (await client.get(state_url, headers=display)).json()
    assert state["slide"] == {"text": "Jesus chorou.", "reference": "João 11:35"}
    # A tela não recebe o título da ministração
    assert "Jesus chorou" not in str({k: v for k, v in state.items() if k != "slide"})

    # Fundo e estilo criados pela IA (sem chave de imagem nos testes: só cores)
    r = await client.post(f"/api/v1/screens/{screen['id']}/background", headers=ana)
    assert r.status_code == 200, r.text
    bg = r.json()["background"]
    assert bg["id"] and bg["style"]["text_color"].startswith("#")

    # Limpar a tela (só o fundo)
    await client.put(f"/api/v1/screens/{screen['id']}/slide", headers=ana, json={"text": ""})
    assert (await client.get(state_url, headers=display)).json()["slide"] is None

    # Outra pessoa não controla nem toma a tela
    await register(client, email="bia@example.com", name="Bia")
    bia = bearer(await login(client, email="bia@example.com"))
    sb = await _sermon(client, bia, "Outra")
    assert (
        await client.put(f"/api/v1/screens/{screen['id']}/slide", headers=bia, json={"text": "x"})
    ).status_code == 404
    r = await client.post(
        "/api/v1/screens/pair", headers=bia, json={"code": screen["code"], "sermon_id": sb["id"]}
    )
    assert r.status_code == 409
    # Nem pareia com a ministração de outra pessoa
    other = (await client.post("/api/v1/screens")).json()
    r = await client.post(
        "/api/v1/screens/pair", headers=bia, json={"code": other["code"], "sermon_id": s["id"]}
    )
    assert r.status_code == 404

    # A mesma conexão serve para outra ministração da Ana (sem escanear de novo)
    s2 = await _sermon(client, ana, "Segunda ministração")
    r = await client.put(f"/api/v1/screens/{screen['id']}/sermon", headers=ana, json={"sermon_id": s2["id"]})
    assert r.status_code == 200 and r.json()["status"] == "paired" and r.json()["slide"] is None
    r = await client.put(f"/api/v1/screens/{screen['id']}/slide", headers=ana, json={"text": "Outro texto"})
    assert (await client.get(state_url, headers=display)).json()["slide"]["text"] == "Outro texto"
    # Mas não com a ministração de outra pessoa
    r = await client.put(f"/api/v1/screens/{screen['id']}/sermon", headers=ana, json={"sermon_id": sb["id"]})
    assert r.status_code == 404

    # Conectar sem escolher ministração também funciona
    third = (await client.post("/api/v1/screens")).json()
    r = await client.post("/api/v1/screens/pair", headers=ana, json={"code": third["code"]})
    assert r.status_code == 200 and r.json()["status"] == "paired"

    assert (await client.delete(f"/api/v1/screens/{screen['id']}", headers=ana)).status_code == 204
    assert (await client.get(state_url, headers=display)).json()["status"] == "ended"


async def test_wrong_code(client):
    await register(client)
    ana = bearer(await login(client))
    s = await _sermon(client, ana)
    r = await client.post("/api/v1/screens/pair", headers=ana, json={"code": "ZZZZ99", "sermon_id": s["id"]})
    assert r.status_code == 404


# Daqui a 20 horas, no horário de São Paulo (UTC-3)
SOON = datetime.now(UTC) + timedelta(hours=20) - timedelta(hours=3)


def _event(**kw):
    return {
        "local_date": SOON.date().isoformat(),
        "local_time": SOON.strftime("%H:%M"),
        "timezone": "America/Sao_Paulo",
        "utc_offset_minutes": -180,
        "church_name": "Igreja Batista Central",
        "country": "BR",
        "postal_code": "01001-000",
        "street": "Praça da Sé",
        "number": "100",
        "district": "Sé",
        "city": "São Paulo",
        "region": "SP",
        "notes": "Levar a Bíblia de estudo",
        **kw,
    }


async def test_agenda_crud_and_reminder(client):
    await register(client)
    ana = bearer(await login(client))
    s = await _sermon(client, ana, "O choro de Jesus")
    r = await client.post("/api/v1/agenda", headers=ana, json=_event(sermon_id=s["id"]))
    assert r.status_code == 201, r.text
    ev = r.json()
    assert ev["sermon_title"] == "O choro de Jesus" and "Praça da Sé, 100" in ev["address"]
    # Hora de São Paulo convertida para UTC
    assert ev["starts_at"].startswith((SOON + timedelta(hours=3)).strftime("%Y-%m-%dT%H:%M"))
    assert [e["id"] for e in (await client.get("/api/v1/agenda", headers=ana)).json()["items"]] == [ev["id"]]

    email_service.outbox.clear()
    assert await reminders.send_due() == 1
    mail = email_service.outbox[-1]
    assert mail.to == "ana@example.com" and "Igreja Batista Central" in mail.subject
    assert "O choro de Jesus" in mail.text and "Levar a Bíblia" in mail.text
    assert await reminders.send_due() == 0  # só uma vez

    # Mudou a data: lembra de novo quando chegar a hora
    later = (datetime.now(UTC) + timedelta(days=10)).date().isoformat()
    r = await client.put(f"/api/v1/agenda/{ev['id']}", headers=ana, json=_event(local_date=later))
    assert r.status_code == 200 and r.json()["reminder_sent"] is False and r.json()["sermon_title"] is None
    assert await reminders.send_due() == 0

    # Outra pessoa não vê nem altera
    await register(client, email="bia@example.com", name="Bia")
    bia = bearer(await login(client, email="bia@example.com"))
    assert (await client.get(f"/api/v1/agenda/{ev['id']}", headers=bia)).status_code == 404
    assert (await client.get("/api/v1/agenda", headers=bia)).json()["items"] == []
    r = await client.post("/api/v1/agenda", headers=bia, json=_event(sermon_id=s["id"]))
    assert r.status_code == 404  # não anexa a mensagem de outra pessoa

    assert (await client.delete(f"/api/v1/agenda/{ev['id']}", headers=ana)).status_code == 204
    assert (await client.get("/api/v1/agenda", headers=ana)).json()["items"] == []


async def _paired_screen(client, headers, sermon_id):
    screen = (await client.post("/api/v1/screens")).json()
    r = await client.post(
        "/api/v1/screens/pair", headers=headers, json={"code": screen["code"], "sermon_id": sermon_id}
    )
    assert r.status_code == 200, r.text
    return screen


async def test_background_library(client):
    await register(client, email="admin@example.com", name="Admin")
    await make_admin("admin@example.com")
    ana = bearer(await login(client, email="admin@example.com"))
    s1 = await _sermon(client, ana, "Primeira")
    s2 = await _sermon(client, ana, "Segunda")
    screen = await _paired_screen(client, ana, s1["id"])
    url = f"/api/v1/screens/{screen['id']}/background"

    # Cria um fundo: vai para a biblioteca e já fica em uso na ministração
    r = await client.post(url, headers=ana)
    assert r.status_code == 200, r.text
    first = r.json()["background"]["id"]
    assert r.json()["library_count"] == 1 and r.json()["library_max"] == 10
    lib = (await client.get("/api/v1/screens/library", headers=ana)).json()
    assert [i["id"] for i in lib["items"]] == [first] and lib["items"][0]["label"] == "Primeira"

    # Usar outro fundo da biblioteca em outra ministração não gasta IA nem aumenta a biblioteca
    r = await client.put(f"/api/v1/screens/{screen['id']}/sermon", headers=ana, json={"sermon_id": s2["id"]})
    assert r.json()["background"]["id"] is None  # ministração nova: só as cores padrão
    r = await client.put(url, headers=ana, json={"background_id": first})
    assert r.status_code == 200 and r.json()["background"]["id"] == first
    assert r.json()["library_count"] == 1

    # Fundo de outra pessoa não pode ser usado nem apagado
    await register(client, email="bia@example.com", name="Bia")
    bia = bearer(await login(client, email="bia@example.com"))
    sb = await _sermon(client, bia, "Da Bia")
    bia_screen = await _paired_screen(client, bia, sb["id"])
    r = await client.put(
        f"/api/v1/screens/{bia_screen['id']}/background", headers=bia, json={"background_id": first}
    )
    assert r.status_code == 404
    assert (await client.delete(f"/api/v1/screens/library/{first}", headers=bia)).status_code == 404

    # Biblioteca cheia (10): não cria mais e não gasta IA; apagar um libera espaço
    for _ in range(9):
        r = await client.post(url, headers=ana)
        assert r.status_code == 200, r.text
    assert (await client.get("/api/v1/screens/library", headers=ana)).json()["library_count"] == 10
    r = await client.post(url, headers=ana)
    assert r.status_code == 409 and r.json()["error"]["code"] == "slides_library_full"

    assert (await client.delete(f"/api/v1/screens/library/{first}", headers=ana)).status_code == 204
    lib = (await client.get("/api/v1/screens/library", headers=ana)).json()
    assert lib["library_count"] == 9 and first not in [i["id"] for i in lib["items"]]
    assert (await client.post(url, headers=ana)).status_code == 200


async def test_deleting_a_background_does_not_refund_the_monthly_quota(client):
    await register(client, email="ana@example.com")
    ana = bearer(await login(client, email="ana@example.com"))
    s = await _sermon(client, ana)
    screen = await _paired_screen(client, ana, s["id"])
    url = f"/api/v1/screens/{screen['id']}/background"

    # Gratuito: 2 por mês. Apagar o fundo não devolve a cota (senão geraria sem parar)
    for _ in range(2):
        r = await client.post(url, headers=ana)
        assert r.status_code == 200, r.text
        await client.delete(f"/api/v1/screens/library/{r.json()['background']['id']}", headers=ana)
    r = await client.post(url, headers=ana)
    assert r.status_code == 429 and r.json()["error"]["code"] == "slides_quota"
    lib = (await client.get("/api/v1/screens/library", headers=ana)).json()
    assert lib["items"] == [] and lib["remaining"] == 0 and lib["can_generate"] is False


async def test_deleting_the_sermon_keeps_the_background(client):
    await register(client, email="ana@example.com")
    ana = bearer(await login(client, email="ana@example.com"))
    s = await _sermon(client, ana)
    screen = await _paired_screen(client, ana, s["id"])
    r = await client.post(f"/api/v1/screens/{screen['id']}/background", headers=ana)
    bg = r.json()["background"]["id"]
    assert (await client.delete(f"/api/v1/sermons/{s['id']}", headers=ana)).status_code in (200, 204)
    lib = (await client.get("/api/v1/screens/library", headers=ana)).json()
    assert [i["id"] for i in lib["items"]] == [bg]


async def test_choose_background_from_the_sermon_without_a_screen(client):
    await register(client, email="ana@example.com")
    ana = bearer(await login(client, email="ana@example.com"))
    s1 = await _sermon(client, ana, "Primeira")
    s2 = await _sermon(client, ana, "Segunda")

    # Sem tela conectada: a IA cria o fundo direto da ministração e ele já fica em uso
    r = await client.post(f"/api/v1/screens/sermons/{s1['id']}/background", headers=ana)
    assert r.status_code == 200, r.text
    first = r.json()["background"]["id"]
    lib = (await client.get(f"/api/v1/screens/library?sermon_id={s1['id']}", headers=ana)).json()
    assert lib["current_id"] == first and [i["id"] for i in lib["items"]] == [first]

    # Outra ministração começa sem fundo e escolhe o mesmo da biblioteca (sem gastar a cota)
    assert (await client.get(f"/api/v1/screens/library?sermon_id={s2['id']}", headers=ana)).json()[
        "current_id"
    ] is None
    r = await client.put(
        f"/api/v1/screens/sermons/{s2['id']}/background", headers=ana, json={"background_id": first}
    )
    assert r.status_code == 200 and r.json()["background"]["id"] == first
    lib = (await client.get(f"/api/v1/screens/library?sermon_id={s2['id']}", headers=ana)).json()
    assert lib["current_id"] == first and lib["library_count"] == 1

    # Ministração ou fundo de outra pessoa: não
    await register(client, email="bia@example.com", name="Bia")
    bia = bearer(await login(client, email="bia@example.com"))
    sb = await _sermon(client, bia, "Da Bia")
    assert (
        await client.put(
            f"/api/v1/screens/sermons/{s1['id']}/background", headers=bia, json={"background_id": first}
        )
    ).status_code == 404
    assert (
        await client.put(
            f"/api/v1/screens/sermons/{sb['id']}/background", headers=bia, json={"background_id": first}
        )
    ).status_code == 404
    assert (await client.get(f"/api/v1/screens/library?sermon_id={s1['id']}", headers=bia)).status_code == 404

    # A tela conectada que acompanha a ministração redesenha quando o fundo muda
    screen = await _paired_screen(client, ana, s2["id"])
    display = {"X-Screen-Token": screen["token"]}
    state_url = f"/api/v1/screens/{screen['id']}/state"
    before = (await client.get(state_url, headers=display)).json()["version"]
    await client.post(f"/api/v1/screens/sermons/{s2['id']}/background", headers=ana)
    after = (await client.get(state_url, headers=display)).json()
    assert after["version"] > before and after["background"]["id"] != first


async def test_slide_title_alone_and_with_text(client):
    await register(client, email="ana@example.com")
    ana = bearer(await login(client, email="ana@example.com"))
    s = await _sermon(client, ana)
    screen = await _paired_screen(client, ana, s["id"])
    put = f"/api/v1/screens/{screen['id']}/slide"
    state_url = f"/api/v1/screens/{screen['id']}/state"
    display = {"X-Screen-Token": screen["token"]}

    # Só o título: aparece sozinho
    r = await client.put(put, headers=ana, json={"text": "", "title": "1. Primeiro ponto"})
    assert r.status_code == 200
    slide = (await client.get(state_url, headers=display)).json()["slide"]
    assert slide == {"text": "", "reference": None, "title": "1. Primeiro ponto"}

    # O texto vai junto com o título
    await client.put(put, headers=ana, json={"text": "Jesus chorou.", "title": "1. Primeiro ponto"})
    slide = (await client.get(state_url, headers=display)).json()["slide"]
    assert slide["text"] == "Jesus chorou." and slide["title"] == "1. Primeiro ponto"

    # Sem título nem texto: só o fundo
    await client.put(put, headers=ana, json={"text": "", "title": None})
    assert (await client.get(state_url, headers=display)).json()["slide"] is None
