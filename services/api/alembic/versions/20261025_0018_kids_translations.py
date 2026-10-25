"""BibleAlpha Kids: histórias traduzidas (uma vez por idioma, salvas para todos)

Revision ID: 0018
Revises: 0017
Create Date: 2026-10-25 10:00:00
"""

from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision: str = "0018"
down_revision: str | None = "0017"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "kids_story_translations",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("story_id", sa.Uuid(), nullable=False),
        sa.Column("language", sa.String(length=10), nullable=False),
        sa.Column("title", sa.String(length=200), nullable=False),
        sa.Column("summary", sa.Text(), nullable=False),
        sa.Column("pages", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column("lesson", sa.Text(), nullable=False),
        sa.Column("family_question", sa.Text(), nullable=False),
        sa.Column("quiz", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column("model", sa.String(length=80), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(
            ["story_id"],
            ["kids_stories.id"],
            name=op.f("fk_kids_story_translations_story_id_kids_stories"),
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_kids_story_translations")),
        sa.UniqueConstraint("story_id", "language", name=op.f("uq_kids_story_translations_story_id")),
    )
    op.create_index(
        op.f("ix_kids_story_translations_language"), "kids_story_translations", ["language"], unique=False
    )


def downgrade() -> None:
    op.drop_index(op.f("ix_kids_story_translations_language"), table_name="kids_story_translations")
    op.drop_table("kids_story_translations")
