"""BibleAlpha Kids: quiz das histórias e versículos para decorar

Revision ID: 0017
Revises: 0016
Create Date: 2026-10-24 18:00:00
"""

from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision: str = "0017"
down_revision: str | None = "0016"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "kids_stories",
        sa.Column(
            "quiz",
            postgresql.JSONB(astext_type=sa.Text()),
            server_default=sa.text("'[]'::jsonb"),
            nullable=False,
        ),
    )
    op.create_table(
        "kids_verses",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("language", sa.String(length=10), nullable=False),
        sa.Column("reference", sa.String(length=100), nullable=False),
        sa.Column("translation_code", sa.String(length=20), nullable=False),
        sa.Column("verse_key_start", sa.Integer(), nullable=False),
        sa.Column("verse_key_end", sa.Integer(), nullable=False),
        sa.Column("text", sa.Text(), nullable=False),
        sa.Column("level", sa.String(length=10), nullable=False),
        sa.Column("status", sa.String(length=10), nullable=False),
        sa.Column("position", sa.Integer(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_kids_verses")),
        sa.UniqueConstraint(
            "language", "verse_key_start", "verse_key_end", name=op.f("uq_kids_verses_language")
        ),
    )
    op.create_index(op.f("ix_kids_verses_status"), "kids_verses", ["status"], unique=False)


def downgrade() -> None:
    op.drop_index(op.f("ix_kids_verses_status"), table_name="kids_verses")
    op.drop_table("kids_verses")
    op.drop_column("kids_stories", "quiz")
