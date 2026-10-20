"""hebraico/grego (palavras e léxico) e referências cruzadas

Revision ID: 0008
Revises: 0007
Create Date: 2026-10-19 11:00:00
"""

from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision: str = "0008"
down_revision: str | None = "0007"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "original_words",
        sa.Column("id", sa.BigInteger(), autoincrement=True, nullable=False),
        sa.Column("verse_key", sa.Integer(), nullable=False),
        sa.Column("position", sa.SmallInteger(), nullable=False),
        sa.Column("text", sa.String(length=120), nullable=False),
        sa.Column("translit", sa.String(length=160), nullable=False),
        sa.Column("gloss_en", sa.String(length=200), nullable=False),
        sa.Column("gloss_es", sa.String(length=200), nullable=True),
        sa.Column("strong", sa.String(length=12), nullable=True),
        sa.Column("morph", sa.String(length=40), nullable=False),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_original_words")),
    )
    op.create_index("ix_original_words_verse", "original_words", ["verse_key", "position"])
    op.create_table(
        "lexicon_entries",
        sa.Column("strong", sa.String(length=12), nullable=False),
        sa.Column("base", sa.String(length=8), nullable=False),
        sa.Column("lemma", sa.String(length=120), nullable=False),
        sa.Column("translit", sa.String(length=120), nullable=False),
        sa.Column("morph", sa.String(length=40), nullable=False),
        sa.Column("gloss", sa.String(length=300), nullable=False),
        sa.Column("definition", sa.Text(), nullable=False),
        sa.Column("i18n", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.PrimaryKeyConstraint("strong", name=op.f("pk_lexicon_entries")),
    )
    op.create_index(op.f("ix_lexicon_entries_base"), "lexicon_entries", ["base"])
    op.create_table(
        "cross_references",
        sa.Column("id", sa.BigInteger(), autoincrement=True, nullable=False),
        sa.Column("from_key", sa.Integer(), nullable=False),
        sa.Column("to_start", sa.Integer(), nullable=False),
        sa.Column("to_end", sa.Integer(), nullable=False),
        sa.Column("votes", sa.Integer(), nullable=False),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_cross_references")),
    )
    op.create_index("ix_cross_references_from", "cross_references", ["from_key", "votes"])


def downgrade() -> None:
    op.drop_table("cross_references")
    op.drop_table("lexicon_entries")
    op.drop_table("original_words")
