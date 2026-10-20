"""Ministrações: documento em blocos (seções, texto, versículos, notas), com histórico de versões."""

import uuid
from datetime import date, datetime

from sqlalchemy import Date, DateTime, ForeignKey, Index, Integer, SmallInteger, String, Text, func
from sqlalchemy.dialects.postgresql import ARRAY, JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, Timestamps, UUIDPk


class Sermon(UUIDPk, Timestamps, Base):
    __tablename__ = "sermons"

    user_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    title: Mapped[str] = mapped_column(String(200), nullable=False)
    theme: Mapped[str | None] = mapped_column(String(200))
    # Texto principal e auxiliares como referências legíveis ("João 3:16-18")
    main_reference: Mapped[str | None] = mapped_column(String(120))
    other_references: Mapped[list[str]] = mapped_column(ARRAY(String(120)), nullable=False, default=list)
    kind: Mapped[str] = mapped_column(String(20), nullable=False, default="thematic")
    objective: Mapped[str | None] = mapped_column(Text)
    audience: Mapped[str | None] = mapped_column(String(200))
    event: Mapped[str | None] = mapped_column(String(200))
    scheduled_for: Mapped[date | None] = mapped_column(Date)
    duration_minutes: Mapped[int | None] = mapped_column(SmallInteger)
    folder: Mapped[str | None] = mapped_column(String(80))
    tags: Mapped[list[str]] = mapped_column(ARRAY(String(40)), nullable=False, default=list)
    # {"blocks": [...]} — ver app/sermon/schema.py
    content: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)
    # Notas rápidas feitas durante a pregação (modo púlpito)
    pulpit_notes: Mapped[str] = mapped_column(Text, nullable=False, default="")
    # Cresce a cada gravação; o app envia a versão que conhecia para detectar edição em dois aparelhos
    version: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    # Fundo do telão escolhido da biblioteca de fundos (apagar o fundo limpa a escolha)
    slide_background_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey(
            "slide_backgrounds.id", ondelete="SET NULL", use_alter=True, name="fk_sermons_slide_background"
        )
    )

    __table_args__ = (Index("ix_sermons_user_updated", "user_id", "updated_at"),)


class SermonVersion(UUIDPk, Base):
    """Fotografia do documento para o histórico de alterações."""

    __tablename__ = "sermon_versions"

    sermon_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("sermons.id", ondelete="CASCADE"), nullable=False, index=True
    )
    version: Mapped[int] = mapped_column(Integer, nullable=False)
    title: Mapped[str] = mapped_column(String(200), nullable=False)
    content: Mapped[dict] = mapped_column(JSONB, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
