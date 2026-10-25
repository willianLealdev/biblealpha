"""Testes de segurança: acesso às rotas, cabeçalhos, limites e privacidade do cadastro."""

import re

from app.core import http_security
from app.main import create_app
from app.services import email as email_service
from tests.conftest import PASSWORD, bearer, login, register

# Rotas que respondem sem login (conteúdo público, cadastro/entrada e webhook assinado do Stripe)
PUBLIC = {
    "/api/v1/health",
    "/api/v1/auth/register",
    "/api/v1/auth/verify-email",
    "/api/v1/auth/resend-verification",
    "/api/v1/auth/login",
    "/api/v1/auth/refresh",
    "/api/v1/auth/forgot-password",
    "/api/v1/auth/reset-password",
    "/api/v1/billing/webhook",
    "/api/v1/billing/plans",
}
# BibleAlpha Kids: só leitura do conteúdo publicado, sem login (as rotas de admin ficam em /admin/kids)
PUBLIC_PREFIXES = (
    "/api/v1/bible",
    "/api/v1/languages",
    "/api/v1/visual/images",
    "/api/v1/legal",
    "/api/v1/kids/",
    # Conteúdo aberto, só leitura: Harpa Cristã, fundos prontos da imagem do versículo e capas do Aprender
    "/api/v1/hymns",
    "/api/v1/share/presets",
    "/api/v1/learn/covers",
)
# Telão: abre sem login; a tela lê o estado com o token dela, não com login
PUBLIC_SCREEN = (
    "/api/v1/screens",
    "/api/v1/screens/{screen_id}/state",
    "/api/v1/screens/backgrounds/{background_id}",
)


def _routes():
    # Todas as rotas publicadas pela API (lidas do esquema OpenAPI, que lista cada uma)
    for path, ops in create_app().openapi()["paths"].items():
        if path.startswith("/api/v1"):
            for method in ops:
                yield method.upper(), path


def _fill(path: str) -> str:
    # Parâmetros de caminho com valores plausíveis (o acesso tem de ser negado antes de qualquer busca)
    def value(m: re.Match) -> str:
        name = m.group(1)
        if name.endswith("id") or name in ("sermon_id", "conversation_id", "message_id"):
            return "00000000-0000-0000-0000-000000000001"
        if name in ("chapter", "day", "verse", "key", "year"):
            return "1"
        if name == "book":
            return "JHN"
        return "pt-BR" if name in ("code", "locale") else "x"

    return re.sub(r"\{(\w+)(?::\w+)?\}", value, path)


def _is_public(path: str) -> bool:
    return path in PUBLIC or path in PUBLIC_SCREEN or path.startswith(PUBLIC_PREFIXES)


async def test_every_private_route_requires_login(client):
    checked, wrong = 0, []
    for method, path in _routes():
        if _is_public(path):
            continue
        r = await client.request(method, _fill(path), json={})
        if r.status_code != 401:
            wrong.append(f"{method} {path} -> {r.status_code}")
        checked += 1
    assert not wrong, wrong
    assert checked > 50


async def test_every_admin_route_rejects_common_users(client):
    await register(client)
    headers = bearer(await login(client))
    checked, wrong = 0, []
    for method, path in _routes():
        if "/admin" not in path:
            continue
        r = await client.request(method, _fill(path), json={}, headers=headers)
        if r.status_code != 403:
            wrong.append(f"{method} {path} -> {r.status_code}")
        checked += 1
    assert not wrong, wrong
    assert checked > 20


async def test_forged_and_wrong_tokens_are_rejected(client):
    await register(client)
    tokens = await login(client)
    access = tokens["access_token"]
    head, payload, _sig = access.split(".")
    for bad in (
        f"{head}.{payload}.assinatura-falsa",
        # alg "none" com o mesmo conteúdo
        "eyJhbGciOiJub25lIiwidHlwIjoiSldUIn0." + payload + ".",
        tokens["refresh_token"],
    ):
        r = await client.get("/api/v1/me", headers={"Authorization": f"Bearer {bad}"})
        assert r.status_code == 401


async def test_users_cannot_read_each_others_data(client):
    await register(client, email="ana@example.com")
    await register(client, email="bia@example.com", name="Bia")
    ana = bearer(await login(client, email="ana@example.com"))
    bia = bearer(await login(client, email="bia@example.com"))
    s = (await client.post("/api/v1/sermons", headers=ana, json={"title": "Só da Ana"})).json()
    for method, path in (
        ("GET", f"/api/v1/sermons/{s['id']}"),
        ("DELETE", f"/api/v1/sermons/{s['id']}"),
        ("GET", f"/api/v1/sermons/{s['id']}/export.pdf"),
        ("GET", f"/api/v1/sermons/{s['id']}/versions"),
    ):
        r = await client.request(method, path, headers=bia)
        assert r.status_code == 404, f"{method} {path} -> {r.status_code}"
    assert (await client.get(f"/api/v1/sermons/{s['id']}", headers=ana)).status_code == 200


async def test_security_headers(client):
    r = await client.get("/api/v1/health")
    assert r.headers["x-content-type-options"] == "nosniff"
    assert r.headers["x-frame-options"] == "DENY"
    assert "default-src 'none'" in r.headers["content-security-policy"]
    await register(client)
    r = await client.post("/api/v1/auth/login", json={"email": "ana@example.com", "password": PASSWORD})
    assert r.headers["cache-control"] == "no-store"


async def test_large_body_is_refused(client):
    big = "x" * (http_security.MAX_BODY_BYTES + 10)
    r = await client.post("/api/v1/auth/login", content=big, headers={"Content-Type": "application/json"})
    assert r.status_code == 413


async def test_global_rate_limit(client, monkeypatch):
    monkeypatch.setattr(http_security, "GLOBAL_LIMIT_PER_MINUTE", 5)
    codes = [(await client.get("/api/v1/bible/translations")).status_code for _ in range(7)]
    assert codes[:5] == [200] * 5 and codes[-1] == 429


async def test_login_is_rate_limited(client):
    await register(client)
    codes = [
        (
            await client.post(
                "/api/v1/auth/login", json={"email": "ana@example.com", "password": "errada123"}
            )
        ).status_code
        for _ in range(11)
    ]
    assert codes[:10] == [401] * 10 and codes[-1] == 429


async def test_spoofed_forwarded_for_does_not_bypass_limits(client):
    # Atrás do proxy, o IP vem do proxy (nginx), não de um cabeçalho escolhido pelo cliente direto na API
    codes = []
    for i in range(7):
        r = await client.post(
            "/api/v1/auth/register",
            headers={"X-Forwarded-For": f"198.51.100.{i}"},
            json={"name": "X", "email": f"x{i}@example.com", "password": PASSWORD, "accept_terms": True},
        )
        codes.append(r.status_code)
    assert codes[-1] == 429


async def test_register_does_not_reveal_existing_accounts(client):
    await register(client)
    email_service.outbox.clear()
    r = await client.post(
        "/api/v1/auth/register",
        json={"name": "Outra", "email": "ANA@example.com", "password": PASSWORD, "accept_terms": True},
    )
    assert r.status_code == 201 and r.json() == {"status": "verification_sent"}
    # O dono do e-mail recebe um aviso (com o caminho para redefinir a senha), não um novo cadastro
    assert email_service.outbox[-1].action_url.endswith("/forgot-password")
    # A senha da conta existente continua a mesma
    await login(client)


async def test_forgot_password_same_answer_for_unknown_email(client):
    await register(client)
    a = await client.post("/api/v1/auth/forgot-password", json={"email": "ana@example.com"})
    b = await client.post("/api/v1/auth/forgot-password", json={"email": "ninguem@example.com"})
    assert a.status_code == b.status_code == 202 and a.json() == b.json()


async def test_unverified_account_cannot_sign_in(client):
    await register(client, verify=False)
    r = await client.post("/api/v1/auth/login", json={"email": "ana@example.com", "password": PASSWORD})
    assert r.status_code == 403 and r.json()["error"]["code"] == "email_not_verified"


async def test_password_reset_signs_out_everywhere(client):
    await register(client)
    old = bearer(await login(client))
    await client.post("/api/v1/auth/forgot-password", json={"email": "ana@example.com"})
    from tests.conftest import last_token

    token = last_token("/reset-password")
    r = await client.post("/api/v1/auth/reset-password", json={"token": token, "password": "Nova&Senha456"})
    assert r.status_code == 200
    assert (await client.get("/api/v1/me", headers=old)).status_code == 401
    # O link só vale uma vez
    r = await client.post("/api/v1/auth/reset-password", json={"token": token, "password": "Outra&Senha789"})
    assert r.status_code == 400
    await login(client, password="Nova&Senha456")


def test_production_uses_official_domain(monkeypatch):
    from app.core.config import Settings

    for k in ("BA_APP_URL", "BA_CORS_ORIGINS"):
        monkeypatch.delenv(k, raising=False)
    s = Settings(env="production", jwt_secret="x" * 40, email_backend="resend", ai_provider="anthropic")
    assert s.app_url == "https://biblealpha.com"
    assert "https://biblealpha.com" in s.cors_origins
