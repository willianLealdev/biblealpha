"""ai and billing

Revision ID: 0003
Revises: 0002
Create Date: 2026-10-18 16:58:04.861398
"""

from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision: str = "0003"
down_revision: str | None = "0002"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "ai_model_prices",
        sa.Column("model", sa.String(length=80), nullable=False),
        sa.Column("input_per_mtok", sa.Numeric(precision=10, scale=4), nullable=False),
        sa.Column("output_per_mtok", sa.Numeric(precision=10, scale=4), nullable=False),
        sa.Column("cache_read_per_mtok", sa.Numeric(precision=10, scale=4), nullable=False),
        sa.Column("cache_write_per_mtok", sa.Numeric(precision=10, scale=4), nullable=False),
        sa.Column("valid_from", sa.Date(), nullable=False),
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_ai_model_prices")),
    )
    op.create_index("ix_ai_model_prices_model_from", "ai_model_prices", ["model", "valid_from"], unique=False)
    op.create_table(
        "payment_events",
        sa.Column("source", sa.String(length=20), nullable=False),
        sa.Column("external_id", sa.String(length=120), nullable=False),
        sa.Column("event_type", sa.String(length=60), nullable=False),
        sa.Column("payload", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column("processed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_payment_events")),
        sa.UniqueConstraint("external_id", name=op.f("uq_payment_events_external_id")),
    )
    op.create_table(
        "plan_prices",
        sa.Column("plan", sa.String(length=20), nullable=False),
        sa.Column("interval", sa.String(length=10), nullable=False),
        sa.Column("currency", sa.String(length=3), nullable=False),
        sa.Column("amount", sa.Numeric(precision=10, scale=2), nullable=False),
        sa.Column("valid_from", sa.Date(), nullable=False),
        sa.Column("is_current", sa.Boolean(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_plan_prices")),
    )
    op.create_index(
        "uq_plan_prices_current",
        "plan_prices",
        ["plan", "interval", "currency"],
        unique=True,
        postgresql_where=sa.text("is_current"),
    )
    op.create_table(
        "ai_conversations",
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("title", sa.String(length=200), nullable=False),
        sa.Column("translation_code", sa.String(length=20), nullable=False),
        sa.Column("verse_key_start", sa.Integer(), nullable=True),
        sa.Column("verse_key_end", sa.Integer(), nullable=True),
        sa.Column("mode", sa.String(length=30), nullable=False),
        sa.Column("saved", sa.Boolean(), nullable=False),
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(
            ["user_id"], ["users.id"], name=op.f("fk_ai_conversations_user_id_users"), ondelete="CASCADE"
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_ai_conversations")),
    )
    op.create_index(op.f("ix_ai_conversations_user_id"), "ai_conversations", ["user_id"], unique=False)
    op.create_table(
        "ai_usage",
        sa.Column("user_id", sa.Uuid(), nullable=True),
        sa.Column("plan", sa.String(length=20), nullable=False),
        sa.Column("feature", sa.String(length=40), nullable=False),
        sa.Column("provider", sa.String(length=20), nullable=False),
        sa.Column("model", sa.String(length=80), nullable=False),
        sa.Column("input_tokens", sa.Integer(), nullable=False),
        sa.Column("output_tokens", sa.Integer(), nullable=False),
        sa.Column("cache_read_tokens", sa.Integer(), nullable=False),
        sa.Column("cache_write_tokens", sa.Integer(), nullable=False),
        sa.Column("cost_usd", sa.Numeric(precision=12, scale=6), nullable=False),
        sa.Column("usd_brl", sa.Numeric(precision=8, scale=4), nullable=False),
        sa.Column("cost_brl", sa.Numeric(precision=12, scale=6), nullable=False),
        sa.Column("latency_ms", sa.Integer(), nullable=False),
        sa.Column("status", sa.String(length=20), nullable=False),
        sa.Column("error_code", sa.String(length=60), nullable=True),
        sa.Column("request_id", sa.String(length=80), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.ForeignKeyConstraint(
            ["user_id"], ["users.id"], name=op.f("fk_ai_usage_user_id_users"), ondelete="SET NULL"
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_ai_usage")),
    )
    op.create_index(op.f("ix_ai_usage_created_at"), "ai_usage", ["created_at"], unique=False)
    op.create_index("ix_ai_usage_user_created", "ai_usage", ["user_id", "created_at"], unique=False)
    op.create_index(op.f("ix_ai_usage_user_id"), "ai_usage", ["user_id"], unique=False)
    op.create_table(
        "subscriptions",
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("plan", sa.String(length=20), nullable=False),
        sa.Column("status", sa.String(length=20), nullable=False),
        sa.Column("source", sa.String(length=20), nullable=False),
        sa.Column("price_id", sa.Uuid(), nullable=True),
        sa.Column("external_id", sa.String(length=120), nullable=True),
        sa.Column("current_period_end", sa.DateTime(timezone=True), nullable=True),
        sa.Column("cancel_at_period_end", sa.Boolean(), nullable=False),
        sa.Column("note", sa.Text(), nullable=True),
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(
            ["price_id"],
            ["plan_prices.id"],
            name=op.f("fk_subscriptions_price_id_plan_prices"),
            ondelete="SET NULL",
        ),
        sa.ForeignKeyConstraint(
            ["user_id"], ["users.id"], name=op.f("fk_subscriptions_user_id_users"), ondelete="CASCADE"
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_subscriptions")),
    )
    op.create_index(op.f("ix_subscriptions_external_id"), "subscriptions", ["external_id"], unique=False)
    op.create_index(op.f("ix_subscriptions_user_id"), "subscriptions", ["user_id"], unique=False)
    op.create_table(
        "system_settings",
        sa.Column("key", sa.String(length=80), nullable=False),
        sa.Column("value", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_by", sa.Uuid(), nullable=True),
        sa.ForeignKeyConstraint(
            ["updated_by"],
            ["users.id"],
            name=op.f("fk_system_settings_updated_by_users"),
            ondelete="SET NULL",
        ),
        sa.PrimaryKeyConstraint("key", name=op.f("pk_system_settings")),
    )
    op.create_table(
        "ai_messages",
        sa.Column("conversation_id", sa.Uuid(), nullable=False),
        sa.Column("role", sa.String(length=10), nullable=False),
        sa.Column("content", sa.Text(), nullable=False),
        sa.Column("invalid_references", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column("usage_id", sa.Uuid(), nullable=True),
        sa.Column("feedback", sa.SmallInteger(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.ForeignKeyConstraint(
            ["conversation_id"],
            ["ai_conversations.id"],
            name=op.f("fk_ai_messages_conversation_id_ai_conversations"),
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["usage_id"], ["ai_usage.id"], name=op.f("fk_ai_messages_usage_id_ai_usage"), ondelete="SET NULL"
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_ai_messages")),
    )
    op.create_index(op.f("ix_ai_messages_conversation_id"), "ai_messages", ["conversation_id"], unique=False)

    # Configurações iniciais (editáveis no painel do administrador)
    settings = sa.table("system_settings", sa.column("key", sa.String), sa.column("value", postgresql.JSONB))
    op.bulk_insert(
        settings,
        [
            {
                "key": "ai.models",
                "value": {
                    "explain": {"model": "claude-opus-5-5", "effort": "medium", "max_tokens": 16000},
                    "chat": {"model": "claude-opus-5-5", "effort": "medium", "max_tokens": 16000},
                    "classify": {"model": "claude-haiku-5-5", "effort": "low", "max_tokens": 16},
                },
            },
            {
                "key": "ai.quotas",
                "value": {"free_daily": 5, "free_monthly": 60, "pro_daily_cap": 200, "pro_per_minute": 8},
            },
            {
                "key": "ai.budget",
                "value": {"daily_usd": 20, "monthly_usd": 400, "hard_daily_usd": 60, "alert_email": None},
            },
            {"key": "fx.usd_brl", "value": {"rate": 5.4, "source": "manual"}},
            {"key": "ai.enabled", "value": {"value": True}},
        ],
    )

    # Preços da Anthropic em US$ por milhão de tokens (escrita em cache = 1,25x a entrada)
    prices = sa.table(
        "ai_model_prices",
        sa.column("id", sa.Uuid),
        sa.column("model", sa.String),
        sa.column("input_per_mtok", sa.Numeric),
        sa.column("output_per_mtok", sa.Numeric),
        sa.column("cache_read_per_mtok", sa.Numeric),
        sa.column("cache_write_per_mtok", sa.Numeric),
        sa.column("valid_from", sa.Date),
    )
    import datetime
    import uuid

    start = datetime.date(2026, 1, 1)
    op.bulk_insert(
        prices,
        [
            {
                "id": uuid.uuid4(),
                "model": "claude-opus-5-5",
                "input_per_mtok": 4,
                "output_per_mtok": 20,
                "cache_read_per_mtok": 0.20,
                "cache_write_per_mtok": 5,
                "valid_from": start,
            },
            {
                "id": uuid.uuid4(),
                "model": "claude-sonnet-5-5",
                "input_per_mtok": 2,
                "output_per_mtok": 10,
                "cache_read_per_mtok": 0.20,
                "cache_write_per_mtok": 2.5,
                "valid_from": start,
            },
            {
                "id": uuid.uuid4(),
                "model": "claude-haiku-5-5",
                "input_per_mtok": 0.10,
                "output_per_mtok": 0.50,
                "cache_read_per_mtok": 0.01,
                "cache_write_per_mtok": 0.125,
                "valid_from": start,
            },
            {
                "id": uuid.uuid4(),
                "model": "fake",
                "input_per_mtok": 0,
                "output_per_mtok": 0,
                "cache_read_per_mtok": 0,
                "cache_write_per_mtok": 0,
                "valid_from": start,
            },
        ],
    )


def downgrade() -> None:
    op.drop_index(op.f("ix_ai_messages_conversation_id"), table_name="ai_messages")
    op.drop_table("ai_messages")
    op.drop_table("system_settings")
    op.drop_index(op.f("ix_subscriptions_user_id"), table_name="subscriptions")
    op.drop_index(op.f("ix_subscriptions_external_id"), table_name="subscriptions")
    op.drop_table("subscriptions")
    op.drop_index(op.f("ix_ai_usage_user_id"), table_name="ai_usage")
    op.drop_index("ix_ai_usage_user_created", table_name="ai_usage")
    op.drop_index(op.f("ix_ai_usage_created_at"), table_name="ai_usage")
    op.drop_table("ai_usage")
    op.drop_index(op.f("ix_ai_conversations_user_id"), table_name="ai_conversations")
    op.drop_table("ai_conversations")
    op.drop_index("uq_plan_prices_current", table_name="plan_prices", postgresql_where=sa.text("is_current"))
    op.drop_table("plan_prices")
    op.drop_table("payment_events")
    op.drop_index("ix_ai_model_prices_model_from", table_name="ai_model_prices")
    op.drop_table("ai_model_prices")
