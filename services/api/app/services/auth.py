"""Regras de autenticação e conta. As rotas só traduzem HTTP para estas funções."""

import uuid
from datetime import UTC, datetime, timedelta

from sqlalchemy import delete, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.core import security
from app.core.config import get_settings
from app.core.errors import AppError
from app.models import (
    AIConversation,
    AIMessage,
    Annotation,
    AuditLog,
    AuthSession,
    Bookmark,
    EmailToken,
    EmailTokenPurpose,
    Highlight,
    HighlightCategory,
    LegalAcceptance,
    NotificationPreference,
    PlanEnrollment,
    PreachingEvent,
    ReadingHistory,
    ReadingProgress,
    ScreenSession,
    Sermon,
    SlideBackground,
    User,
    UserDevotional,
    UserPreferences,
)
from app.services import audit
from app.services.audit import RequestMeta
from app.services.sync import MODELS, serialize


def _now() -> datetime:
    return datetime.now(UTC)


async def get_active_user_by_email(db: AsyncSession, email: str) -> User | None:
    return await db.scalar(select(User).where(User.email == email, User.deleted_at.is_(None)))


# ---------- Cadastro e confirmação de e-mail ----------


async def register(
    db: AsyncSession,
    *,
    name: str,
    email: str,
    password: str,
    locale: str,
    country: str | None = None,
    accept_terms: bool,
    meta: RequestMeta,
) -> tuple[User, str]:
    """Cria a conta (ainda não confirmada) e devolve o token de confirmação a ser enviado por e-mail."""
    if not accept_terms:
        raise AppError(422, "terms_not_accepted", "Terms and privacy policy must be accepted")
    existing = await get_active_user_by_email(db, email)
    if existing:
        # Mesmo tempo de resposta de um cadastro novo, e quem é o dono do e-mail recebe o aviso
        security.hash_password(password)
        if existing.email_verified_at is None:
            token = await _issue_email_token(db, existing, EmailTokenPurpose.verify_email)
            await db.commit()
            return existing, token
        raise EmailTaken(existing)

    settings = get_settings()
    user = User(
        name=name, email=email, password_hash=security.hash_password(password), locale=locale, country=country
    )
    user.preferences = UserPreferences()
    db.add(user)
    await db.flush()
    db.add_all(
        [
            LegalAcceptance(user_id=user.id, document="terms", version=settings.terms_version, ip=meta.ip),
            LegalAcceptance(
                user_id=user.id, document="privacy", version=settings.privacy_version, ip=meta.ip
            ),
        ]
    )
    token = await _issue_email_token(db, user, EmailTokenPurpose.verify_email)
    audit.record(db, "user.registered", meta, user.id)
    await db.commit()
    return user, token


class EmailTaken(Exception):
    """Cadastro com e-mail de uma conta já confirmada: o dono recebe um aviso, a resposta é a mesma."""

    def __init__(self, user: User):
        self.user = user


async def _issue_email_token(db: AsyncSession, user: User, purpose: EmailTokenPurpose) -> str:
    settings = get_settings()
    # Um token novo invalida os anteriores do mesmo tipo
    await db.execute(
        update(EmailToken)
        .where(EmailToken.user_id == user.id, EmailToken.purpose == purpose, EmailToken.used_at.is_(None))
        .values(used_at=_now())
    )
    ttl = (
        timedelta(hours=settings.email_token_ttl_hours)
        if purpose == EmailTokenPurpose.verify_email
        else timedelta(minutes=settings.password_reset_ttl_minutes)
    )
    raw = security.new_opaque_token()
    db.add(
        EmailToken(
            user_id=user.id, purpose=purpose, token_hash=security.hash_token(raw), expires_at=_now() + ttl
        )
    )
    return raw


async def _consume_email_token(db: AsyncSession, raw: str, purpose: EmailTokenPurpose) -> User:
    token = await db.scalar(
        select(EmailToken)
        .where(EmailToken.token_hash == security.hash_token(raw), EmailToken.purpose == purpose)
        .with_for_update()
    )
    if token is None or token.used_at is not None or token.expires_at <= _now():
        raise AppError(400, "invalid_or_expired_token", "This link is invalid or has expired")
    user = await db.get(User, token.user_id)
    if user is None or user.deleted_at is not None:
        raise AppError(400, "invalid_or_expired_token", "This link is invalid or has expired")
    token.used_at = _now()
    return user


async def verify_email(db: AsyncSession, raw_token: str, meta: RequestMeta) -> User:
    user = await _consume_email_token(db, raw_token, EmailTokenPurpose.verify_email)
    if user.email_verified_at is None:
        user.email_verified_at = _now()
        audit.record(db, "user.email_verified", meta, user.id)
    await db.commit()
    return user


async def new_verification_token(db: AsyncSession, email: str) -> tuple[User, str] | None:
    """Sem resposta diferente para e-mail inexistente ou já confirmado (evita enumeração de contas)."""
    user = await get_active_user_by_email(db, email)
    if user is None or user.email_verified_at is not None:
        return None
    token = await _issue_email_token(db, user, EmailTokenPurpose.verify_email)
    await db.commit()
    return user, token


# ---------- Login, refresh e sessões ----------


async def login(
    db: AsyncSession,
    *,
    email: str,
    password: str,
    client: str,
    meta: RequestMeta,
    trust_device: bool = False,
    device_name: str | None = None,
) -> tuple[User, AuthSession, str]:
    user = await get_active_user_by_email(db, email)
    # verify_password roda mesmo sem usuário, para o tempo de resposta não revelar se o e-mail existe
    if not security.verify_password(user.password_hash if user else None, password) or user is None:
        audit.record(db, "auth.login_failed", meta, user.id if user else None)
        await db.commit()
        raise AppError(401, "invalid_credentials", "Invalid email or password")
    if user.email_verified_at is None:
        raise AppError(403, "email_not_verified", "Confirm your email before signing in")

    if security.password_needs_rehash(user.password_hash):
        user.password_hash = security.hash_password(password)
    user.last_login_at = _now()
    session, refresh = _new_session(user, client, meta, trust_device=trust_device, device_name=device_name)
    db.add(session)
    audit.record(db, "auth.login", meta, user.id, client=client, trusted=session.trusted)
    await db.commit()
    return user, session, refresh


def session_lifetime(client: str, trusted: bool) -> timedelta:
    """Quanto a sessão vale a partir de agora (renovado a cada uso do refresh token)."""
    settings = get_settings()
    if client == "web":
        return timedelta(hours=settings.web_session_hours)
    if trusted:
        return timedelta(days=settings.trusted_device_days)
    return timedelta(days=settings.refresh_token_ttl_days)


def _new_session(
    user: User, client: str, meta: RequestMeta, *, trust_device: bool = False, device_name: str | None = None
) -> tuple[AuthSession, str]:
    raw = security.new_opaque_token()
    # Só os apps podem confiar no aparelho; o site sempre pede login de novo ao fechar o navegador
    trusted = trust_device and client != "web"
    session = AuthSession(
        id=uuid.uuid4(),
        user_id=user.id,
        refresh_token_hash=security.hash_token(raw),
        client=client,
        user_agent=(meta.user_agent or "")[:400] or None,
        trusted=trusted,
        device_name=(device_name or "")[:80] or None,
        ip=meta.ip,
        expires_at=_now() + session_lifetime(client, trusted),
    )
    return session, raw


async def refresh(db: AsyncSession, raw_token: str, meta: RequestMeta) -> tuple[User, AuthSession, str]:
    """Troca o refresh token por um novo (rotação). Reuso de um token antigo revoga a sessão."""
    token_hash = security.hash_token(raw_token)
    session = await db.scalar(
        select(AuthSession).where(AuthSession.refresh_token_hash == token_hash).with_for_update()
    )
    if session is None:
        reused = await db.scalar(
            select(AuthSession).where(AuthSession.previous_token_hash == token_hash).with_for_update()
        )
        if reused is not None and reused.revoked_at is None:
            reused.revoked_at, reused.revoked_reason = _now(), "refresh_reuse"
            audit.record(db, "auth.refresh_reuse_detected", meta, reused.user_id, session_id=str(reused.id))
            await db.commit()
        raise AppError(401, "invalid_refresh_token", "Session expired, sign in again")

    if session.revoked_at is not None or session.expires_at <= _now():
        raise AppError(401, "invalid_refresh_token", "Session expired, sign in again")
    user = await db.get(User, session.user_id)
    if user is None or user.deleted_at is not None:
        raise AppError(401, "invalid_refresh_token", "Session expired, sign in again")

    new_raw = security.new_opaque_token()
    session.previous_token_hash = session.refresh_token_hash
    session.refresh_token_hash = security.hash_token(new_raw)
    session.last_used_at = _now()
    session.ip = meta.ip or session.ip
    # Site e aparelho confiável: a validade anda junto com o uso (sem uso por muito tempo, expira)
    if session.client == "web" or session.trusted:
        session.expires_at = _now() + session_lifetime(session.client, session.trusted)
    await db.commit()
    return user, session, new_raw


async def get_valid_session(
    db: AsyncSession, session_id: uuid.UUID, user_id: uuid.UUID
) -> AuthSession | None:
    session = await db.get(AuthSession, session_id)
    if (
        session is None
        or session.user_id != user_id
        or session.revoked_at is not None
        or session.expires_at <= _now()
    ):
        return None
    return session


async def logout(db: AsyncSession, session: AuthSession, meta: RequestMeta) -> None:
    session.revoked_at, session.revoked_reason = _now(), "logout"
    audit.record(db, "auth.logout", meta, session.user_id)
    await db.commit()


async def list_sessions(db: AsyncSession, user: User) -> list[AuthSession]:
    rows = await db.scalars(
        select(AuthSession)
        .where(
            AuthSession.user_id == user.id, AuthSession.revoked_at.is_(None), AuthSession.expires_at > _now()
        )
        .order_by(AuthSession.last_used_at.desc())
    )
    return list(rows)


async def revoke_session(db: AsyncSession, user: User, session_id: uuid.UUID, meta: RequestMeta) -> None:
    session = await db.get(AuthSession, session_id)
    # Sessão de outro usuário responde igual a inexistente
    if session is None or session.user_id != user.id or session.revoked_at is not None:
        raise AppError(404, "session_not_found", "Session not found")
    session.revoked_at, session.revoked_reason = _now(), "revoked_by_user"
    audit.record(db, "auth.session_revoked", meta, user.id, session_id=str(session_id))
    await db.commit()


async def _revoke_all(
    db: AsyncSession, user_id: uuid.UUID, reason: str, keep: uuid.UUID | None = None
) -> int:
    stmt = (
        update(AuthSession)
        .where(AuthSession.user_id == user_id, AuthSession.revoked_at.is_(None))
        .values(revoked_at=_now(), revoked_reason=reason)
    )
    if keep is not None:
        stmt = stmt.where(AuthSession.id != keep)
    result = await db.execute(stmt)
    return result.rowcount or 0


async def revoke_other_sessions(db: AsyncSession, user: User, current: AuthSession, meta: RequestMeta) -> int:
    count = await _revoke_all(db, user.id, "revoked_by_user", keep=current.id)
    audit.record(db, "auth.other_sessions_revoked", meta, user.id, count=count)
    await db.commit()
    return count


# ---------- Senha ----------


async def new_password_reset_token(
    db: AsyncSession, email: str, meta: RequestMeta
) -> tuple[User, str] | None:
    user = await get_active_user_by_email(db, email)
    if user is None:
        return None
    token = await _issue_email_token(db, user, EmailTokenPurpose.reset_password)
    audit.record(db, "auth.password_reset_requested", meta, user.id)
    await db.commit()
    return user, token


async def reset_password(db: AsyncSession, raw_token: str, password: str, meta: RequestMeta) -> None:
    user = await _consume_email_token(db, raw_token, EmailTokenPurpose.reset_password)
    user.password_hash = security.hash_password(password)
    # Quem recebeu o link provou ter acesso ao e-mail
    if user.email_verified_at is None:
        user.email_verified_at = _now()
    await _revoke_all(db, user.id, "password_reset")
    audit.record(db, "auth.password_reset", meta, user.id)
    await db.commit()


async def change_password(
    db: AsyncSession, user: User, current: AuthSession, old: str, new: str, meta: RequestMeta
) -> None:
    if not security.verify_password(user.password_hash, old):
        raise AppError(400, "wrong_password", "Current password is incorrect")
    user.password_hash = security.hash_password(new)
    await _revoke_all(db, user.id, "password_changed", keep=current.id)
    audit.record(db, "auth.password_changed", meta, user.id)
    await db.commit()


# ---------- Exportação e exclusão (LGPD) ----------


async def export_data(db: AsyncSession, user: User) -> dict:
    acceptances = await db.scalars(select(LegalAcceptance).where(LegalAcceptance.user_id == user.id))
    sessions = await db.scalars(select(AuthSession).where(AuthSession.user_id == user.id))
    events = await db.scalars(
        select(AuditLog).where(AuditLog.user_id == user.id).order_by(AuditLog.created_at)
    )
    p = user.preferences
    study = {}
    for entity, (model, _) in MODELS.items():
        rows = await db.scalars(select(model).where(model.user_id == user.id, model.deleted_at.is_(None)))
        study[entity] = [serialize(entity, r) for r in rows]
    history = await db.scalars(select(ReadingHistory).where(ReadingHistory.user_id == user.id))
    conversations = []
    for c in await db.scalars(select(AIConversation).where(AIConversation.user_id == user.id)):
        msgs = await db.scalars(
            select(AIMessage).where(AIMessage.conversation_id == c.id).order_by(AIMessage.created_at)
        )
        conversations.append(
            {
                "title": c.title,
                "saved": c.saved,
                "created_at": c.created_at.isoformat(),
                "messages": [{"role": m.role, "content": m.content} for m in msgs],
            }
        )
    return {
        "study": study,
        "ai_conversations": conversations,
        "devotionals": [
            {
                "kind": d.kind,
                "content": d.content,
                "note": d.note,
                "favorite": d.favorite,
                "completed_on": d.completed_on.isoformat() if d.completed_on else None,
            }
            for d in await db.scalars(select(UserDevotional).where(UserDevotional.user_id == user.id))
        ],
        "sermons": [
            {
                "title": s.title,
                "main_reference": s.main_reference,
                "content": s.content,
                "updated_at": s.updated_at.isoformat(),
            }
            for s in await db.scalars(select(Sermon).where(Sermon.user_id == user.id))
        ],
        "agenda": [
            {
                "date": e.local_date.isoformat(),
                "time": e.local_time.strftime("%H:%M"),
                "church": e.church_name,
                "country": e.country,
                "postal_code": e.postal_code,
                "street": e.street,
                "number": e.number,
                "complement": e.complement,
                "district": e.district,
                "city": e.city,
                "region": e.region,
                "notes": e.notes,
            }
            for e in await db.scalars(select(PreachingEvent).where(PreachingEvent.user_id == user.id))
        ],
        "reading_plans": [
            {"plan": e.plan_code, "start_date": e.start_date.isoformat(), "status": e.status}
            for e in await db.scalars(select(PlanEnrollment).where(PlanEnrollment.user_id == user.id))
        ],
        "reading_history": [
            {"book_id": h.book_id, "chapter": h.chapter, "read_on": h.read_on.isoformat()} for h in history
        ],
        "exported_at": _now().isoformat(),
        "format_version": 1,
        "account": {
            "id": str(user.id),
            "email": user.email,
            "name": user.name,
            "locale": user.locale,
            "created_at": user.created_at.isoformat(),
            "email_verified_at": user.email_verified_at.isoformat() if user.email_verified_at else None,
            "last_login_at": user.last_login_at.isoformat() if user.last_login_at else None,
            "roles": user.role_names,
        },
        "preferences": {
            "theme": p.theme.value,
            "font_scale": float(p.font_scale),
            "line_height": float(p.line_height),
            "reading_mode": p.reading_mode.value,
            "onboarding_completed": p.onboarding_completed,
        },
        "legal_acceptances": [
            {"document": a.document, "version": a.version, "accepted_at": a.accepted_at.isoformat()}
            for a in acceptances
        ],
        "sessions": [
            {
                "client": s.client,
                "user_agent": s.user_agent,
                "ip": str(s.ip) if s.ip else None,
                "created_at": s.created_at.isoformat(),
                "last_used_at": s.last_used_at.isoformat(),
                "revoked_at": s.revoked_at.isoformat() if s.revoked_at else None,
            }
            for s in sessions
        ],
        "security_events": [
            {"action": e.action, "created_at": e.created_at.isoformat(), "ip": str(e.ip) if e.ip else None}
            for e in events
        ],
    }


async def delete_account(db: AsyncSession, user: User, password: str, meta: RequestMeta) -> None:
    """Anonimiza a conta imediatamente: remove nome, e-mail e senha e encerra todas as sessões.
    A linha fica para manter a integridade dos registros de auditoria, sem dados pessoais."""
    if not security.verify_password(user.password_hash, password):
        raise AppError(400, "wrong_password", "Password is incorrect")
    await _revoke_all(db, user.id, "account_deleted")
    await db.execute(update(EmailToken).where(EmailToken.user_id == user.id).values(used_at=_now()))
    # Conteúdo pessoal de estudo é apagado de vez
    for model in (
        Highlight,
        HighlightCategory,
        Bookmark,
        Annotation,
        ReadingProgress,
        ReadingHistory,
        AIConversation,
        UserDevotional,
        PlanEnrollment,
        NotificationPreference,
        PreachingEvent,
        ScreenSession,
        SlideBackground,
        Sermon,
    ):
        await db.execute(delete(model).where(model.user_id == user.id))
    user.ai_bonus = 0
    user.country = None
    user.email = f"deleted+{user.id}@invalid.biblealpha"
    user.name = None
    user.password_hash = None
    user.deleted_at = _now()
    audit.record(db, "user.deleted", meta, user.id)
    await db.commit()
