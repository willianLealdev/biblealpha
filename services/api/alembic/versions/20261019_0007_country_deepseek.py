"""país do usuário e preços da DeepSeek

Revision ID: 0007
Revises: 0006
Create Date: 2026-10-19 09:00:00
"""
import uuid
from collections.abc import Sequence
from datetime import date

import sqlalchemy as sa
from alembic import op

revision: str = '0007'
down_revision: str | None = '0006'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # País escolhido no cadastro (ISO 3166-1 alfa-2, ex.: BR)
    op.add_column('users', sa.Column('country', sa.String(length=2), nullable=True))
    # Preços da DeepSeek (US$ por milhão de tokens, horário de pico; fora do pico custa metade).
    # Fonte: api-docs.deepseek.com/quick_start/pricing (19/10/2026). Ajuste no painel: um preço
    # novo entra com outra data e não reescreve o histórico.
    prices = sa.table(
        'ai_model_prices',
        sa.column('id', sa.Uuid()),
        sa.column('model', sa.String()),
        sa.column('input_per_mtok', sa.Numeric()),
        sa.column('output_per_mtok', sa.Numeric()),
        sa.column('cache_read_per_mtok', sa.Numeric()),
        sa.column('cache_write_per_mtok', sa.Numeric()),
        sa.column('valid_from', sa.Date()),
    )
    op.bulk_insert(
        prices,
        [
            {
                'id': uuid.uuid4(),
                'model': model,
                'input_per_mtok': inp,
                'output_per_mtok': out,
                'cache_read_per_mtok': hit,
                'cache_write_per_mtok': inp,
                'valid_from': date(2026, 1, 1),
            }
            for model, inp, out, hit in (
                ('deepseek-flash', 0.30, 1.20, 0.006),
                ('deepseek-v4-pro', 1.32, 3.96, 0.044),
            )
        ],
    )


def downgrade() -> None:
    op.execute("DELETE FROM ai_model_prices WHERE model LIKE 'deepseek%'")
    op.drop_column('users', 'country')
