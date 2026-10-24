from tests.conftest import PASSWORD, bearer, last_token, login, make_admin, register

BASE = "/api/v1/admin/accounts"


async def _setup(client):
    await register(client, "adm@example.com", "Adm")
    await make_admin("adm@example.com")
    await register(client, "bia@example.com", "Bia")
    admin = await login(client, "adm@example.com")
    bia = await login(client, "bia@example.com")
    r = await client.get(BASE, params={"q": "bia"}, headers=bearer(admin))
    return admin, bia, r.json()["users"][0]["id"]


async def test_only_admin(client):
    await register(client, "bia@example.com", "Bia")
    bia = await login(client, "bia@example.com")
    assert (await client.get(BASE, headers=bearer(bia))).status_code == 403
    assert (await client.get(f"{BASE}/summary", headers=bearer(bia))).status_code == 403


async def test_list_summary_and_report(client):
    admin, bia, bia_id = await _setup(client)
    h = bearer(admin)
    # atividade real da Bia marca a sessão dela
    assert (await client.get("/api/v1/me", headers=bearer(bia))).status_code == 200

    summary = (await client.get(f"{BASE}/summary", headers=h)).json()
    assert summary["total"] == 2 and summary["online_now"] == 2 and summary["blocked"] == 0

    users = (await client.get(BASE, headers=h)).json()
    assert users["total"] == 2
    row = next(u for u in users["users"] if u["id"] == bia_id)
    assert row["online"] and row["verified"] and not row["blocked"] and row["last_seen_at"]

    only_admin = (await client.get(BASE, params={"filter": "admin"}, headers=h)).json()
    assert [u["email"] for u in only_admin["users"]] == ["adm@example.com"]

    report = (await client.get(f"{BASE}/{bia_id}", headers=h)).json()
    assert report["user"]["email"] == "bia@example.com"
    assert report["status"]["online"] and not report["status"]["blocked"]
    assert report["security"]["logins"] == 1
    assert report["sessions"][0]["open"] and report["sessions"][0]["client"] == "native"
    assert any(e["action"] == "auth.login" for e in report["events"])
    assert report["usage"]["sermons"] == 0


async def test_block_and_unblock(client):
    admin, bia, bia_id = await _setup(client)
    h = bearer(admin)
    r = await client.post(f"{BASE}/{bia_id}/block", json={"reason": "spam"}, headers=h)
    assert r.status_code == 200
    # a sessão que estava aberta cai na hora
    assert (await client.get("/api/v1/me", headers=bearer(bia))).status_code == 401
    r = await client.post(
        "/api/v1/auth/login", json={"email": "bia@example.com", "password": PASSWORD, "client": "native"}
    )
    assert r.status_code == 403 and r.json()["error"]["code"] == "account_blocked"
    r = await client.post("/api/v1/auth/refresh", json={"refresh_token": bia["refresh_token"]})
    assert r.status_code == 401

    blocked = (await client.get(BASE, params={"filter": "blocked"}, headers=h)).json()
    assert [u["id"] for u in blocked["users"]] == [bia_id]
    report = (await client.get(f"{BASE}/{bia_id}", headers=h)).json()
    assert report["user"]["blocked_reason"] == "spam"

    assert (await client.post(f"{BASE}/{bia_id}/unblock", headers=h)).status_code == 200
    await login(client, "bia@example.com")


async def test_cannot_block_self(client):
    admin, _, _ = await _setup(client)
    me = (await client.get("/api/v1/me", headers=bearer(admin))).json()
    r = await client.post(f"{BASE}/{me['id']}/block", json={}, headers=bearer(admin))
    assert r.status_code == 400


async def test_unlock_after_wrong_passwords(client):
    admin, _, bia_id = await _setup(client)
    h = bearer(admin)
    bad = {"email": "bia@example.com", "password": "errada-errada", "client": "native"}
    # o login da Bia no preparo já conta uma tentativa na janela
    for _ in range(9):
        assert (await client.post("/api/v1/auth/login", json=bad)).status_code == 401
    good = {"email": "bia@example.com", "password": PASSWORD, "client": "native"}
    assert (await client.post("/api/v1/auth/login", json=good)).status_code == 429

    report = (await client.get(f"{BASE}/{bia_id}", headers=h)).json()
    assert report["status"]["locked"] and report["security"]["failed_logins"] == 9
    locked = (await client.get(BASE, params={"filter": "locked"}, headers=h)).json()
    assert [u["id"] for u in locked["users"]] == [bia_id]

    assert (await client.post(f"{BASE}/{bia_id}/unlock", headers=h)).status_code == 200
    assert (await client.post("/api/v1/auth/login", json=good)).status_code == 200
    report = (await client.get(f"{BASE}/{bia_id}", headers=h)).json()
    assert not report["status"]["locked"]


async def test_temporary_password(client):
    admin, bia, bia_id = await _setup(client)
    r = await client.post(f"{BASE}/{bia_id}/password", json={"mode": "temporary"}, headers=bearer(admin))
    assert r.status_code == 200
    temp = r.json()["password"]
    assert (await client.get("/api/v1/me", headers=bearer(bia))).status_code == 401
    old = {"email": "bia@example.com", "password": PASSWORD, "client": "native"}
    assert (await client.post("/api/v1/auth/login", json=old)).status_code == 401
    await login(client, "bia@example.com", password=temp)


async def test_password_email_and_sessions(client):
    admin, bia, bia_id = await _setup(client)
    h = bearer(admin)
    r = await client.post(f"{BASE}/{bia_id}/password", json={"mode": "email"}, headers=h)
    assert r.status_code == 200 and r.json()["sent_to"] == "bia@example.com"
    assert last_token("/reset-password")

    report = (await client.get(f"{BASE}/{bia_id}", headers=h)).json()
    sid = report["sessions"][0]["id"]
    assert (await client.post(f"{BASE}/{bia_id}/sessions/{sid}/revoke", headers=h)).status_code == 200
    assert (await client.get("/api/v1/me", headers=bearer(bia))).status_code == 401
    await login(client, "bia@example.com")
    r = await client.post(f"{BASE}/{bia_id}/sessions/revoke", headers=h)
    assert r.json()["revoked"] == 1
