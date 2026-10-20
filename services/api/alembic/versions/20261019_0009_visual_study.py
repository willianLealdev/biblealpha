"""estudo visual: lugares bíblicos, estudos por capítulo e ilustrações

Revision ID: 0009
Revises: 0008
Create Date: 2026-10-19 12:00:00
"""

import uuid
from collections.abc import Sequence
from datetime import date

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision: str = "0009"
down_revision: str | None = "0008"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "bible_places",
        sa.Column("id", sa.String(length=20), nullable=False),
        sa.Column("name", sa.String(length=120), nullable=False),
        sa.Column("lon", sa.Float(), nullable=False),
        sa.Column("lat", sa.Float(), nullable=False),
        sa.Column("kind", sa.String(length=40), nullable=False),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_bible_places")),
    )
    op.create_table(
        "place_mentions",
        sa.Column("id", sa.BigInteger(), autoincrement=True, nullable=False),
        sa.Column("place_id", sa.String(length=20), nullable=False),
        sa.Column("verse_key", sa.Integer(), nullable=False),
        sa.ForeignKeyConstraint(
            ["place_id"],
            ["bible_places.id"],
            name=op.f("fk_place_mentions_place_id_bible_places"),
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_place_mentions")),
    )
    op.create_index(op.f("ix_place_mentions_verse_key"), "place_mentions", ["verse_key"])
    op.create_table(
        "visual_studies",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("book", sa.String(length=3), nullable=False),
        sa.Column("chapter", sa.SmallInteger(), nullable=False),
        sa.Column("locale", sa.String(length=10), nullable=False),
        sa.Column("content", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column("model", sa.String(length=80), nullable=False),
        sa.Column("created_by", sa.Uuid(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(
            ["created_by"], ["users.id"], name=op.f("fk_visual_studies_created_by_users"), ondelete="SET NULL"
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_visual_studies")),
    )
    op.create_index("uq_visual_studies_chapter", "visual_studies", ["book", "chapter", "locale"], unique=True)
    op.create_table(
        "visual_images",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("book", sa.String(length=3), nullable=False),
        sa.Column("chapter", sa.SmallInteger(), nullable=False),
        sa.Column("position", sa.SmallInteger(), nullable=False),
        sa.Column("prompt", sa.Text(), nullable=False),
        sa.Column("mime", sa.String(length=40), nullable=False),
        sa.Column("data", sa.LargeBinary(), nullable=False),
        sa.Column("model", sa.String(length=80), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_visual_images")),
    )
    op.create_index("ix_visual_images_chapter", "visual_images", ["book", "chapter"])
    # Preço das ilustrações (OpenAI gpt-image-2, US$ por milhão de tokens: texto de entrada e imagem de saída)
    prices = sa.table(
        "ai_model_prices",
        sa.column("id", sa.Uuid()),
        sa.column("model", sa.String()),
        sa.column("input_per_mtok", sa.Numeric()),
        sa.column("output_per_mtok", sa.Numeric()),
        sa.column("cache_read_per_mtok", sa.Numeric()),
        sa.column("cache_write_per_mtok", sa.Numeric()),
        sa.column("valid_from", sa.Date()),
    )
    op.bulk_insert(
        prices,
        [
            {
                "id": uuid.uuid4(),
                "model": "gpt-image-2",
                "input_per_mtok": 5,
                "output_per_mtok": 30,
                "cache_read_per_mtok": 0,
                "cache_write_per_mtok": 0,
                "valid_from": date(2026, 1, 1),
            }
        ],
    )


def downgrade() -> None:
    op.execute("DELETE FROM ai_model_prices WHERE model = 'gpt-image-2'")
    op.drop_table("visual_images")
    op.drop_table("visual_studies")
    op.drop_table("place_mentions")
    op.drop_table("bible_places")
