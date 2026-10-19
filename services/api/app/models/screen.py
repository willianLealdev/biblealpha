"""Telão da igreja (tela pareada pelo QR code), fundos dos slides criados pela IA e agenda do pregador."""

import uuid
from datetime import date, datetime, time

from sqlalchemy import (
    Date,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    LargeBinary,
    SmallInteger,
    String,
    Text,
    Time,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, Timestamps, UUIDPk


class ScreenSession(UUIDPk, Timestamps, Base):
    """Uma tela aberta no computador/telão. O pregador conecta pelo QR code e envia o texto a mostrar."""

    __tablename__ = "screen_sessions"

    # Código curto mostrado na tela e dentro do QR code
    code: Mapped[str] = mapped_column(String(8), nullable=False, unique=True)
    # Só o hash: a tela usa o token para ler o que mostrar
    token_hash: Mapped[str] = mapped_column(String(64), nullable=False)
    user_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    sermon_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("sermons.id", ondelete="SET NULL"))
    # {"text": ..., "reference": ...} ou null (só o fundo)
    slide: Mapped[dict | None] = mapped_column(JSONB)
    # Cresce a cada mudança (a tela só redesenha quando muda)
    version: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    paired_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    ended_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)


class SlideBackground(UUIDPk, Timestamps, Base):
    """Fundo e estilo dos slides de uma ministração, criados pela IA (imagem opcional)."""

    __tablename__ = "slide_backgrounds"

    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    sermon_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("sermons.id", ondelete="CASCADE"), nullable=False)
    # {"text_color", "accent_color", "overlay", "font", "gradient": [c1, c2]}
    style: Mapped[dict] = mapped_column(JSONB, nullable=False)
    prompt: Mapped[str] = mapped_column(Text, nullable=False, default="")
    mime: Mapped[str | None] = mapped_column(String(40))
    data: Mapped[bytes | None] = mapped_column(LargeBinary)
    model: Mapped[str | None] = mapped_column(String(60))

    __table_args__ = (Index("ix_slide_backgrounds_sermon", "sermon_id", "created_at"),)


class PreachingEvent(UUIDPk, Timestamps, Base):
    """Compromisso na agenda do pregador (igreja, endereço, mensagem anexada e observações)."""

    __tablename__ = "preaching_events"

    user_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    # Data e hora como o pregador digitou (no fuso do lugar) e o instante exato em UTC
    local_date: Mapped[date] = mapped_column(Date, nullable=False)
    local_time: Mapped[time] = mapped_column(Time, nullable=False)
    timezone: Mapped[str | None] = mapped_column(String(64))
    utc_offset_minutes: Mapped[int] = mapped_column(SmallInteger, nullable=False, default=0)
    starts_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    church_name: Mapped[str] = mapped_column(String(160), nullable=False)
    country: Mapped[str | None] = mapped_column(String(2))
    postal_code: Mapped[str | None] = mapped_column(String(20))
    street: Mapped[str | None] = mapped_column(String(200))
    number: Mapped[str | None] = mapped_column(String(20))
    complement: Mapped[str | None] = mapped_column(String(120))
    district: Mapped[str | None] = mapped_column(String(120))
    city: Mapped[str | None] = mapped_column(String(120))
    region: Mapped[str | None] = mapped_column(String(120))
    sermon_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("sermons.id", ondelete="SET NULL"))
    notes: Mapped[str] = mapped_column(Text, nullable=False, default="")
    reminder_sent_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    __table_args__ = (Index("ix_preaching_events_reminder", "reminder_sent_at", "starts_at"),)
