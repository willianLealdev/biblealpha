"""stripe: cliente por usuário e preço do Stripe por versão de preço

Revision ID: 0006
Revises: 0005
Create Date: 2026-10-19 02:00:00
"""
from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = '0006'
down_revision: str | None = '0005'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column('users', sa.Column('stripe_customer_id', sa.String(length=80), nullable=True))
    op.create_index('ix_users_stripe_customer_id', 'users', ['stripe_customer_id'], unique=True)
    op.add_column('plan_prices', sa.Column('stripe_price_id', sa.String(length=80), nullable=True))


def downgrade() -> None:
    op.drop_column('plan_prices', 'stripe_price_id')
    op.drop_index('ix_users_stripe_customer_id', table_name='users')
    op.drop_column('users', 'stripe_customer_id')
