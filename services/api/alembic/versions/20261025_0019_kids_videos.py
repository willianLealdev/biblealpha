"""BibleAlpha Kids: vídeos enviados pelo administrador (guardados em pedaços)

Revision ID: 0019
Revises: 0018
Create Date: 2026-10-25 14:00:00
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "0019"
down_revision: str | None = "0018"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "kids_videos",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("title", sa.String(length=200), nullable=False),
        sa.Column("description", sa.Text(), nullable=False),
        sa.Column("language", sa.String(length=10), nullable=False),
        sa.Column("level", sa.String(length=10), nullable=False),
        sa.Column("status", sa.String(length=10), nullable=False),
        sa.Column("mime", sa.String(length=40), nullable=False),
        sa.Column("size", sa.BigInteger(), nullable=False),
        sa.Column("chunk_size", sa.Integer(), nullable=False),
        sa.Column("poster_mime", sa.String(length=40), nullable=True),
        sa.Column("poster", sa.LargeBinary(), nullable=True),
        sa.Column("position", sa.Integer(), nullable=False),
        sa.Column("created_by", sa.Uuid(), nullable=True),
        sa.Column("published_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(
            ["created_by"], ["users.id"], name=op.f("fk_kids_videos_created_by_users"), ondelete="SET NULL"
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_kids_videos")),
    )
    op.create_index(op.f("ix_kids_videos_status"), "kids_videos", ["status"], unique=False)
    op.create_table(
        "kids_video_chunks",
        sa.Column("video_id", sa.Uuid(), nullable=False),
        sa.Column("n", sa.Integer(), nullable=False),
        sa.Column("data", sa.LargeBinary(), nullable=False),
        sa.ForeignKeyConstraint(
            ["video_id"],
            ["kids_videos.id"],
            name=op.f("fk_kids_video_chunks_video_id_kids_videos"),
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("video_id", "n", name=op.f("pk_kids_video_chunks")),
    )


def downgrade() -> None:
    op.drop_table("kids_video_chunks")
    op.drop_index(op.f("ix_kids_videos_status"), table_name="kids_videos")
    op.drop_table("kids_videos")
