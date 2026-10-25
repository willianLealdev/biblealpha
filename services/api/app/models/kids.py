"""BibleAlpha Kids: histórias bíblicas para crianças.

Todo conteúdo nasce como rascunho (gerado pela IA ou escrito pelo administrador) e só aparece em
/kids depois que o administrador revisa e publica. Nada aqui guarda dado de criança.
"""

import uuid
from datetime import datetime

from sqlalchemy import (
    BigInteger,
    DateTime,
    ForeignKey,
    Integer,
    LargeBinary,
    String,
    Text,
    UniqueConstraint,
    text,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, Timestamps, UUIDPk


class KidsStory(UUIDPk, Timestamps, Base):
    __tablename__ = "kids_stories"

    slug: Mapped[str] = mapped_column(String(80), nullable=False)
    language: Mapped[str] = mapped_column(String(10), nullable=False)
    title: Mapped[str] = mapped_column(String(200), nullable=False)
    summary: Mapped[str] = mapped_column(Text, nullable=False, default="")
    # Passagem de origem (para o responsável conferir): rótulo e chaves dos versículos
    reference: Mapped[str] = mapped_column(String(100), nullable=False)
    translation_code: Mapped[str] = mapped_column(String(20), nullable=False)
    verse_key_start: Mapped[int] = mapped_column(Integer, nullable=False)
    verse_key_end: Mapped[int] = mapped_column(Integer, nullable=False)
    level: Mapped[str] = mapped_column(String(10), nullable=False, default="both")  # small | big | both
    status: Mapped[str] = mapped_column(
        String(10), nullable=False, default="draft", index=True
    )  # draft | review | published
    lesson: Mapped[str] = mapped_column(Text, nullable=False, default="")
    family_question: Mapped[str] = mapped_column(Text, nullable=False, default="")
    position: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    # Perguntas do quiz: [{question, options[3-4], answer (índice), explanation}]
    quiz: Mapped[list] = mapped_column(
        JSONB, nullable=False, default=list, server_default=text("'[]'::jsonb")
    )
    # Modelo, pedido feito à IA e personagens sugeridos (para as ilustrações da Etapa 2)
    ai_meta: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)
    created_by: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))
    published_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    __table_args__ = (UniqueConstraint("language", "slug"),)


class KidsStoryPage(UUIDPk, Base):
    __tablename__ = "kids_story_pages"

    story_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("kids_stories.id", ondelete="CASCADE"), nullable=False, index=True
    )
    position: Mapped[int] = mapped_column(Integer, nullable=False)
    text: Mapped[str] = mapped_column(Text, nullable=False)
    # Descrição da ilustração da página (as imagens chegam na Etapa 2)
    image_prompt: Mapped[str] = mapped_column(Text, nullable=False, default="")

    __table_args__ = (UniqueConstraint("story_id", "position"),)


class KidsVerse(UUIDPk, Timestamps, Base):
    """Versículo para decorar: o texto vem da Bíblia cadastrada (nunca da IA)."""

    __tablename__ = "kids_verses"

    language: Mapped[str] = mapped_column(String(10), nullable=False)
    reference: Mapped[str] = mapped_column(String(100), nullable=False)
    translation_code: Mapped[str] = mapped_column(String(20), nullable=False)
    verse_key_start: Mapped[int] = mapped_column(Integer, nullable=False)
    verse_key_end: Mapped[int] = mapped_column(Integer, nullable=False)
    text: Mapped[str] = mapped_column(Text, nullable=False)
    level: Mapped[str] = mapped_column(String(10), nullable=False, default="both")
    status: Mapped[str] = mapped_column(String(10), nullable=False, default="draft", index=True)
    position: Mapped[int] = mapped_column(Integer, nullable=False, default=0)

    __table_args__ = (UniqueConstraint("language", "verse_key_start", "verse_key_end"),)


class KidsStoryTranslation(UUIDPk, Timestamps, Base):
    """História traduzida pela IA a partir do português; feita uma vez e servida a todos.
    Apagada quando o administrador corrige a história (é refeita a partir do texto novo)."""

    __tablename__ = "kids_story_translations"

    story_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("kids_stories.id", ondelete="CASCADE"), nullable=False
    )
    language: Mapped[str] = mapped_column(String(10), nullable=False, index=True)
    title: Mapped[str] = mapped_column(String(200), nullable=False)
    summary: Mapped[str] = mapped_column(Text, nullable=False, default="")
    pages: Mapped[list] = mapped_column(JSONB, nullable=False, default=list)
    lesson: Mapped[str] = mapped_column(Text, nullable=False, default="")
    family_question: Mapped[str] = mapped_column(Text, nullable=False, default="")
    quiz: Mapped[list] = mapped_column(JSONB, nullable=False, default=list)
    model: Mapped[str] = mapped_column(String(80), nullable=False)

    __table_args__ = (UniqueConstraint("story_id", "language"),)


class KidsVideo(UUIDPk, Timestamps, Base):
    """Vídeo enviado pelo administrador. O arquivo fica em pedaços (`kids_video_chunks`) para
    caber no limite de tamanho de cada envio e para tocar aos poucos (o iPhone pede por partes)."""

    __tablename__ = "kids_videos"

    title: Mapped[str] = mapped_column(String(200), nullable=False)
    description: Mapped[str] = mapped_column(Text, nullable=False, default="")
    language: Mapped[str] = mapped_column(String(10), nullable=False, default="pt-BR")
    level: Mapped[str] = mapped_column(String(10), nullable=False, default="both")
    # uploading (chegando) | draft | review | published
    status: Mapped[str] = mapped_column(String(10), nullable=False, default="uploading", index=True)
    mime: Mapped[str] = mapped_column(String(40), nullable=False)
    size: Mapped[int] = mapped_column(BigInteger, nullable=False)
    chunk_size: Mapped[int] = mapped_column(Integer, nullable=False)
    poster_mime: Mapped[str | None] = mapped_column(String(40))
    poster: Mapped[bytes | None] = mapped_column(LargeBinary, deferred=True)
    position: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    created_by: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))
    published_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class KidsVideoChunk(Base):
    __tablename__ = "kids_video_chunks"

    video_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("kids_videos.id", ondelete="CASCADE"), primary_key=True
    )
    n: Mapped[int] = mapped_column(Integer, primary_key=True)
    data: Mapped[bytes] = mapped_column(LargeBinary, nullable=False)
