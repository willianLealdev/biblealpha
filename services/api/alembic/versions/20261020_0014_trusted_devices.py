"""aparelho confiável: a pessoa marca no login e continua conectada até sair

Revision ID: 0014
Revises: 0013
Create Date: 2026-10-20 18:00:00
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "0014"
down_revision: str | None = "0013"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("auth_sessions", sa.Column("trusted", sa.Boolean(), nullable=False, server_default="false"))
    op.add_column("auth_sessions", sa.Column("device_name", sa.String(length=80), nullable=True))


def downgrade() -> None:
    op.drop_column("auth_sessions", "device_name")
    op.drop_column("auth_sessions", "trusted")
