import enum
import uuid
from datetime import datetime

from sqlalchemy import (
    Boolean,
    DateTime,
    Enum,
    ForeignKey,
    Index,
    Integer,
    Numeric,
    String,
    Text,
    UniqueConstraint,
    func,
    text,
)
from sqlalchemy.dialects.postgresql import INET, JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base, Timestamps, UUIDPk


class Theme(enum.StrEnum):
    dark = "dark"
    light = "light"
    system = "system"


class ReadingMode(enum.StrEnum):
    simple = "simple"
    advanced = "advanced"


class EmailTokenPurpose(enum.StrEnum):
    verify_email = "verify_email"
    reset_password = "reset_password"  # noqa: S105


class User(UUIDPk, Timestamps, Base):
    __tablename__ = "users"

    # Guardado em minúsculas; único entre contas não excluídas
    email: Mapped[str] = mapped_column(String(320), nullable=False)
    password_hash: Mapped[str | None] = mapped_column(Text)
    name: Mapped[str | None] = mapped_column(String(120))
    locale: Mapped[str] = mapped_column(String(10), nullable=False, default="pt-BR")
    # País escolhido no cadastro (ISO 3166-1 alfa-2, ex.: BR)
    country: Mapped[str | None] = mapped_column(String(2))
    email_verified_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    last_login_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    # Perguntas extras à IA ganhas com ofertas avulsas (usadas depois da cota gratuita)
    ai_bonus: Mapped[int] = mapped_column(Integer, nullable=False, default=0, server_default="0")
    # Cliente no Stripe (criado na primeira assinatura)
    stripe_customer_id: Mapped[str | None] = mapped_column(String(80), unique=True, index=True)
    # Exclusão de conta: dados pessoais são anonimizados e a linha permanece para integridade/auditoria
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    preferences: Mapped["UserPreferences"] = relationship(
        back_populates="user", uselist=False, cascade="all, delete-orphan", lazy="selectin"
    )
    roles: Mapped[list["Role"]] = relationship(secondary="user_roles", lazy="selectin")

    __table_args__ = (
        Index("uq_users_email_active", "email", unique=True, postgresql_where=text("deleted_at IS NULL")),
    )

    @property
    def role_names(self) -> list[str]:
        return sorted(r.name for r in self.roles)


class UserPreferences(Timestamps, Base):
    __tablename__ = "user_preferences"

    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), primary_key=True)
    theme: Mapped[Theme] = mapped_column(Enum(Theme, name="theme"), nullable=False, default=Theme.dark)
    font_scale: Mapped[float] = mapped_column(Numeric(3, 2), nullable=False, default=1.0)
    line_height: Mapped[float] = mapped_column(Numeric(3, 2), nullable=False, default=1.6)
    reading_mode: Mapped[ReadingMode] = mapped_column(
        Enum(ReadingMode, name="reading_mode"), nullable=False, default=ReadingMode.simple
    )
    onboarding_completed: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)

    user: Mapped[User] = relationship(back_populates="preferences")


class Role(UUIDPk, Base):
    __tablename__ = "roles"

    name: Mapped[str] = mapped_column(String(50), unique=True, nullable=False)
    description: Mapped[str | None] = mapped_column(Text)


class UserRole(Base):
    __tablename__ = "user_roles"

    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), primary_key=True)
    role_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("roles.id", ondelete="CASCADE"), primary_key=True)
    granted_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class AuthSession(UUIDPk, Base):
    """Uma sessão por dispositivo. O refresh token é rotacionado a cada uso;
    reapresentar o token anterior indica roubo e revoga a sessão."""

    __tablename__ = "auth_sessions"

    user_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    refresh_token_hash: Mapped[str] = mapped_column(String(64), nullable=False, unique=True)
    previous_token_hash: Mapped[str | None] = mapped_column(String(64), index=True)
    client: Mapped[str] = mapped_column(String(20), nullable=False)  # web | native
    user_agent: Mapped[str | None] = mapped_column(String(400))
    # Aparelho que a pessoa marcou como confiável no login (só apps): não pede senha de novo até sair
    trusted: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False, server_default="false")
    device_name: Mapped[str | None] = mapped_column(String(80))
    ip: Mapped[str | None] = mapped_column(INET)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    last_used_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    revoked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    revoked_reason: Mapped[str | None] = mapped_column(String(40))


class EmailToken(UUIDPk, Base):
    __tablename__ = "email_tokens"

    user_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    purpose: Mapped[EmailTokenPurpose] = mapped_column(
        Enum(EmailTokenPurpose, name="email_token_purpose"), nullable=False
    )
    token_hash: Mapped[str] = mapped_column(String(64), nullable=False, unique=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    used_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class LegalAcceptance(UUIDPk, Base):
    __tablename__ = "legal_acceptances"

    user_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    document: Mapped[str] = mapped_column(String(20), nullable=False)  # terms | privacy
    version: Mapped[str] = mapped_column(String(20), nullable=False)
    accepted_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    ip: Mapped[str | None] = mapped_column(INET)

    __table_args__ = (UniqueConstraint("user_id", "document", "version"),)


class AuditLog(UUIDPk, Base):
    """Eventos de segurança. Nunca guarda senhas, tokens ou conteúdo do usuário."""

    __tablename__ = "audit_logs"

    user_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), index=True)
    action: Mapped[str] = mapped_column(String(60), nullable=False, index=True)
    ip: Mapped[str | None] = mapped_column(INET)
    user_agent: Mapped[str | None] = mapped_column(String(400))
    data: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), index=True
    )
