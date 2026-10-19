import uuid
from datetime import date, datetime

from sqlalchemy import (
    Boolean,
    Date,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    SmallInteger,
    String,
    Text,
    UniqueConstraint,
    func,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, Timestamps, UUIDPk


class DailyDevotional(UUIDPk, Base):
    """Devocional do dia: gerado uma vez por data e idioma e servido a todos os usuários."""

    __tablename__ = "daily_devotionals"

    day: Mapped[date] = mapped_column(Date, nullable=False)
    locale: Mapped[str] = mapped_column(String(10), nullable=False)
    theme: Mapped[str] = mapped_column(String(30), nullable=False)
    translation_code: Mapped[str] = mapped_column(String(20), nullable=False)
    verse_key_start: Mapped[int] = mapped_column(Integer, nullable=False)
    verse_key_end: Mapped[int] = mapped_column(Integer, nullable=False)
    content: Mapped[dict] = mapped_column(JSONB, nullable=False)
    model: Mapped[str] = mapped_column(String(80), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    __table_args__ = (UniqueConstraint("day", "locale"),)


class UserDevotional(UUIDPk, Timestamps, Base):
    """Devocional do usuário: o do dia (concluído/favorito/anotado), um personalizado pela IA ou
    um escrito por ele."""

    __tablename__ = "user_devotionals"

    user_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    kind: Mapped[str] = mapped_column(String(10), nullable=False)  # daily | ai | own
    daily_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("daily_devotionals.id", ondelete="SET NULL")
    )
    theme: Mapped[str | None] = mapped_column(String(30))
    translation_code: Mapped[str | None] = mapped_column(String(20))
    verse_key_start: Mapped[int | None] = mapped_column(Integer)
    verse_key_end: Mapped[int | None] = mapped_column(Integer)
    content: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)
    note: Mapped[str] = mapped_column(Text, nullable=False, default="")
    favorite: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    completed_on: Mapped[date | None] = mapped_column(Date)

    __table_args__ = (
        Index("ix_user_devotionals_completed", "user_id", "completed_on"),
        Index("uq_user_devotionals_daily", "user_id", "daily_id", unique=True),
    )


class PlanEnrollment(UUIDPk, Timestamps, Base):
    __tablename__ = "plan_enrollments"

    user_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    plan_code: Mapped[str] = mapped_column(String(40), nullable=False)
    start_date: Mapped[date] = mapped_column(Date, nullable=False)
    status: Mapped[str] = mapped_column(
        String(12), nullable=False, default="active"
    )  # active | paused | done
    paused_on: Mapped[date | None] = mapped_column(Date)


class PlanDayDone(Base):
    __tablename__ = "plan_days_done"

    enrollment_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("plan_enrollments.id", ondelete="CASCADE"), primary_key=True
    )
    day: Mapped[int] = mapped_column(SmallInteger, primary_key=True)
    done_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class NotificationPreference(Base):
    __tablename__ = "notification_preferences"

    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), primary_key=True)
    # Horário local "HH:MM" do lembrete do devocional (vazio = desligado)
    devotional_time: Mapped[str | None] = mapped_column(String(5))
    plan_reminders: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    timezone: Mapped[str] = mapped_column(String(60), nullable=False, default="America/Sao_Paulo")
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )
