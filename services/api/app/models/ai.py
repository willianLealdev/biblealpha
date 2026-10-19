"""IA: uso e custo de cada chamada (para o painel do administrador), conversas e configurações.

O administrador vê custos e metadados; nunca o conteúdo das perguntas e respostas dos usuários.
"""

import uuid
from datetime import date, datetime
from decimal import Decimal

from sqlalchemy import (
    Boolean,
    Date,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    Numeric,
    SmallInteger,
    String,
    Text,
    func,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, Timestamps, UUIDPk


class SystemSetting(Base):
    """Configurações editáveis pelo administrador (cotas, orçamento, modelos, câmbio)."""

    __tablename__ = "system_settings"

    key: Mapped[str] = mapped_column(String(80), primary_key=True)
    value: Mapped[dict] = mapped_column(JSONB, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )
    updated_by: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))


class AIModelPrice(UUIDPk, Base):
    """Preço por milhão de tokens (US$). Um preço novo entra com outra data e não reescreve o histórico."""

    __tablename__ = "ai_model_prices"

    model: Mapped[str] = mapped_column(String(80), nullable=False)
    input_per_mtok: Mapped[Decimal] = mapped_column(Numeric(10, 4), nullable=False)
    output_per_mtok: Mapped[Decimal] = mapped_column(Numeric(10, 4), nullable=False)
    cache_read_per_mtok: Mapped[Decimal] = mapped_column(Numeric(10, 4), nullable=False)
    cache_write_per_mtok: Mapped[Decimal] = mapped_column(Numeric(10, 4), nullable=False)
    valid_from: Mapped[date] = mapped_column(Date, nullable=False)

    __table_args__ = (Index("ix_ai_model_prices_model_from", "model", "valid_from"),)


class AIUsage(UUIDPk, Base):
    """Uma chamada a um modelo de IA. Base do painel de custos (total e por usuário)."""

    __tablename__ = "ai_usage"

    user_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), index=True)
    plan: Mapped[str] = mapped_column(String(20), nullable=False)
    feature: Mapped[str] = mapped_column(String(40), nullable=False)
    provider: Mapped[str] = mapped_column(String(20), nullable=False)
    model: Mapped[str] = mapped_column(String(80), nullable=False)
    input_tokens: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    output_tokens: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    cache_read_tokens: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    cache_write_tokens: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    cost_usd: Mapped[Decimal] = mapped_column(Numeric(12, 6), nullable=False, default=0)
    usd_brl: Mapped[Decimal] = mapped_column(Numeric(8, 4), nullable=False)
    cost_brl: Mapped[Decimal] = mapped_column(Numeric(12, 6), nullable=False, default=0)
    latency_ms: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    # ok | refused | error | blocked (fora do tema, sem chamada ao modelo principal)
    status: Mapped[str] = mapped_column(String(20), nullable=False)
    error_code: Mapped[str | None] = mapped_column(String(60))
    request_id: Mapped[str | None] = mapped_column(String(80))
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), index=True
    )

    __table_args__ = (Index("ix_ai_usage_user_created", "user_id", "created_at"),)


class AIConversation(UUIDPk, Timestamps, Base):
    __tablename__ = "ai_conversations"

    user_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    title: Mapped[str] = mapped_column(String(200), nullable=False)
    translation_code: Mapped[str] = mapped_column(String(20), nullable=False)
    verse_key_start: Mapped[int | None] = mapped_column(Integer)
    verse_key_end: Mapped[int | None] = mapped_column(Integer)
    mode: Mapped[str] = mapped_column(String(30), nullable=False)
    # Só conversas salvas pelo usuário aparecem na biblioteca; as outras são apagadas depois de 30 dias
    saved: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)


class AIMessage(UUIDPk, Base):
    __tablename__ = "ai_messages"

    conversation_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("ai_conversations.id", ondelete="CASCADE"), nullable=False, index=True
    )
    role: Mapped[str] = mapped_column(String(10), nullable=False)  # user | assistant
    content: Mapped[str] = mapped_column(Text, nullable=False)
    # Referências citadas pela IA que não existem no texto bíblico (validação pós-resposta)
    invalid_references: Mapped[list] = mapped_column(JSONB, nullable=False, default=list)
    usage_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("ai_usage.id", ondelete="SET NULL"))
    feedback: Mapped[int | None] = mapped_column(SmallInteger)  # 1 útil, -1 não útil
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
