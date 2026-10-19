"""Proteções em toda requisição: cabeçalhos de segurança, tamanho máximo do corpo e limite global por IP.

Middlewares ASGI puros (sem BaseHTTPMiddleware) para não atrapalhar as respostas em streaming da IA.
"""

import ipaddress
import json
import logging

from app.core import ratelimit
from app.core.errors import AppError

log = logging.getLogger("biblealpha.security")

# Corpo máximo aceito (o maior uso legítimo é o texto-fonte da interface enviado pelo admin)
MAX_BODY_BYTES = 8 * 1024 * 1024
# Limite geral por IP: bem acima do uso normal (leitura da Bíblia, sincronização), barra abuso e robôs
GLOBAL_LIMIT_PER_MINUTE = 600

_HEADERS = [
    (b"x-content-type-options", b"nosniff"),
    (b"x-frame-options", b"DENY"),
    (b"referrer-policy", b"no-referrer"),
    (b"cross-origin-opener-policy", b"same-origin"),
    (b"permissions-policy", b"camera=(), geolocation=(), microphone=()"),
]
_API_CSP = (b"content-security-policy", b"default-src 'none'; frame-ancestors 'none'")
# Respostas com dados da conta ou credenciais nunca ficam em cache de navegador ou proxy
_NO_STORE_PREFIXES = ("/api/v1/auth", "/api/v1/me", "/api/v1/admin")


async def _send_json(send, status: int, code: str, message: str, headers: list | None = None) -> None:
    body = json.dumps({"error": {"code": code, "message": message}}).encode()
    await send(
        {
            "type": "http.response.start",
            "status": status,
            "headers": [
                (b"content-type", b"application/json"),
                (b"content-length", str(len(body)).encode()),
                *_HEADERS,
                *(headers or []),
            ],
        }
    )
    await send({"type": "http.response.body", "body": body})


class SecurityMiddleware:
    def __init__(self, app, docs_enabled: bool = False) -> None:
        self.app = app
        self.docs_enabled = docs_enabled

    async def __call__(self, scope, receive, send):
        if scope["type"] != "http":
            return await self.app(scope, receive, send)
        path: str = scope.get("path", "")

        # 1. Limite global por IP
        client = scope.get("client")
        ip = client[0] if client else None
        try:
            ip = str(ipaddress.ip_address(ip)) if ip else None
        except ValueError:
            ip = None
        if ip and path.startswith("/api/") and not path.endswith("/health"):
            try:
                await ratelimit.hit(f"global:{ip}", limit=GLOBAL_LIMIT_PER_MINUTE, window_seconds=60)
            except AppError as e:
                retry = (e.headers or {}).get("Retry-After", "60")
                return await _send_json(
                    send, 429, "rate_limited", "Too many requests", [(b"retry-after", retry.encode())]
                )

        # 2. Tamanho do corpo (pelo Content-Length e também contando o que chega sem ele)
        headers = dict(scope.get("headers") or [])
        length = headers.get(b"content-length")
        if length is not None:
            try:
                too_big = int(length) > MAX_BODY_BYTES
            except ValueError:
                too_big = True
            if too_big:
                return await _send_json(send, 413, "payload_too_large", "Request body too large")

        received = 0

        async def limited_receive():
            nonlocal received
            message = await receive()
            if message["type"] == "http.request":
                received += len(message.get("body", b""))
                if received > MAX_BODY_BYTES:
                    raise AppError(413, "payload_too_large", "Request body too large")
            return message

        # 3. Cabeçalhos de segurança em todas as respostas
        is_docs = self.docs_enabled and (path.startswith("/api/docs") or path == "/api/openapi.json")
        no_store = path.startswith(_NO_STORE_PREFIXES)

        async def secured_send(message):
            if message["type"] == "http.response.start":
                existing = {k.lower() for k, _ in message.get("headers", [])}
                extra = [h for h in _HEADERS if h[0] not in existing]
                if not is_docs and _API_CSP[0] not in existing:
                    extra.append(_API_CSP)
                if no_store and b"cache-control" not in existing:
                    extra.append((b"cache-control", b"no-store"))
                message = {**message, "headers": [*message.get("headers", []), *extra]}
            await send(message)

        await self.app(scope, limited_receive, secured_send)
