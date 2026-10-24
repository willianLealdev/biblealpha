import ipaddress
import uuid
from collections.abc import Callable
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta

import jwt
from fastapi import Depends, Request
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy import update
from sqlalchemy.ext.asyncio import AsyncSession

from app.core import security
from app.core.errors import AppError
from app.db.session import get_db, get_sessionmaker
from app.models import AuthSession, User
from app.services import auth as auth_service
from app.services.audit import RequestMeta

_bearer = HTTPBearer(auto_error=False)


def request_meta(request: Request) -> RequestMeta:
    # Atrás do proxy do Easypanel o IP real vem em X-Forwarded-For (uvicorn --proxy-headers)
    ip = request.client.host if request.client else None
    try:
        ip = str(ipaddress.ip_address(ip)) if ip else None
    except ValueError:
        ip = None
    return RequestMeta(ip=ip, user_agent=request.headers.get("user-agent"))


@dataclass
class CurrentUser:
    user: User
    session: AuthSession


async def current_user(
    creds: HTTPAuthorizationCredentials | None = Depends(_bearer),
    db: AsyncSession = Depends(get_db),
) -> CurrentUser:
    unauthorized = AppError(401, "unauthorized", "Authentication required", {"WWW-Authenticate": "Bearer"})
    if creds is None:
        raise unauthorized
    try:
        payload = security.decode_access_token(creds.credentials)
        user_id, session_id = uuid.UUID(payload["sub"]), uuid.UUID(payload["sid"])
    except (jwt.PyJWTError, ValueError, KeyError):
        raise unauthorized from None
    # Consulta a sessão a cada requisição: uma sessão revogada deixa de funcionar na hora
    session = await auth_service.get_valid_session(db, session_id, user_id)
    if session is None:
        raise unauthorized
    user = await db.get(User, user_id)
    if user is None or user.deleted_at is not None or user.blocked_at is not None:
        raise unauthorized
    await _touch(session)
    return CurrentUser(user=user, session=session)


_TOUCH_EVERY = timedelta(seconds=60)


async def _touch(session: AuthSession) -> None:
    """Marca a última atividade da sessão (no máximo 1 gravação por minuto)."""
    now = datetime.now(UTC)
    if now - session.last_used_at < _TOUCH_EVERY:
        return
    async with get_sessionmaker()() as db:
        await db.execute(update(AuthSession).where(AuthSession.id == session.id).values(last_used_at=now))
        await db.commit()
    session.last_used_at = now


def require_role(*roles: str) -> Callable:
    async def checker(cu: CurrentUser = Depends(current_user)) -> CurrentUser:
        if not set(roles) & set(cu.user.role_names):
            raise AppError(403, "forbidden", "Insufficient permissions")
        return cu

    return checker
