from datetime import UTC, datetime, timedelta

from sqlalchemy import select, update

from app.db.session import get_sessionmaker
from app.models import AuditLog, EmailToken, LegalAcceptance, User
from app.services import email as email_service
from tests.conftest import PASSWORD, bearer, last_token, login, register


async def test_health(client):
    r = await client.get("/api/v1/health")
    assert r.status_code == 200
    assert r.json()["status"] == "ok"


async def test_register_requires_terms(client):
    r = await client.post(
        "/api/v1/auth/register",
        json={"name": "Ana", "email": "ana@example.com", "password": PASSWORD, "accept_terms": False},
    )
    assert r.status_code == 422
    assert r.json()["error"]["code"] == "terms_not_accepted"


async def test_weak_password_rejected(client):
    r = await client.post(
        "/api/v1/auth/register",
        json={"name": "Ana", "email": "ana@example.com", "password": "12345678", "accept_terms": True},
    )
    assert r.status_code == 422
    assert r.json()["error"]["code"] == "validation_error"


async def test_full_signup_flow_and_terms_recorded(client):
    await register(client, email="Ana@Example.com", verify=False)

    # Antes de confirmar o e-mail, o login é recusado
    r = await client.post("/api/v1/auth/login", json={"email": "ana@example.com", "password": PASSWORD})
    assert r.status_code == 403
    assert r.json()["error"]["code"] == "email_not_verified"

    message = email_service.outbox[-1]
    assert message.to == "ana@example.com"
    assert message.action_url.startswith("https://app.test/verify-email?token=")

    r = await client.post("/api/v1/auth/verify-email", json={"token": last_token("/verify-email")})
    assert r.status_code == 200

    tokens = await login(client)
    me = (await client.get("/api/v1/me", headers=bearer(tokens))).json()
    assert me["email"] == "ana@example.com"
    assert me["email_verified"] is True
    assert me["preferences"]["theme"] == "dark"

    async with get_sessionmaker()() as db:
        docs = {(a.document, a.version) for a in await db.scalars(select(LegalAcceptance))}
    assert {d for d, _ in docs} == {"terms", "privacy"}


async def test_verification_link_is_single_use(client):
    await register(client, verify=False)
    token = last_token("/verify-email")
    assert (await client.post("/api/v1/auth/verify-email", json={"token": token})).status_code == 200
    r = await client.post("/api/v1/auth/verify-email", json={"token": token})
    assert r.status_code == 400
    assert r.json()["error"]["code"] == "invalid_or_expired_token"


async def test_resend_verification_invalidates_previous_link(client):
    await register(client, verify=False)
    first = last_token("/verify-email")
    r = await client.post("/api/v1/auth/resend-verification", json={"email": "ana@example.com"})
    assert r.status_code == 202
    second = last_token("/verify-email")
    assert first != second
    assert (await client.post("/api/v1/auth/verify-email", json={"token": first})).status_code == 400
    assert (await client.post("/api/v1/auth/verify-email", json={"token": second})).status_code == 200


async def test_duplicate_email(client):
    await register(client)
    r = await client.post(
        "/api/v1/auth/register",
        json={"name": "Outra", "email": "ANA@example.com", "password": PASSWORD, "accept_terms": True},
    )
    # Mesma resposta de um cadastro novo: não revela que o e-mail já tem conta
    assert r.status_code == 201


async def test_password_stored_with_argon2id(client):
    await register(client)
    async with get_sessionmaker()() as db:
        user = await db.scalar(select(User))
    assert user.password_hash.startswith("$argon2id$")
    assert PASSWORD not in user.password_hash


async def test_wrong_password_and_unknown_email_look_the_same(client):
    await register(client)
    a = await client.post("/api/v1/auth/login", json={"email": "ana@example.com", "password": "Errada123"})
    b = await client.post("/api/v1/auth/login", json={"email": "nobody@example.com", "password": "Errada123"})
    assert a.status_code == b.status_code == 401
    assert a.json() == b.json()


async def test_login_rate_limited(client):
    await register(client)
    codes = [
        (
            await client.post("/api/v1/auth/login", json={"email": "ana@example.com", "password": "x1"})
        ).status_code
        for _ in range(11)
    ]
    assert codes[:10] == [401] * 10
    assert codes[10] == 429


async def test_forgot_password_does_not_reveal_accounts(client):
    r = await client.post("/api/v1/auth/forgot-password", json={"email": "nobody@example.com"})
    assert r.status_code == 202
    assert email_service.outbox == []


async def test_password_reset_flow(client):
    await register(client)
    old_session = await login(client)

    r = await client.post("/api/v1/auth/forgot-password", json={"email": "ana@example.com"})
    assert r.status_code == 202
    token = last_token("/reset-password")

    new_password = "NovaSenha#2026"
    r = await client.post("/api/v1/auth/reset-password", json={"token": token, "password": new_password})
    assert r.status_code == 200

    # Token de uso único
    r = await client.post("/api/v1/auth/reset-password", json={"token": token, "password": "Outra#2026x"})
    assert r.status_code == 400

    # Todas as sessões anteriores foram encerradas
    assert (await client.get("/api/v1/me", headers=bearer(old_session))).status_code == 401

    r = await client.post("/api/v1/auth/login", json={"email": "ana@example.com", "password": PASSWORD})
    assert r.status_code == 401
    await login(client, password=new_password)


async def test_password_reset_token_expires(client):
    await register(client)
    await client.post("/api/v1/auth/forgot-password", json={"email": "ana@example.com"})
    token = last_token("/reset-password")
    async with get_sessionmaker()() as db:
        await db.execute(update(EmailToken).values(expires_at=datetime.now(UTC) - timedelta(seconds=1)))
        await db.commit()
    r = await client.post("/api/v1/auth/reset-password", json={"token": token, "password": "NovaSenha#2026"})
    assert r.status_code == 400
    assert r.json()["error"]["code"] == "invalid_or_expired_token"


async def test_refresh_rotation_and_reuse_detection(client):
    await register(client)
    tokens = await login(client)
    first_refresh = tokens["refresh_token"]

    r = await client.post("/api/v1/auth/refresh", json={"refresh_token": first_refresh})
    assert r.status_code == 200
    rotated = r.json()
    assert rotated["refresh_token"] != first_refresh

    # Reapresentar o token antigo indica roubo: a sessão inteira é revogada
    r = await client.post("/api/v1/auth/refresh", json={"refresh_token": first_refresh})
    assert r.status_code == 401
    r = await client.post("/api/v1/auth/refresh", json={"refresh_token": rotated["refresh_token"]})
    assert r.status_code == 401
    assert (await client.get("/api/v1/me", headers=bearer(rotated))).status_code == 401

    async with get_sessionmaker()() as db:
        actions = [a.action for a in await db.scalars(select(AuditLog))]
    assert "auth.refresh_reuse_detected" in actions


async def test_web_client_uses_httponly_cookie(client):
    await register(client)
    r = await client.post(
        "/api/v1/auth/login", json={"email": "ana@example.com", "password": PASSWORD, "client": "web"}
    )
    assert r.status_code == 200
    assert "refresh_token" not in r.json()
    set_cookie = r.headers["set-cookie"].lower()
    assert "ba_refresh=" in set_cookie and "httponly" in set_cookie and "samesite=strict" in set_cookie
    assert "path=/api/v1/auth" in set_cookie

    # Sem o cabeçalho do app web, o cookie sozinho não basta (proteção CSRF)
    assert (await client.post("/api/v1/auth/refresh")).status_code == 401
    # O 401 acima limpou o cookie; faz login de novo e renova com o cabeçalho
    await client.post(
        "/api/v1/auth/login", json={"email": "ana@example.com", "password": PASSWORD, "client": "web"}
    )
    r = await client.post("/api/v1/auth/refresh", headers={"x-ba-client": "web"})
    assert r.status_code == 200
    assert r.json()["access_token"]


async def test_sessions_list_revoke_and_logout(client):
    await register(client)
    phone = await login(client)
    laptop = await login(client)

    sessions = (await client.get("/api/v1/me/sessions", headers=bearer(laptop))).json()
    assert len(sessions) == 2
    assert sum(s["current"] for s in sessions) == 1

    r = await client.post("/api/v1/me/sessions/revoke-others", headers=bearer(laptop))
    assert r.json() == {"revoked": 1}
    assert (await client.get("/api/v1/me", headers=bearer(phone))).status_code == 401
    assert (
        await client.post("/api/v1/auth/refresh", json={"refresh_token": phone["refresh_token"]})
    ).status_code == 401

    assert (await client.post("/api/v1/auth/logout", headers=bearer(laptop))).status_code == 204
    assert (await client.get("/api/v1/me", headers=bearer(laptop))).status_code == 401


async def test_users_cannot_touch_each_other(client):
    await register(client, email="ana@example.com")
    await register(client, email="bruno@example.com", name="Bruno")
    ana = await login(client, email="ana@example.com")
    bruno = await login(client, email="bruno@example.com")

    ana_session = (await client.get("/api/v1/me/sessions", headers=bearer(ana))).json()[0]["id"]

    # Bruno não vê nem revoga a sessão da Ana
    bruno_sessions = (await client.get("/api/v1/me/sessions", headers=bearer(bruno))).json()
    assert ana_session not in [s["id"] for s in bruno_sessions]
    r = await client.delete(f"/api/v1/me/sessions/{ana_session}", headers=bearer(bruno))
    assert r.status_code == 404
    assert (await client.get("/api/v1/me", headers=bearer(ana))).status_code == 200

    # Cada um só recebe os próprios dados
    assert (await client.get("/api/v1/me", headers=bearer(bruno))).json()["email"] == "bruno@example.com"
    export = (await client.get("/api/v1/me/export", headers=bearer(bruno))).json()
    assert export["account"]["email"] == "bruno@example.com"
    assert "ana@example.com" not in str(export)


async def test_tampered_token_rejected(client):
    await register(client)
    tokens = await login(client)
    forged = tokens["access_token"][:-4] + "abcd"
    assert (await client.get("/api/v1/me", headers={"Authorization": f"Bearer {forged}"})).status_code == 401
    assert (await client.get("/api/v1/me")).status_code == 401


async def _session_rows():
    from app.models import AuthSession

    async with get_sessionmaker()() as db:
        return list(await db.scalars(select(AuthSession).order_by(AuthSession.created_at)))


async def test_web_session_ends_when_the_browser_closes(client):
    await register(client)
    # No site o "confiar neste dispositivo" não existe: o pedido é ignorado
    r = await client.post(
        "/api/v1/auth/login",
        json={"email": "ana@example.com", "password": PASSWORD, "client": "web", "trust_device": True},
    )
    assert r.status_code == 200
    # Cookie de sessão: sem Max-Age nem Expires, então some quando o navegador fecha
    set_cookie = r.headers["set-cookie"].lower()
    assert "max-age" not in set_cookie and "expires" not in set_cookie
    (row,) = await _session_rows()
    assert row.client == "web" and row.trusted is False
    # No servidor a sessão do site vale 24 h de uso (renovada a cada refresh)
    left = row.expires_at - datetime.now(UTC)
    assert timedelta(hours=23) < left <= timedelta(hours=24)


async def test_trusted_device_stays_signed_in_until_logout(client):
    await register(client)
    r = await client.post(
        "/api/v1/auth/login",
        json={
            "email": "ana@example.com",
            "password": PASSWORD,
            "client": "native",
            "trust_device": True,
            "device_name": "Samsung SM-S918B",
        },
    )
    assert r.status_code == 200
    tokens = r.json()
    (row,) = await _session_rows()
    assert row.trusted is True and row.device_name == "Samsung SM-S918B"
    assert row.expires_at - datetime.now(UTC) > timedelta(days=360)

    # Aparece na lista de aparelhos
    sessions = (await client.get("/api/v1/me/sessions", headers=bearer(tokens))).json()
    assert sessions[0]["trusted"] is True and sessions[0]["device_name"] == "Samsung SM-S918B"

    # Cada uso renova a validade: um aparelho em uso nunca expira
    async with get_sessionmaker()() as db:
        await db.execute(update(type(row)).values(expires_at=datetime.now(UTC) + timedelta(days=2)))
        await db.commit()
    r = await client.post("/api/v1/auth/refresh", json={"refresh_token": tokens["refresh_token"]})
    assert r.status_code == 200
    (row,) = await _session_rows()
    assert row.expires_at - datetime.now(UTC) > timedelta(days=360)

    # Só sai quando a própria pessoa toca em Sair
    new_tokens = r.json()
    assert (await client.post("/api/v1/auth/logout", headers=bearer(new_tokens))).status_code == 204
    r = await client.post("/api/v1/auth/refresh", json={"refresh_token": new_tokens["refresh_token"]})
    assert r.status_code == 401


async def test_native_without_trust_keeps_the_normal_expiry(client):
    await register(client)
    await login(client)
    (row,) = await _session_rows()
    assert row.trusted is False
    left = row.expires_at - datetime.now(UTC)
    assert timedelta(days=59) < left <= timedelta(days=60)
