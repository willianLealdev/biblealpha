from sqlalchemy import select

from app.db.session import get_sessionmaker
from app.models import Role, User, UserRole
from tests.conftest import PASSWORD, bearer, login, register


async def test_update_profile_and_preferences(client):
    await register(client)
    tokens = await login(client)

    r = await client.patch("/api/v1/me", headers=bearer(tokens), json={"name": "Ana Paula", "locale": "en"})
    assert r.status_code == 200
    assert r.json()["name"] == "Ana Paula" and r.json()["locale"] == "en"

    r = await client.patch(
        "/api/v1/me/preferences", headers=bearer(tokens), json={"theme": "light", "font_scale": 1.25}
    )
    assert r.status_code == 200
    assert r.json()["theme"] == "light" and r.json()["font_scale"] == 1.25

    r = await client.patch("/api/v1/me/preferences", headers=bearer(tokens), json={"font_scale": 9})
    assert r.status_code == 422


async def test_change_password_keeps_current_session_only(client):
    await register(client)
    other = await login(client)
    current = await login(client)

    r = await client.post(
        "/api/v1/me/password",
        headers=bearer(current),
        json={"current_password": "Errada#123", "new_password": "NovaSenha#2026"},
    )
    assert r.status_code == 400

    r = await client.post(
        "/api/v1/me/password",
        headers=bearer(current),
        json={"current_password": PASSWORD, "new_password": "NovaSenha#2026"},
    )
    assert r.status_code == 204
    assert (await client.get("/api/v1/me", headers=bearer(current))).status_code == 200
    assert (await client.get("/api/v1/me", headers=bearer(other))).status_code == 401


async def test_export_contains_account_without_secrets(client):
    await register(client)
    tokens = await login(client)
    r = await client.get("/api/v1/me/export", headers=bearer(tokens))
    assert r.status_code == 200
    assert "attachment" in r.headers["content-disposition"]
    data = r.json()
    assert data["account"]["email"] == "ana@example.com"
    assert {a["document"] for a in data["legal_acceptances"]} == {"terms", "privacy"}
    assert any(e["action"] == "auth.login" for e in data["security_events"])
    dumped = str(data)
    assert "argon2" not in dumped and "refresh_token_hash" not in dumped


async def test_delete_account(client):
    await register(client)
    tokens = await login(client)

    r = await client.request("DELETE", "/api/v1/me", headers=bearer(tokens), json={"password": "Errada#123"})
    assert r.status_code == 400

    r = await client.request("DELETE", "/api/v1/me", headers=bearer(tokens), json={"password": PASSWORD})
    assert r.status_code == 204
    assert (await client.get("/api/v1/me", headers=bearer(tokens))).status_code == 401
    r = await client.post("/api/v1/auth/login", json={"email": "ana@example.com", "password": PASSWORD})
    assert r.status_code == 401

    async with get_sessionmaker()() as db:
        user = await db.scalar(select(User))
    assert user.deleted_at is not None
    assert user.name is None and user.password_hash is None
    assert "ana@example.com" not in user.email

    # O mesmo e-mail pode criar uma conta nova
    await register(client)


async def test_admin_route_requires_role(client):
    await register(client)
    tokens = await login(client)
    r = await client.get("/api/v1/admin/overview", headers=bearer(tokens))
    assert r.status_code == 403

    async with get_sessionmaker()() as db:
        user = await db.scalar(select(User))
        role = await db.scalar(select(Role).where(Role.name == "admin"))
        db.add(UserRole(user_id=user.id, role_id=role.id))
        await db.commit()

    r = await client.get("/api/v1/admin/overview", headers=bearer(tokens))
    assert r.status_code == 200
    assert r.json()["users"] == {"total": 1, "verified": 1}
