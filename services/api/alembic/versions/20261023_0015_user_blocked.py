"""bloqueio de conta pelo administrador

Revision ID: 0015
Revises: 0014
Create Date: 2026-10-23 20:00:00
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "0015"
down_revision: str | None = "0014"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("users", sa.Column("blocked_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column("users", sa.Column("blocked_reason", sa.String(length=300), nullable=True))


def downgrade() -> None:
    op.drop_column("users", "blocked_reason")
    op.drop_column("users", "blocked_at")
