from datetime import UTC, datetime, timedelta

from app.agenda import reminders
from app.services import email as email_service
from tests.conftest import bearer, login, register


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
