"""Painel do administrador: contas de usuários (lista, bloqueio, senha, tentativas e relatório).

Só administradores. Mostra metadados de uso e segurança; nunca o conteúdo de anotações,
ministrações ou conversas dos usuários."""

import secrets
import uuid
from datetime import UTC, datetime, timedelta
from typing import Literal

from fastapi import APIRouter, BackgroundTasks, Depends, Query
from pydantic import BaseModel, Field
from sqlalchemy import and_, distinct, func, or_, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import CurrentUser, request_meta, require_role
from app.api.routes.auth import _link
from app.core import ratelimit, security
from app.core.errors import AppError
from app.db.session import get_db
from app.models import (
    AIConversation,
    AIUsage,
    Annotation,
    AuditLog,
    AuthSession,
    Bookmark,
    Highlight,
    LegalAcceptance,
    PlanEnrollment,
    Role,
    Sermon,
    User,
    UserRole,
)
from app.services import audit
from app.services import auth as auth_service
from app.services import email as email_service
from app.services.audit import RequestMeta
from app.services.plans import active_subscription

router = APIRouter(prefix="/admin/accounts", tags=["admin"])
admin_only = require_role("admin")

ONLINE_MINUTES = 5
LOGIN_LIMIT = 10  # igual ao limite de /auth/login por e-mail
LOGIN_WINDOW_MINUTES = 15


def _now() -> datetime:
    return datetime.now(UTC)


def _iso(v: datetime | None) -> str | None:
    return v.isoformat() if v else None


def _live_session():
    """Sessão aberta: não revogada e ainda dentro da validade."""
    return and_(AuthSession.revoked_at.is_(None), AuthSession.expires_at > _now())


def _last_seen_subquery():
    return (
        select(AuthSession.user_id.label("uid"), func.max(AuthSession.last_used_at).label("seen"))
        .group_by(AuthSession.user_id)
        .subquery()
    )


async def _locked(email: str) -> bool:
    return await ratelimit.peek(f"login:{email}") >= LOGIN_LIMIT


async def _plan(db: AsyncSession, user_id: uuid.UUID) -> str:
    return "pro" if await active_subscription(db, user_id) else "free"


async def _get_user(db: AsyncSession, user_id: uuid.UUID) -> User:
    user = await db.get(User, user_id)
    if user is None or user.deleted_at is not None:
        raise AppError(404, "user_not_found", "User not found")
    return user


@router.get("/summary")
async def summary(_: CurrentUser = Depends(admin_only), db: AsyncSession = Depends(get_db)) -> dict:
    now = _now()
    base = User.deleted_at.is_(None)

    async def users_seen_since(delta: timedelta) -> int:
        return (
            await db.scalar(
                select(func.count(distinct(AuthSession.user_id))).where(
                    AuthSession.last_used_at >= now - delta, AuthSession.revoked_at.is_(None)
                )
            )
            or 0
        )

    online_sessions = await db.execute(
        select(func.count(distinct(AuthSession.user_id)), func.count()).where(
            AuthSession.last_used_at >= now - timedelta(minutes=ONLINE_MINUTES),
            _live_session(),
        )
    )
    online_users, online_devices = online_sessions.one()
    failed = await db.scalars(
        select(AuditLog.user_id)
        .distinct()
        .where(
            AuditLog.action == "auth.login_failed",
            AuditLog.user_id.is_not(None),
            AuditLog.created_at >= now - timedelta(minutes=LOGIN_WINDOW_MINUTES),
        )
    )
    locked = 0
    for uid in failed:
        user = await db.get(User, uid)
        if user is not None and await _locked(user.email):
            locked += 1
    return {
        "total": await db.scalar(select(func.count()).select_from(User).where(base)) or 0,
        "verified": await db.scalar(
            select(func.count()).select_from(User).where(base, User.email_verified_at.is_not(None))
        )
        or 0,
        "blocked": await db.scalar(
            select(func.count()).select_from(User).where(base, User.blocked_at.is_not(None))
        )
        or 0,
        "locked": locked,
        "online_now": online_users,
        "online_devices": online_devices,
        "active_24h": await users_seen_since(timedelta(hours=24)),
        "active_7d": await users_seen_since(timedelta(days=7)),
        "active_30d": await users_seen_since(timedelta(days=30)),
        "new_7d": await db.scalar(
            select(func.count()).select_from(User).where(base, User.created_at >= now - timedelta(days=7))
        )
        or 0,
        "online_minutes": ONLINE_MINUTES,
    }


Filter = Literal["all", "online", "blocked", "locked", "unverified", "admin", "inactive"]
Sort = Literal["seen", "created", "name"]


@router.get("")
async def list_accounts(
    q: str = Query("", max_length=100),
    filter: Filter = "all",
    sort: Sort = "seen",
    limit: int = Query(30, ge=1, le=100),
    offset: int = Query(0, ge=0),
    _: CurrentUser = Depends(admin_only),
    db: AsyncSession = Depends(get_db),
) -> dict:
    now = _now()
    seen = _last_seen_subquery()
    last_seen = func.greatest(seen.c.seen, User.last_login_at)
    stmt = select(User, last_seen.label("last_seen")).outerjoin(seen, seen.c.uid == User.id)
    stmt = stmt.where(User.deleted_at.is_(None))
    if q:
        like = f"%{q}%"
        stmt = stmt.where(or_(User.email.ilike(like), User.name.ilike(like)))
    if filter == "online":
        stmt = stmt.where(seen.c.seen >= now - timedelta(minutes=ONLINE_MINUTES))
    elif filter == "blocked":
        stmt = stmt.where(User.blocked_at.is_not(None))
    elif filter == "unverified":
        stmt = stmt.where(User.email_verified_at.is_(None))
    elif filter == "inactive":
        stmt = stmt.where(or_(last_seen.is_(None), last_seen < now - timedelta(days=30)))
    elif filter == "admin":
        stmt = stmt.where(
            User.id.in_(
                select(UserRole.user_id).join(Role, Role.id == UserRole.role_id).where(Role.name == "admin")
            )
        )
    elif filter == "locked":
        failed = (
            await db.scalars(
                select(AuditLog.user_id)
                .distinct()
                .where(
                    AuditLog.action == "auth.login_failed",
                    AuditLog.user_id.is_not(None),
                    AuditLog.created_at >= now - timedelta(minutes=LOGIN_WINDOW_MINUTES),
                )
            )
        ).all()
        ids = []
        for uid in failed:
            user = await db.get(User, uid)
            if user is not None and await _locked(user.email):
                ids.append(uid)
        stmt = stmt.where(User.id.in_(ids))
    total = await db.scalar(select(func.count()).select_from(stmt.order_by(None).subquery())) or 0
    order = {
        "seen": last_seen.desc().nulls_last(),
        "created": User.created_at.desc(),
        "name": func.lower(func.coalesce(User.name, User.email)),
    }[sort]
    rows = (await db.execute(stmt.order_by(order).limit(limit).offset(offset))).all()

    users = []
    for u, seen_at in rows:
        live = await db.scalar(
            select(func.count()).select_from(AuthSession).where(AuthSession.user_id == u.id, _live_session())
        )
        users.append(
            {
                "id": str(u.id),
                "name": u.name,
                "email": u.email,
                "country": u.country,
                "plan": await _plan(db, u.id),
                "roles": u.role_names,
                "verified": u.email_verified_at is not None,
                "blocked": u.blocked_at is not None,
                "locked": await _locked(u.email),
                "online": bool(seen_at and seen_at >= now - timedelta(minutes=ONLINE_MINUTES)),
                "sessions": live or 0,
                "created_at": _iso(u.created_at),
                "last_login_at": _iso(u.last_login_at),
                "last_seen_at": _iso(seen_at),
            }
        )
    return {"total": total, "users": users}


async def _counts(db: AsyncSession, user_id: uuid.UUID) -> dict:
    async def n(model, *where) -> int:
        stmt = select(func.count()).select_from(model).where(model.user_id == user_id, *where)
        return await db.scalar(stmt) or 0

    return {
        "sermons": await n(Sermon, Sermon.deleted_at.is_(None)),
        "annotations": await n(Annotation, Annotation.deleted_at.is_(None)),
        "highlights": await n(Highlight, Highlight.deleted_at.is_(None)),
        "bookmarks": await n(Bookmark, Bookmark.deleted_at.is_(None)),
        "ai_conversations": await n(AIConversation),
        "reading_plans": await n(PlanEnrollment),
    }


@router.get("/{user_id}")
async def report(
    user_id: uuid.UUID, _: CurrentUser = Depends(admin_only), db: AsyncSession = Depends(get_db)
) -> dict:
    user = await _get_user(db, user_id)
    now = _now()
    sessions = (
        await db.scalars(
            select(AuthSession)
            .where(AuthSession.user_id == user_id)
            .order_by(AuthSession.last_used_at.desc())
            .limit(30)
        )
    ).all()
    events = (
        await db.scalars(
            select(AuditLog).where(AuditLog.user_id == user_id).order_by(AuditLog.created_at.desc()).limit(60)
        )
    ).all()
    since_15 = now - timedelta(minutes=LOGIN_WINDOW_MINUTES)

    async def count_action(action: str, since: datetime | None = None) -> int:
        stmt = (
            select(func.count())
            .select_from(AuditLog)
            .where(AuditLog.user_id == user_id, AuditLog.action == action)
        )
        if since:
            stmt = stmt.where(AuditLog.created_at >= since)
        return await db.scalar(stmt) or 0

    last_seen = max((s.last_used_at for s in sessions), default=None)
    if user.last_login_at and (last_seen is None or user.last_login_at > last_seen):
        last_seen = user.last_login_at
    sub = await active_subscription(db, user_id)
    ai = (
        await db.execute(
            select(
                func.count(),
                func.coalesce(func.sum(AIUsage.cost_brl), 0),
                func.max(AIUsage.created_at),
            ).where(AIUsage.user_id == user_id)
        )
    ).one()
    month_start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    ai_month = await db.scalar(
        select(func.count())
        .select_from(AIUsage)
        .where(AIUsage.user_id == user_id, AIUsage.created_at >= month_start)
    )
    legal = (await db.scalars(select(LegalAcceptance).where(LegalAcceptance.user_id == user_id))).all()
    attempts = await ratelimit.peek(f"login:{user.email}")
    return {
        "user": {
            "id": str(user.id),
            "name": user.name,
            "email": user.email,
            "country": user.country,
            "locale": user.locale,
            "roles": user.role_names,
            "created_at": _iso(user.created_at),
            "email_verified_at": _iso(user.email_verified_at),
            "last_login_at": _iso(user.last_login_at),
            "last_seen_at": _iso(last_seen),
            "has_password": user.password_hash is not None,
            "blocked_at": _iso(user.blocked_at),
            "blocked_reason": user.blocked_reason,
        },
        "status": {
            "online": bool(last_seen and last_seen >= now - timedelta(minutes=ONLINE_MINUTES)),
            "blocked": user.blocked_at is not None,
            "locked": attempts >= LOGIN_LIMIT,
            "attempts": attempts,
            "attempt_limit": LOGIN_LIMIT,
            "window_minutes": LOGIN_WINDOW_MINUTES,
        },
        "plan": "pro" if sub else "free",
        "subscription": {
            "source": sub.source,
            "status": sub.status,
            "current_period_end": _iso(sub.current_period_end),
            "note": sub.note,
        }
        if sub
        else None,
        "security": {
            "logins": await count_action("auth.login"),
            "failed_logins": await count_action("auth.login_failed"),
            "failed_logins_recent": await count_action("auth.login_failed", since_15),
            "password_resets": await count_action("auth.password_reset"),
            "last_failed_at": _iso(
                await db.scalar(
                    select(func.max(AuditLog.created_at)).where(
                        AuditLog.user_id == user_id, AuditLog.action == "auth.login_failed"
                    )
                )
            ),
            "terms": [
                {"document": a.document, "version": a.version, "at": _iso(a.accepted_at)} for a in legal
            ],
        },
        "usage": {
            **await _counts(db, user_id),
            "ai_requests": ai[0],
            "ai_requests_month": ai_month or 0,
            "ai_cost_brl": float(ai[1] or 0),
            "ai_last_at": _iso(ai[2]),
            "ai_bonus": user.ai_bonus,
        },
        "sessions": [
            {
                "id": str(s.id),
                "client": s.client,
                "device": s.device_name,
                "user_agent": s.user_agent,
                "ip": str(s.ip) if s.ip else None,
                "trusted": s.trusted,
                "created_at": _iso(s.created_at),
                "last_used_at": _iso(s.last_used_at),
                "expires_at": _iso(s.expires_at),
                "open": s.revoked_at is None and s.expires_at > now,
                "revoked_reason": s.revoked_reason,
            }
            for s in sessions
        ],
        "events": [
            {"action": e.action, "ip": str(e.ip) if e.ip else None, "at": _iso(e.created_at)} for e in events
        ],
    }


class BlockIn(BaseModel):
    reason: str | None = Field(None, max_length=300)


async def _log(db: AsyncSession, cu: CurrentUser, action: str, target: uuid.UUID, **data) -> None:
    audit.record(db, action, RequestMeta(None, None), cu.user.id, target=str(target), **data)


@router.post("/{user_id}/block")
async def block(
    user_id: uuid.UUID,
    body: BlockIn,
    cu: CurrentUser = Depends(admin_only),
    db: AsyncSession = Depends(get_db),
) -> dict:
    if user_id == cu.user.id:
        raise AppError(400, "cannot_block_self", "You cannot block your own account")
    user = await _get_user(db, user_id)
    user.blocked_at = _now()
    user.blocked_reason = (body.reason or "").strip() or None
    # Encerra tudo que estiver aberto: o bloqueio vale na hora
    await db.execute(
        update(AuthSession)
        .where(AuthSession.user_id == user_id, AuthSession.revoked_at.is_(None))
        .values(revoked_at=_now(), revoked_reason="blocked")
    )
    await _log(db, cu, "admin.user_blocked", user_id, reason=user.blocked_reason)
    await db.commit()
    return {"blocked": True}


@router.post("/{user_id}/unblock")
async def unblock(
    user_id: uuid.UUID, cu: CurrentUser = Depends(admin_only), db: AsyncSession = Depends(get_db)
) -> dict:
    user = await _get_user(db, user_id)
    user.blocked_at, user.blocked_reason = None, None
    await _log(db, cu, "admin.user_unblocked", user_id)
    await db.commit()
    return {"blocked": False}


@router.post("/{user_id}/unlock")
async def unlock(
    user_id: uuid.UUID, cu: CurrentUser = Depends(admin_only), db: AsyncSession = Depends(get_db)
) -> dict:
    """Libera quem estourou o limite de tentativas de senha (zera a contagem do e-mail e dos IPs)."""
    user = await _get_user(db, user_id)
    await ratelimit.clear(f"login:{user.email}")
    ips = await db.scalars(
        select(AuditLog.ip)
        .distinct()
        .where(
            AuditLog.user_id == user_id,
            AuditLog.action == "auth.login_failed",
            AuditLog.created_at >= _now() - timedelta(minutes=LOGIN_WINDOW_MINUTES),
        )
    )
    for ip in ips:
        if ip:
            await ratelimit.clear(f"login-ip:{ip}")
    await ratelimit.clear(f"forgot:{user.email}")
    await _log(db, cu, "admin.login_unlocked", user_id)
    await db.commit()
    return {"locked": False}


class PasswordIn(BaseModel):
    mode: Literal["email", "temporary"]


@router.post("/{user_id}/password")
async def reset_password(
    user_id: uuid.UUID,
    body: PasswordIn,
    background: BackgroundTasks,
    cu: CurrentUser = Depends(admin_only),
    db: AsyncSession = Depends(get_db),
    meta: RequestMeta = Depends(request_meta),
) -> dict:
    """`email`: manda ao usuário o link para ele criar uma senha nova.
    `temporary`: define uma senha provisória (mostrada uma única vez ao administrador)."""
    user = await _get_user(db, user_id)
    if body.mode == "email":
        result = await auth_service.new_password_reset_token(db, user.email, meta)
        if result is None:
            raise AppError(404, "user_not_found", "User not found")
        _, token = result
        link = _link("/reset-password", token)
        background.add_task(email_service.send_action_email, "reset_password", user.email, user.locale, link)
        await _log(db, cu, "admin.password_reset_email", user_id)
        await db.commit()
        return {"mode": "email", "sent_to": user.email}

    temp = secrets.token_urlsafe(9) + "!7"
    user.password_hash = security.hash_password(temp)
    await db.execute(
        update(AuthSession)
        .where(AuthSession.user_id == user_id, AuthSession.revoked_at.is_(None))
        .values(revoked_at=_now(), revoked_reason="password_reset")
    )
    await ratelimit.clear(f"login:{user.email}")
    await _log(db, cu, "admin.password_temporary", user_id)
    await db.commit()
    return {"mode": "temporary", "password": temp}


@router.post("/{user_id}/sessions/revoke")
async def revoke_all_sessions(
    user_id: uuid.UUID, cu: CurrentUser = Depends(admin_only), db: AsyncSession = Depends(get_db)
) -> dict:
    await _get_user(db, user_id)
    result = await db.execute(
        update(AuthSession)
        .where(AuthSession.user_id == user_id, AuthSession.revoked_at.is_(None))
        .values(revoked_at=_now(), revoked_reason="revoked_by_admin")
    )
    await _log(db, cu, "admin.sessions_revoked", user_id, count=result.rowcount or 0)
    await db.commit()
    return {"revoked": result.rowcount or 0}


@router.post("/{user_id}/sessions/{session_id}/revoke")
async def revoke_session(
    user_id: uuid.UUID,
    session_id: uuid.UUID,
    cu: CurrentUser = Depends(admin_only),
    db: AsyncSession = Depends(get_db),
) -> dict:
    session = await db.get(AuthSession, session_id)
    if session is None or session.user_id != user_id:
        raise AppError(404, "session_not_found", "Session not found")
    if session.revoked_at is None:
        session.revoked_at, session.revoked_reason = _now(), "revoked_by_admin"
        await _log(db, cu, "admin.session_revoked", user_id, session_id=str(session_id))
        await db.commit()
    return {"revoked": 1}
