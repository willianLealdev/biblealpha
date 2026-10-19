"""significados das palavras do original traduzidos para os idiomas do app

Revision ID: 0010
Revises: 0009
Create Date: 2026-10-19 13:00:00
"""
from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = '0010'
down_revision: str | None = '0009'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        'gloss_translations',
        sa.Column('locale', sa.String(length=10), nullable=False),
        sa.Column('source', sa.String(length=200), nullable=False),
        sa.Column('text', sa.String(length=300), nullable=False),
        sa.PrimaryKeyConstraint('locale', 'source', name=op.f('pk_gloss_translations')),
    )


def downgrade() -> None:
    op.drop_table('gloss_translations')
