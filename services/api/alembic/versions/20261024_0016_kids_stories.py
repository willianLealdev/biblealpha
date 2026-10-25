"""BibleAlpha Kids: histórias e páginas

Revision ID: 0016
Revises: 0015
Create Date: 2026-10-24 12:00:00
"""

from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision: str = "0016"
down_revision: str | None = "0015"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "kids_stories",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("slug", sa.String(length=80), nullable=False),
        sa.Column("language", sa.String(length=10), nullable=False),
        sa.Column("title", sa.String(length=200), nullable=False),
        sa.Column("summary", sa.Text(), nullable=False),
        sa.Column("reference", sa.String(length=100), nullable=False),
        sa.Column("translation_code", sa.String(length=20), nullable=False),
        sa.Column("verse_key_start", sa.Integer(), nullable=False),
        sa.Column("verse_key_end", sa.Integer(), nullable=False),
        sa.Column("level", sa.String(length=10), nullable=False),
        sa.Column("status", sa.String(length=10), nullable=False),
        sa.Column("lesson", sa.Text(), nullable=False),
        sa.Column("family_question", sa.Text(), nullable=False),
        sa.Column("position", sa.Integer(), nullable=False),
        sa.Column("ai_meta", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column("created_by", sa.Uuid(), nullable=True),
        sa.Column("published_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(
            ["created_by"],
            ["users.id"],
            name=op.f("fk_kids_stories_created_by_users"),
            ondelete="SET NULL",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_kids_stories")),
        sa.UniqueConstraint("language", "slug", name=op.f("uq_kids_stories_language")),
    )
    op.create_index(op.f("ix_kids_stories_status"), "kids_stories", ["status"], unique=False)
    op.create_table(
        "kids_story_pages",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("story_id", sa.Uuid(), nullable=False),
        sa.Column("position", sa.Integer(), nullable=False),
        sa.Column("text", sa.Text(), nullable=False),
        sa.Column("image_prompt", sa.Text(), nullable=False),
        sa.ForeignKeyConstraint(
            ["story_id"],
            ["kids_stories.id"],
            name=op.f("fk_kids_story_pages_story_id_kids_stories"),
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_kids_story_pages")),
        sa.UniqueConstraint("story_id", "position", name=op.f("uq_kids_story_pages_story_id")),
    )
    op.create_index(op.f("ix_kids_story_pages_story_id"), "kids_story_pages", ["story_id"], unique=False)


def downgrade() -> None:
    op.drop_index(op.f("ix_kids_story_pages_story_id"), table_name="kids_story_pages")
    op.drop_table("kids_story_pages")
    op.drop_index(op.f("ix_kids_stories_status"), table_name="kids_stories")
    op.drop_table("kids_stories")
