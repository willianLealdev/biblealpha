"""bible and study data

Revision ID: 0002
Revises: 0001
Create Date: 2026-10-18 16:25:33.418252
"""

from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision: str = "0002"
down_revision: str | None = "0001"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # Busca sem acentos. Função própria (IMMUTABLE, pode ir em índices) em vez da extensão unaccent,
    # que nem toda instalação do PostgreSQL traz.
    op.execute(
        "CREATE OR REPLACE FUNCTION f_unaccent(text) RETURNS text "
        "LANGUAGE sql IMMUTABLE PARALLEL SAFE STRICT AS $$ SELECT translate($1, "
        "'áàâãäåÁÀÂÃÄÅéèêëÉÈÊËíìîïÍÌÎÏóòôõöÓÒÔÕÖúùûüÚÙÛÜçÇñÑ', "
        "'aaaaaaAAAAAAeeeeEEEEiiiiIIIIoooooOOOOOuuuuUUUUcCnN') $$"
    )
    op.execute("CREATE SEQUENCE IF NOT EXISTS user_data_rev_seq")
    op.create_table(
        "bible_translations",
        sa.Column("code", sa.String(length=20), nullable=False),
        sa.Column("name", sa.String(length=200), nullable=False),
        sa.Column("abbreviation", sa.String(length=20), nullable=False),
        sa.Column("language", sa.String(length=10), nullable=False),
        sa.Column("search_config", sa.String(length=20), nullable=False),
        sa.Column("description", sa.Text(), nullable=False),
        sa.Column("edition", sa.String(length=200), nullable=False),
        sa.Column("year", sa.SmallInteger(), nullable=True),
        sa.Column("license", sa.String(length=100), nullable=False),
        sa.Column("license_url", sa.String(length=300), nullable=True),
        sa.Column("attribution", sa.Text(), nullable=False),
        sa.Column("source_url", sa.String(length=300), nullable=False),
        sa.Column("source_sha256", sa.String(length=64), nullable=False),
        sa.Column("versification", sa.String(length=20), nullable=False),
        sa.Column("notes", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column("verse_count", sa.Integer(), nullable=False),
        sa.Column("is_active", sa.Boolean(), nullable=False),
        sa.Column("imported_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_bible_translations")),
        sa.UniqueConstraint("code", name=op.f("uq_bible_translations_code")),
    )
    op.create_table(
        "annotations",
        sa.Column("scope", sa.String(length=10), nullable=False),
        sa.Column("verse_key_start", sa.Integer(), nullable=False),
        sa.Column("verse_key_end", sa.Integer(), nullable=False),
        sa.Column("title", sa.String(length=200), nullable=True),
        sa.Column("body", sa.Text(), nullable=False),
        sa.Column("tags", postgresql.ARRAY(sa.String(length=40)), nullable=False),
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("rev", sa.BigInteger(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("client_updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(
            ["user_id"], ["users.id"], name=op.f("fk_annotations_user_id_users"), ondelete="CASCADE"
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_annotations")),
    )
    op.create_index(op.f("ix_annotations_rev"), "annotations", ["rev"], unique=False)
    op.create_index(op.f("ix_annotations_user_id"), "annotations", ["user_id"], unique=False)
    op.create_index(
        "ix_annotations_user_range",
        "annotations",
        ["user_id", "verse_key_start", "verse_key_end"],
        unique=False,
    )
    op.create_table(
        "bible_verses",
        sa.Column("id", sa.BigInteger(), autoincrement=True, nullable=False),
        sa.Column("translation_id", sa.Uuid(), nullable=False),
        sa.Column("book_id", sa.SmallInteger(), nullable=False),
        sa.Column("chapter", sa.SmallInteger(), nullable=False),
        sa.Column("verse", sa.SmallInteger(), nullable=False),
        sa.Column("verse_key", sa.Integer(), nullable=False),
        sa.Column("text", sa.Text(), nullable=False),
        sa.Column("search_vector", postgresql.TSVECTOR(), nullable=True),
        sa.ForeignKeyConstraint(
            ["translation_id"],
            ["bible_translations.id"],
            name=op.f("fk_bible_verses_translation_id_bible_translations"),
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_bible_verses")),
    )
    op.create_index(
        "ix_bible_verses_chapter", "bible_verses", ["translation_id", "book_id", "chapter"], unique=False
    )
    op.create_index(
        "ix_bible_verses_search", "bible_verses", ["search_vector"], unique=False, postgresql_using="gin"
    )
    op.create_index(
        "uq_bible_verses_translation_key", "bible_verses", ["translation_id", "verse_key"], unique=True
    )
    op.create_table(
        "bookmarks",
        sa.Column("verse_key_start", sa.Integer(), nullable=False),
        sa.Column("verse_key_end", sa.Integer(), nullable=False),
        sa.Column("translation_code", sa.String(length=20), nullable=True),
        sa.Column("label", sa.String(length=200), nullable=True),
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("rev", sa.BigInteger(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("client_updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(
            ["user_id"], ["users.id"], name=op.f("fk_bookmarks_user_id_users"), ondelete="CASCADE"
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_bookmarks")),
    )
    op.create_index(op.f("ix_bookmarks_rev"), "bookmarks", ["rev"], unique=False)
    op.create_index(op.f("ix_bookmarks_user_id"), "bookmarks", ["user_id"], unique=False)
    op.create_table(
        "highlight_categories",
        sa.Column("name", sa.String(length=60), nullable=False),
        sa.Column("color", sa.String(length=20), nullable=False),
        sa.Column("position", sa.SmallInteger(), nullable=False),
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("rev", sa.BigInteger(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("client_updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(
            ["user_id"], ["users.id"], name=op.f("fk_highlight_categories_user_id_users"), ondelete="CASCADE"
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_highlight_categories")),
    )
    op.create_index(op.f("ix_highlight_categories_rev"), "highlight_categories", ["rev"], unique=False)
    op.create_index(
        op.f("ix_highlight_categories_user_id"), "highlight_categories", ["user_id"], unique=False
    )
    op.create_table(
        "reading_history",
        sa.Column("id", sa.BigInteger(), autoincrement=True, nullable=False),
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("book_id", sa.SmallInteger(), nullable=False),
        sa.Column("chapter", sa.SmallInteger(), nullable=False),
        sa.Column("read_on", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(
            ["user_id"], ["users.id"], name=op.f("fk_reading_history_user_id_users"), ondelete="CASCADE"
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_reading_history")),
    )
    op.create_index(op.f("ix_reading_history_user_id"), "reading_history", ["user_id"], unique=False)
    op.create_index("ix_reading_history_user_recent", "reading_history", ["user_id", "read_on"], unique=False)
    op.create_table(
        "reading_progress",
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("translation_code", sa.String(length=20), nullable=False),
        sa.Column("book_id", sa.SmallInteger(), nullable=False),
        sa.Column("chapter", sa.SmallInteger(), nullable=False),
        sa.Column("verse", sa.SmallInteger(), nullable=True),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(
            ["user_id"], ["users.id"], name=op.f("fk_reading_progress_user_id_users"), ondelete="CASCADE"
        ),
        sa.PrimaryKeyConstraint("user_id", name=op.f("pk_reading_progress")),
    )
    op.create_table(
        "highlights",
        sa.Column("verse_key", sa.Integer(), nullable=False),
        sa.Column("category_id", sa.Uuid(), nullable=False),
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("rev", sa.BigInteger(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("client_updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(
            ["category_id"],
            ["highlight_categories.id"],
            name=op.f("fk_highlights_category_id_highlight_categories"),
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["user_id"], ["users.id"], name=op.f("fk_highlights_user_id_users"), ondelete="CASCADE"
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_highlights")),
    )
    op.create_index(op.f("ix_highlights_rev"), "highlights", ["rev"], unique=False)
    op.create_index(op.f("ix_highlights_user_id"), "highlights", ["user_id"], unique=False)
    op.create_index("ix_highlights_user_verse", "highlights", ["user_id", "verse_key"], unique=False)


def downgrade() -> None:
    op.drop_index("ix_highlights_user_verse", table_name="highlights")
    op.drop_index(op.f("ix_highlights_user_id"), table_name="highlights")
    op.drop_index(op.f("ix_highlights_rev"), table_name="highlights")
    op.drop_table("highlights")
    op.drop_table("reading_progress")
    op.drop_index("ix_reading_history_user_recent", table_name="reading_history")
    op.drop_index(op.f("ix_reading_history_user_id"), table_name="reading_history")
    op.drop_table("reading_history")
    op.drop_index(op.f("ix_highlight_categories_user_id"), table_name="highlight_categories")
    op.drop_index(op.f("ix_highlight_categories_rev"), table_name="highlight_categories")
    op.drop_table("highlight_categories")
    op.drop_index(op.f("ix_bookmarks_user_id"), table_name="bookmarks")
    op.drop_index(op.f("ix_bookmarks_rev"), table_name="bookmarks")
    op.drop_table("bookmarks")
    op.drop_index("uq_bible_verses_translation_key", table_name="bible_verses")
    op.drop_index("ix_bible_verses_search", table_name="bible_verses", postgresql_using="gin")
    op.drop_index("ix_bible_verses_chapter", table_name="bible_verses")
    op.drop_table("bible_verses")
    op.drop_index("ix_annotations_user_range", table_name="annotations")
    op.drop_index(op.f("ix_annotations_user_id"), table_name="annotations")
    op.drop_index(op.f("ix_annotations_rev"), table_name="annotations")
    op.drop_table("annotations")
    op.drop_table("bible_translations")
    op.execute("DROP SEQUENCE IF EXISTS user_data_rev_seq")
    op.execute("DROP FUNCTION IF EXISTS f_unaccent(text)")
