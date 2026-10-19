"""Dados pessoais de estudo, numa camada separada do texto bíblico.

Todos usam UUID gerado no aparelho, `rev` crescente (cursor da sincronização) e exclusão lógica,
para funcionar offline e sincronizar sem perder edições.
"""

import uuid
from datetime import datetime

from sqlalchemy import (
    BigInteger,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    Sequence,
    SmallInteger,
    String,
    Text,
    func,
)
from sqlalchemy.dialects.postgresql import ARRAY
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base

# Um único contador para todas as entidades sincronizadas: o cliente guarda o maior `rev` que já viu
user_data_rev = Sequence("user_data_rev_seq", metadata=Base.metadata)


class SyncedMixin:
    id: Mapped[uuid.UUID] = mapped_column(primary_key=True)
    user_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    rev: Mapped[int] = mapped_column(BigInteger, nullable=False, index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    # Momento da edição no aparelho: decide conflitos de "última escrita vence"
    client_updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class HighlightCategory(SyncedMixin, Base):
    """Cores de destaque com significado configurável (Amarelo: promessa, Azul: ensinamento...)."""

    __tablename__ = "highlight_categories"

    name: Mapped[str] = mapped_column(String(60), nullable=False)
    color: Mapped[str] = mapped_column(String(20), nullable=False)  # yellow, blue, green, red, purple, orange
    position: Mapped[int] = mapped_column(SmallInteger, nullable=False, default=0)


class Highlight(SyncedMixin, Base):
    """Um versículo destacado. Vale para todas as traduções com a mesma numeração."""

    __tablename__ = "highlights"

    verse_key: Mapped[int] = mapped_column(Integer, nullable=False)
    category_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("highlight_categories.id", ondelete="CASCADE"), nullable=False
    )

    __table_args__ = (Index("ix_highlights_user_verse", "user_id", "verse_key"),)


class Bookmark(SyncedMixin, Base):
    """Favorito: um versículo ou um trecho."""

    __tablename__ = "bookmarks"

    verse_key_start: Mapped[int] = mapped_column(Integer, nullable=False)
    verse_key_end: Mapped[int] = mapped_column(Integer, nullable=False)
    translation_code: Mapped[str | None] = mapped_column(String(20))
    label: Mapped[str | None] = mapped_column(String(200))


class Annotation(SyncedMixin, Base):
    """Anotação ligada a um livro, capítulo, versículo ou trecho."""

    __tablename__ = "annotations"

    scope: Mapped[str] = mapped_column(String(10), nullable=False)  # book | chapter | verse | range
    verse_key_start: Mapped[int] = mapped_column(Integer, nullable=False)
    verse_key_end: Mapped[int] = mapped_column(Integer, nullable=False)
    title: Mapped[str | None] = mapped_column(String(200))
    body: Mapped[str] = mapped_column(Text, nullable=False, default="")
    tags: Mapped[list[str]] = mapped_column(ARRAY(String(40)), nullable=False, default=list)

    __table_args__ = (Index("ix_annotations_user_range", "user_id", "verse_key_start", "verse_key_end"),)


class ReadingProgress(Base):
    """Onde o usuário parou (um registro por usuário)."""

    __tablename__ = "reading_progress"

    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), primary_key=True)
    translation_code: Mapped[str] = mapped_column(String(20), nullable=False)
    book_id: Mapped[int] = mapped_column(SmallInteger, nullable=False)
    chapter: Mapped[int] = mapped_column(SmallInteger, nullable=False)
    verse: Mapped[int | None] = mapped_column(SmallInteger)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class ReadingHistory(Base):
    """Capítulos lidos (um registro por capítulo por dia)."""

    __tablename__ = "reading_history"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    user_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    book_id: Mapped[int] = mapped_column(SmallInteger, nullable=False)
    chapter: Mapped[int] = mapped_column(SmallInteger, nullable=False)
    read_on: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    __table_args__ = (Index("ix_reading_history_user_recent", "user_id", "read_on"),)
