"""sermons

Revision ID: 0005
Revises: 0004
Create Date: 2026-10-18 17:33:00.526277
"""

from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision: str = "0005"
down_revision: str | None = "0004"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "sermons",
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("title", sa.String(length=200), nullable=False),
        sa.Column("theme", sa.String(length=200), nullable=True),
        sa.Column("main_reference", sa.String(length=120), nullable=True),
        sa.Column("other_references", postgresql.ARRAY(sa.String(length=120)), nullable=False),
        sa.Column("kind", sa.String(length=20), nullable=False),
        sa.Column("objective", sa.Text(), nullable=True),
        sa.Column("audience", sa.String(length=200), nullable=True),
        sa.Column("event", sa.String(length=200), nullable=True),
        sa.Column("scheduled_for", sa.Date(), nullable=True),
        sa.Column("duration_minutes", sa.SmallInteger(), nullable=True),
        sa.Column("folder", sa.String(length=80), nullable=True),
        sa.Column("tags", postgresql.ARRAY(sa.String(length=40)), nullable=False),
        sa.Column("content", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column("pulpit_notes", sa.Text(), nullable=False),
        sa.Column("version", sa.Integer(), nullable=False),
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(
            ["user_id"], ["users.id"], name=op.f("fk_sermons_user_id_users"), ondelete="CASCADE"
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_sermons")),
    )
    op.create_index(op.f("ix_sermons_user_id"), "sermons", ["user_id"], unique=False)
    op.create_index("ix_sermons_user_updated", "sermons", ["user_id", "updated_at"], unique=False)
    op.create_table(
        "sermon_versions",
        sa.Column("sermon_id", sa.Uuid(), nullable=False),
        sa.Column("version", sa.Integer(), nullable=False),
        sa.Column("title", sa.String(length=200), nullable=False),
        sa.Column("content", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.ForeignKeyConstraint(
            ["sermon_id"],
            ["sermons.id"],
            name=op.f("fk_sermon_versions_sermon_id_sermons"),
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_sermon_versions")),
    )
    op.create_index(op.f("ix_sermon_versions_sermon_id"), "sermon_versions", ["sermon_id"], unique=False)


def downgrade() -> None:
    op.drop_index(op.f("ix_sermon_versions_sermon_id"), table_name="sermon_versions")
    op.drop_table("sermon_versions")
    op.drop_index("ix_sermons_user_updated", table_name="sermons")
    op.drop_index(op.f("ix_sermons_user_id"), table_name="sermons")
    op.drop_table("sermons")
