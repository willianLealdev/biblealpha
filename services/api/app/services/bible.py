"""Leitura e busca no texto bíblico (somente leitura)."""

import json

from sqlalchemy import cast, func, literal, select
from sqlalchemy.dialects.postgresql import REGCONFIG
from sqlalchemy.ext.asyncio import AsyncSession

from app.bible import reference as ref_parser
from app.bible.books import Book, all_books, by_code, by_id, split_key, verse_key
from app.core.errors import AppError
from app.models import BibleTranslation, BibleVerse


async def get_translation(db: AsyncSession, code: str) -> BibleTranslation:
    t = await db.scalar(
        select(BibleTranslation).where(BibleTranslation.code == code, BibleTranslation.is_active.is_(True))
    )
    if t is None:
        raise AppError(404, "translation_not_found", "Translation not found")
    return t


DEFAULTS_KEY = "bible.defaults"
# Tradução inicial por idioma do app (o admin troca no painel)
BUILTIN_DEFAULTS = {"pt": "blivre", "en": "web", "es": "rv1909"}


def lang2(language: str) -> str:
    return language.lower().split("-")[0]


async def default_codes(db: AsyncSession, translations: list[BibleTranslation]) -> set[str]:
    """Uma tradução padrão por idioma: a escolhida no painel, senão a primeira daquele idioma."""
    from app.services.settings import get_setting

    chosen = {**BUILTIN_DEFAULTS, **(await get_setting(db, DEFAULTS_KEY))}
    codes = {t.code for t in translations}
    out: set[str] = set()
    for lang in {lang2(t.language) for t in translations}:
        pick = chosen.get(lang)
        if pick not in codes or lang2(next(t for t in translations if t.code == pick).language) != lang:
            # Sem escolha no painel: de domínio público, a mais completa do idioma
            same = [t for t in translations if lang2(t.language) == lang]
            pick = max(same, key=lambda t: (t.license == "Public Domain", t.verse_count)).code
        out.add(pick)
    return out


async def list_translations(db: AsyncSession) -> list[BibleTranslation]:
    rows = await db.scalars(
        select(BibleTranslation)
        .where(BibleTranslation.is_active.is_(True))
        .order_by(BibleTranslation.language, BibleTranslation.name)
    )
    return list(rows)


def resolve_book_param(value: str) -> Book:
    book = by_code().get(value.upper())
    if book is None and value.isdigit():
        book = by_id().get(int(value))
    if book is None:
        raise AppError(404, "book_not_found", "Book not found")
    return book


def neighbors(book: Book, chapter: int, available: set[int] | None = None) -> tuple[dict | None, dict | None]:
    """Capítulo anterior e seguinte. Numa tradução incompleta, pula os livros que ela não tem."""
    books = all_books()
    ok = (lambda b: b.id in available) if available else (lambda b: True)
    if chapter > 1:
        prev = {"book": book.code, "chapter": chapter - 1}
    else:
        p = next((b for b in reversed(books[: book.id - 1]) if ok(b)), None)
        prev = {"book": p.code, "chapter": p.chapters} if p else None
    if chapter < book.chapters:
        nxt = {"book": book.code, "chapter": chapter + 1}
    else:
        n = next((b for b in books[book.id :] if ok(b)), None)
        nxt = {"book": n.code, "chapter": 1} if n else None
    return prev, nxt


async def get_chapter(db: AsyncSession, translation: BibleTranslation, book: Book, chapter: int) -> dict:
    if not 1 <= chapter <= book.chapters:
        raise AppError(404, "chapter_not_found", "Chapter not found")
    rows = await db.execute(
        select(BibleVerse.verse, BibleVerse.text)
        .where(
            BibleVerse.translation_id == translation.id,
            BibleVerse.book_id == book.id,
            BibleVerse.chapter == chapter,
        )
        .order_by(BibleVerse.verse)
    )
    rows = rows.all()
    if not rows and (translation.notes or {}).get("books") and book.id not in translation.notes["books"]:
        raise AppError(404, "book_not_in_translation", "This book is not in this translation")
    available = set((translation.notes or {}).get("books") or []) or None
    prev, nxt = neighbors(book, chapter, available)
    return {
        "translation": translation.code,
        "book": book.code,
        "chapter": chapter,
        "verses": [{"verse": v, "text": t} for v, t in rows],
        "prev": prev,
        "next": nxt,
    }


async def get_passage(db: AsyncSession, translation: BibleTranslation, query: str) -> list[dict]:
    """Texto de uma ou várias referências (ex.: "Jo 3:16-18; Rm 5:8")."""
    try:
        refs = ref_parser.parse(query, translation.language)
    except ref_parser.ReferenceError as e:
        raise AppError(422, "invalid_reference", str(e)) from None
    out = []
    for r in refs:
        book = by_code()[r.book]
        start = verse_key(book.id, r.chapter, r.verse_start or 1)
        end = verse_key(book.id, r.chapter_end or r.chapter, r.verse_end or r.verse_start or 999)
        if r.verse_start is None:
            end = verse_key(book.id, r.chapter_end or r.chapter, 999)
        rows = await db.execute(
            select(BibleVerse.chapter, BibleVerse.verse, BibleVerse.text)
            .where(
                BibleVerse.translation_id == translation.id,
                BibleVerse.verse_key.between(start, end),
            )
            .order_by(BibleVerse.verse_key)
        )
        verses = [{"chapter": c, "verse": v, "text": t} for c, v, t in rows]
        if not verses:
            raise AppError(404, "verse_not_found", f"No verses for {query}")
        out.append(
            {
                "reference": r.as_dict(),
                "label": ref_parser.format_reference(r, translation.language),
                "translation": translation.abbreviation,
                "verses": verses,
            }
        )
    return out


async def search(
    db: AsyncSession,
    translation: BibleTranslation,
    q: str,
    testament: str | None,
    book: Book | None,
    limit: int,
    offset: int,
) -> dict:
    q = q.strip()
    # Uma referência digitada na busca leva direto ao trecho
    try:
        refs = ref_parser.parse(q, translation.language)
        return {"type": "reference", "references": [r.as_dict() for r in refs], "total": 0, "results": []}
    except ref_parser.ReferenceError:
        pass

    config = cast(literal(translation.search_config), REGCONFIG)
    tsquery = func.websearch_to_tsquery(config, func.f_unaccent(q))
    filters = [BibleVerse.translation_id == translation.id, BibleVerse.search_vector.op("@@")(tsquery)]
    if book is not None:
        filters.append(BibleVerse.book_id == book.id)
    elif testament in ("OT", "NT"):
        filters.append(BibleVerse.book_id <= 39 if testament == "OT" else BibleVerse.book_id >= 40)

    total = await db.scalar(select(func.count()).select_from(BibleVerse).where(*filters))
    rows = await db.execute(
        select(BibleVerse.verse_key, BibleVerse.text)
        .where(*filters)
        .order_by(BibleVerse.verse_key)
        .limit(limit)
        .offset(offset)
    )
    results = []
    for key, body in rows:
        b, c, v = split_key(key)
        results.append({"book": by_id()[b].code, "chapter": c, "verse": v, "verse_key": key, "text": body})
    return {"type": "text", "total": total or 0, "results": results}


# O texto é imutável por edição: o JSON completo fica em memória, chaveado pelo hash da origem
_download_cache: dict[tuple[str, str], bytes] = {}


async def download(db: AsyncSession, translation: BibleTranslation) -> bytes:
    """Tradução inteira para leitura offline: {"books": {"GEN": [[cap, vers, texto], ...]}}."""
    key = (translation.code, translation.source_sha256)
    if key in _download_cache:
        return _download_cache[key]
    rows = await db.execute(
        select(BibleVerse.book_id, BibleVerse.chapter, BibleVerse.verse, BibleVerse.text)
        .where(BibleVerse.translation_id == translation.id)
        .order_by(BibleVerse.verse_key)
    )
    books: dict[str, list] = {}
    for b, c, v, t in rows:
        books.setdefault(by_id()[b].code, []).append([c, v, t])
    payload = json.dumps(
        {"translation": translation.code, "sha256": translation.source_sha256, "books": books},
        ensure_ascii=False,
        separators=(",", ":"),
    ).encode()
    _download_cache[key] = payload
    return payload


class LanguageBibles:
    """Índice "idioma do app → Bíblia padrão", montado uma vez (são mais de mil traduções)."""

    def __init__(self, items: list[BibleTranslation], defaults: set[str]) -> None:
        self.items, self.defaults = items, defaults
        self.by_lang: dict[str, list[BibleTranslation]] = {}
        for t in items:
            self.by_lang.setdefault(t.language, []).append(t)
            self.by_lang.setdefault(lang2(t.language), []).append(t)

    def pick(self, code: str) -> str | None:
        from app.bible.ebible import language_of
        from app.core.world_data import ISO3

        iso3 = ISO3.get(code)
        wanted = [lang2(code)] + ([iso3, lang2(language_of(iso3)[0])] if iso3 else [])
        candidates = list({t.code: t for w in wanted for t in self.by_lang.get(w, [])}.values())
        if not candidates:
            return None
        chosen = next((t for t in candidates if t.code in self.defaults), None)
        return (chosen or max(candidates, key=lambda t: (t.license == "Public Domain", t.verse_count))).code


async def language_bibles(db: AsyncSession) -> LanguageBibles:
    items = await list_translations(db)
    return LanguageBibles(items, await default_codes(db, items))


async def translation_for_language(db: AsyncSession, code: str) -> str | None:
    """Bíblia padrão de um idioma do app (ex.: "de" → Bíblia alemã), ou None se não houver.
    As Bíblias do eBible.org guardam o idioma em ISO 639-3 quando não há código de 2 letras."""
    return (await language_bibles(db)).pick(code)
