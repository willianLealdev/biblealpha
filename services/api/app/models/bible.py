"""Corpus bíblico: somente leitura para usuários. Cada tradução registra origem, edição e licença."""

import uuid
from datetime import datetime

from sqlalchemy import (
    BigInteger,
    Boolean,
    DateTime,
    Float,
    ForeignKey,
    Index,
    Integer,
    LargeBinary,
    SmallInteger,
    String,
    Text,
    func,
)
from sqlalchemy.dialects.postgresql import JSONB, TSVECTOR
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, UUIDPk


class BibleTranslation(UUIDPk, Base):
    __tablename__ = "bible_translations"

    # Código curto usado nas URLs e no app (ex.: blivre, web)
    code: Mapped[str] = mapped_column(String(20), unique=True, nullable=False)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    abbreviation: Mapped[str] = mapped_column(String(20), nullable=False)
    language: Mapped[str] = mapped_column(String(10), nullable=False)  # pt-BR | en
    # Configuração de busca textual do PostgreSQL (portuguese | english)
    search_config: Mapped[str] = mapped_column(String(20), nullable=False)
    description: Mapped[str] = mapped_column(Text, nullable=False)
    edition: Mapped[str] = mapped_column(String(200), nullable=False)
    year: Mapped[int | None] = mapped_column(SmallInteger)
    license: Mapped[str] = mapped_column(String(100), nullable=False)
    license_url: Mapped[str | None] = mapped_column(String(300))
    # Texto de crédito exibido no app, exigido por licenças CC BY
    attribution: Mapped[str] = mapped_column(Text, nullable=False)
    source_url: Mapped[str] = mapped_column(String(300), nullable=False)
    source_sha256: Mapped[str] = mapped_column(String(64), nullable=False)
    versification: Mapped[str] = mapped_column(String(20), nullable=False, default="kjv")
    # Diferenças conhecidas de numeração em relação ao padrão (registradas na importação)
    notes: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)
    verse_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    imported_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class BibleVerse(Base):
    __tablename__ = "bible_verses"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    translation_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("bible_translations.id", ondelete="CASCADE"), nullable=False
    )
    book_id: Mapped[int] = mapped_column(SmallInteger, nullable=False)
    chapter: Mapped[int] = mapped_column(SmallInteger, nullable=False)
    verse: Mapped[int] = mapped_column(SmallInteger, nullable=False)
    # BBCCCVVV: liga o mesmo versículo entre traduções e os dados do usuário
    verse_key: Mapped[int] = mapped_column(Integer, nullable=False)
    text: Mapped[str] = mapped_column(Text, nullable=False)
    # Preenchido na importação com to_tsvector(config, f_unaccent(text))
    search_vector: Mapped[str | None] = mapped_column(TSVECTOR)

    __table_args__ = (
        Index("uq_bible_verses_translation_key", "translation_id", "verse_key", unique=True),
        Index("ix_bible_verses_chapter", "translation_id", "book_id", "chapter"),
        Index("ix_bible_verses_search", "search_vector", postgresql_using="gin"),
    )


class OriginalWord(Base):
    """Palavra do texto original (hebraico/aramaico do AT, grego do NT), na ordem do verso.
    Fonte: STEPBible.org (TAHOT/TAGNT, Tyndale House, CC BY 4.0)."""

    __tablename__ = "original_words"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    # Numeração das traduções (KJV): o mesmo verse_key do texto bíblico
    verse_key: Mapped[int] = mapped_column(Integer, nullable=False)
    position: Mapped[int] = mapped_column(SmallInteger, nullable=False)
    text: Mapped[str] = mapped_column(String(120), nullable=False)
    translit: Mapped[str] = mapped_column(String(160), nullable=False, default="")
    gloss_en: Mapped[str] = mapped_column(String(200), nullable=False, default="")
    gloss_es: Mapped[str | None] = mapped_column(String(200))
    # Strong estendido do STEPBible (ex.: H7225G, G3056)
    strong: Mapped[str | None] = mapped_column(String(12))
    morph: Mapped[str] = mapped_column(String(40), nullable=False, default="")

    __table_args__ = (Index("ix_original_words_verse", "verse_key", "position"),)


class LexiconEntry(Base):
    """Léxico breve (Strong estendido) do STEPBible: TBESH (hebraico) e TBESG (grego), CC BY 4.0."""

    __tablename__ = "lexicon_entries"

    strong: Mapped[str] = mapped_column(String(12), primary_key=True)
    base: Mapped[str] = mapped_column(String(8), nullable=False, index=True)
    lemma: Mapped[str] = mapped_column(String(120), nullable=False)
    translit: Mapped[str] = mapped_column(String(120), nullable=False, default="")
    morph: Mapped[str] = mapped_column(String(40), nullable=False, default="")
    gloss: Mapped[str] = mapped_column(String(300), nullable=False, default="")
    definition: Mapped[str] = mapped_column(Text, nullable=False, default="")
    # Traduções da explicação para outros idiomas (feitas na primeira consulta): {"pt-BR": {...}}
    i18n: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)


class CrossReference(Base):
    """Referências cruzadas do OpenBible.info (CC BY), com os votos de relevância."""

    __tablename__ = "cross_references"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    from_key: Mapped[int] = mapped_column(Integer, nullable=False)
    to_start: Mapped[int] = mapped_column(Integer, nullable=False)
    to_end: Mapped[int] = mapped_column(Integer, nullable=False)
    votes: Mapped[int] = mapped_column(Integer, nullable=False, default=0)

    __table_args__ = (Index("ix_cross_references_from", "from_key", "votes"),)


class BiblePlace(Base):
    """Lugar bíblico com coordenadas: OpenBible.info Bible Geocoding Data (CC BY 4.0)."""

    __tablename__ = "bible_places"

    id: Mapped[str] = mapped_column(String(20), primary_key=True)
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    lon: Mapped[float] = mapped_column(Float, nullable=False)
    lat: Mapped[float] = mapped_column(Float, nullable=False)
    kind: Mapped[str] = mapped_column(String(40), nullable=False, default="")


class PlaceMention(Base):
    """Versículo em que o lugar é citado."""

    __tablename__ = "place_mentions"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    place_id: Mapped[str] = mapped_column(ForeignKey("bible_places.id", ondelete="CASCADE"), nullable=False)
    verse_key: Mapped[int] = mapped_column(Integer, nullable=False, index=True)


class VisualStudy(UUIDPk, Base):
    """Estudo visual de um capítulo, gerado uma vez por idioma e visto por todos."""

    __tablename__ = "visual_studies"

    book: Mapped[str] = mapped_column(String(3), nullable=False)
    chapter: Mapped[int] = mapped_column(SmallInteger, nullable=False)
    locale: Mapped[str] = mapped_column(String(10), nullable=False)
    content: Mapped[dict] = mapped_column(JSONB, nullable=False)
    model: Mapped[str] = mapped_column(String(80), nullable=False)
    created_by: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    __table_args__ = (Index("uq_visual_studies_chapter", "book", "chapter", "locale", unique=True),)


class VisualImage(UUIDPk, Base):
    """Ilustração gerada por IA para um capítulo (compartilhada entre os idiomas)."""

    __tablename__ = "visual_images"

    book: Mapped[str] = mapped_column(String(3), nullable=False)
    chapter: Mapped[int] = mapped_column(SmallInteger, nullable=False)
    position: Mapped[int] = mapped_column(SmallInteger, nullable=False, default=0)
    prompt: Mapped[str] = mapped_column(Text, nullable=False)
    mime: Mapped[str] = mapped_column(String(40), nullable=False)
    data: Mapped[bytes] = mapped_column(LargeBinary, nullable=False)
    model: Mapped[str] = mapped_column(String(80), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    __table_args__ = (Index("ix_visual_images_chapter", "book", "chapter"),)


class GlossTranslation(Base):
    """Significado de uma palavra do original (glosa em inglês do STEPBible) traduzido para um idioma
    do app. Traduzido uma vez (DeepSeek) e reaproveitado por todos."""

    __tablename__ = "gloss_translations"

    locale: Mapped[str] = mapped_column(String(10), primary_key=True)
    source: Mapped[str] = mapped_column(String(200), primary_key=True)
    text: Mapped[str] = mapped_column(String(300), nullable=False)
