"""Planos e assinaturas. Free: tudo liberado, IA com limite. Pro: IA sem limite prático.

O preço é versionado: quem já assina mantém a versão contratada quando o preço muda.
"""

import uuid
from datetime import date, datetime
from decimal import Decimal

from sqlalchemy import Boolean, Date, DateTime, ForeignKey, Index, Numeric, String, Text, func, text
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, Timestamps, UUIDPk


class PlanPrice(UUIDPk, Base):
    __tablename__ = "plan_prices"

    plan: Mapped[str] = mapped_column(String(20), nullable=False)  # pro
    interval: Mapped[str] = mapped_column(String(10), nullable=False)  # month | year
    currency: Mapped[str] = mapped_column(String(3), nullable=False)  # BRL | USD | EUR
    amount: Mapped[Decimal] = mapped_column(Numeric(10, 2), nullable=False)
    valid_from: Mapped[date] = mapped_column(Date, nullable=False)
    # Preço oferecido a novos assinantes (só um ativo por plano/intervalo/moeda)
    is_current: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    # Preço correspondente no Stripe (criado na primeira assinatura ou ao definir o preço)
    stripe_price_id: Mapped[str | None] = mapped_column(String(80))

    __table_args__ = (
        Index(
            "uq_plan_prices_current",
            "plan",
            "interval",
            "currency",
            unique=True,
            postgresql_where=text("is_current"),
        ),
    )


class Subscription(UUIDPk, Timestamps, Base):
    __tablename__ = "subscriptions"

    user_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    plan: Mapped[str] = mapped_column(String(20), nullable=False)  # pro
    # active | past_due | canceled | expired
    status: Mapped[str] = mapped_column(String(20), nullable=False)
    # manual (cortesia do admin) | gateway | apple | google
    source: Mapped[str] = mapped_column(String(20), nullable=False)
    price_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("plan_prices.id", ondelete="SET NULL"))
    external_id: Mapped[str | None] = mapped_column(String(120), index=True)
    current_period_end: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    cancel_at_period_end: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    note: Mapped[str | None] = mapped_column(Text)


class PaymentEvent(UUIDPk, Base):
    """Eventos recebidos dos meios de pagamento (idempotentes pelo id externo)."""

    __tablename__ = "payment_events"

    source: Mapped[str] = mapped_column(String(20), nullable=False)
    external_id: Mapped[str] = mapped_column(String(120), nullable=False, unique=True)
    event_type: Mapped[str] = mapped_column(String(60), nullable=False)
    payload: Mapped[dict] = mapped_column(JSONB, nullable=False)
    processed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
