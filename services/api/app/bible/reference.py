"""Interpretação de referências bíblicas em português, inglês e espanhol.

Exemplos aceitos: "Jo 3:16", "João 3:16–18", "Rm 12:1-2", "2 Reis 13:20–21", "1Rs 2:3,5",
"Gn 1", "Sl 23; Mt 5:3-12", "Jo 3:16, Rm 5:8", "John 1:1-2:3", "Jó 1:1".

As mesmas regras estão no app (src/bible/reference.ts) e os dois são testados com
tests/fixtures/references.json.
"""

import re
import unicodedata
from dataclasses import dataclass
from functools import cache

from app.bible.books import Book, all_books, by_code


@dataclass(frozen=True)
class Reference:
    book: str  # código USFM
    chapter: int
    verse_start: int | None = None
    chapter_end: int | None = None
    verse_end: int | None = None

    def as_dict(self) -> dict:
        return {
            "book": self.book,
            "chapter": self.chapter,
            "verse_start": self.verse_start,
            "chapter_end": self.chapter_end if self.chapter_end is not None else self.chapter,
            "verse_end": self.verse_end if self.verse_end is not None else self.verse_start,
        }


def _strip_accents(text: str) -> str:
    return "".join(c for c in unicodedata.normalize("NFD", text) if unicodedata.category(c) != "Mn")


_ORDINALS = {
    "iii": "3",
    "ii": "2",
    "i": "1",
    "primeiro": "1",
    "primeira": "1",
    "segundo": "2",
    "segunda": "2",
    "terceiro": "3",
    "terceira": "3",
    "first": "1",
    "second": "2",
    "third": "3",
    "primero": "1",
    "primer": "1",
    "primera": "1",
    "tercero": "3",
    "tercera": "3",
}


_ORDINAL_RE = re.compile(
    r"^(iii|ii|i|primeir[oa]|primer[oa]?|segund[oa]|terceir[oa]|tercer[oa]|first|second|third)\s+(?:de\s+)?(.+)$"
)


def _norm_book(text: str, keep_accents: bool) -> str:
    t = text.lower().replace(".", " ").strip()
    if not keep_accents:
        t = _strip_accents(t)
    t = re.sub(r"\s+", " ", t)
    m = _ORDINAL_RE.match(t)
    if m:
        t = f"{_ORDINALS[m.group(1)]}{m.group(2)}"
    # "1 reis" e "1reis" são equivalentes
    return re.sub(r"^([123])\s+", r"\1", t)


@cache
def _alias_tables(locale: str) -> tuple[dict[str, str], dict[str, str]]:
    """(com acento, sem acento). O idioma preferido vem por último e sobrescreve o outro
    em abreviações ambíguas (ex.: "Jn" é Jonas em português e John em inglês)."""
    lang = locale.lower()[:2]
    preferred = lang if lang in ("pt", "es") else "en"
    order = tuple(x for x in ("es", "pt", "en") if x != preferred) + (preferred,)
    exact: dict[str, str] = {}
    loose: dict[str, str] = {}
    books: tuple[Book, ...] = all_books()
    for code in order:
        for b in books:
            names = b.names(code)
            for alias in (names.name, names.abbr, b.code, *names.aliases):
                exact[_norm_book(alias, keep_accents=True)] = b.code
                loose[_norm_book(alias, keep_accents=False)] = b.code
    # Convenção brasileira: "Jo" é João e "Jó" é Jó
    exact["jó"] = "JOB"
    loose["jo"] = "JHN" if locale.lower().startswith("pt") else loose.get("jo", "JHN")
    return exact, loose


def resolve_book(name: str, locale: str = "pt-BR") -> str | None:
    exact, loose = _alias_tables(locale)
    return exact.get(_norm_book(name, keep_accents=True)) or loose.get(_norm_book(name, keep_accents=False))


_DASH = r"[-‐‑‒–—]"
_REF_RE = re.compile(
    r"""^\s*
    (?P<book>(?:[123]|i{1,3})?\s*\.?\s*[^\W\d_][^\d:;,]*?)   # nome do livro (pode começar com 1/2/3)
    \s*\.?\s*
    (?P<spec>\d.*)?$""",
    re.VERBOSE | re.IGNORECASE,
)
_SPEC_RE = re.compile(
    rf"""^(?P<c1>\d+)
    (?:\s*[:.]\s*(?P<v1>\d+))?
    (?:\s*{_DASH}\s*(?:(?P<c2>\d+)\s*[:.]\s*)?(?P<v2>\d+))?$""",
    re.VERBOSE,
)


class ReferenceError(ValueError):
    pass


def _parse_spec(book: Book, spec: str) -> list[Reference]:
    """Capítulo/versículos de um livro, incluindo listas separadas por vírgula."""
    refs: list[Reference] = []
    current_chapter: int | None = None
    for raw in (p.strip() for p in spec.split(",")):
        if not raw:
            continue
        m = _SPEC_RE.match(raw)
        # Depois de "3:16", um número solto é versículo do mesmo capítulo ("Rm 12:1,2")
        if current_chapter is not None and (bare := re.match(rf"^(\d+)(?:\s*{_DASH}\s*(\d+))?$", raw)):
            v1, v2 = int(bare.group(1)), int(bare.group(2) or bare.group(1))
            refs.append(Reference(book.code, current_chapter, v1, None, v2 if v2 != v1 else None))
            continue
        if not m:
            raise ReferenceError(f"invalid reference: {raw}")
        c1 = int(m.group("c1"))
        v1 = int(m.group("v1")) if m.group("v1") else None
        c2 = int(m.group("c2")) if m.group("c2") else None
        v2 = int(m.group("v2")) if m.group("v2") else None
        if v1 is None and v2 is not None:
            # "Gn 1-3" = capítulos 1 a 3
            c2, v2 = v2, None
        refs.append(Reference(book.code, c1, v1, c2 if c2 != c1 else None, v2 if v2 != v1 or c2 else None))
        current_chapter = c1 if v1 is not None and c2 is None else None
    for r in refs:
        end_chapter = r.chapter_end or r.chapter
        if not (1 <= r.chapter <= book.chapters and r.chapter <= end_chapter <= book.chapters):
            raise ReferenceError(f"chapter out of range: {book.code} {r.chapter}")
        if r.verse_start is not None and r.verse_start < 1:
            raise ReferenceError("verse out of range")
        if r.verse_end is not None and end_chapter == r.chapter and r.verse_end < (r.verse_start or 1):
            raise ReferenceError("verse range is reversed")
    return refs


def parse(text: str, locale: str = "pt-BR") -> list[Reference]:
    """Interpreta uma ou várias referências. Lança ReferenceError se algo não for reconhecido."""
    refs: list[Reference] = []
    last_book: Book | None = None
    # ";" sempre separa referências; "," separa quando o trecho seguinte começa com um livro
    for segment in (s.strip() for s in text.split(";")):
        if not segment:
            continue
        parts = re.split(r",\s*(?=(?:[123]\s*)?[^\W\d_])", segment)
        for part in parts:
            m = _REF_RE.match(part)
            if m and m.group("book").strip():
                code = resolve_book(m.group("book"), locale)
                if code is None:
                    raise ReferenceError(f"unknown book: {m.group('book').strip()}")
                last_book = by_code()[code]
                spec = (m.group("spec") or "").strip()
                if not spec:
                    raise ReferenceError("missing chapter")
                refs.extend(_parse_spec(last_book, spec))
            elif last_book is not None and re.match(r"^\s*\d", part):
                # "Jo 3:16; 4:1" — continua no mesmo livro
                refs.extend(_parse_spec(last_book, part.strip()))
            else:
                raise ReferenceError(f"invalid reference: {part}")
    if not refs:
        raise ReferenceError("empty reference")
    return refs


def format_reference(ref: Reference, locale: str = "pt-BR", abbreviated: bool = False) -> str:
    book = by_code()[ref.book]
    names = book.names(locale)
    label = names.abbr if abbreviated else names.name
    out = f"{label} {ref.chapter}"
    if ref.verse_start is not None:
        out += f":{ref.verse_start}"
    if ref.chapter_end and ref.chapter_end != ref.chapter:
        out += f"–{ref.chapter_end}" + (f":{ref.verse_end}" if ref.verse_end is not None else "")
    elif ref.verse_end and ref.verse_end != ref.verse_start:
        out += f"–{ref.verse_end}"
    return out


# Candidatos a referência dentro de um texto livre: "João 3:16", "1 Co 13:4-7", "Rm 8.28", "Salmos 23"
_FIND_RE = re.compile(
    rf"(?<![\w])((?:[123]\s?)?[^\W\d_]{{2,}}\.?(?:\s(?:dos|de|of|de\slos)\s[^\W\d_]+)?\s+\d{{1,3}}(?:[:.]\d{{1,3}}(?:\s*{_DASH}\s*\d{{1,3}}(?:[:.]\d{{1,3}})?)?)?)",
    re.UNICODE,
)


def find_references(
    text: str, locale: str = "pt-BR", include_invalid: bool = False
) -> list[tuple[str, Reference | None]]:
    """Referências citadas num texto (ex.: resposta da IA). Ignora o que não começa com nome de livro.

    Com include_invalid=True, devolve também (texto, None) quando o livro existe mas o capítulo
    não ("João 30:1"), para que a resposta seja sinalizada."""
    found: list[tuple[str, Reference | None]] = []
    for m in _FIND_RE.finditer(text):
        candidate = m.group(1).strip()
        try:
            refs = parse(candidate, locale)
        except ReferenceError:
            book = _REF_RE.match(candidate)
            if include_invalid and book and resolve_book(book.group("book"), locale):
                found.append((candidate, None))
            continue
        found.extend((candidate, r) for r in refs)
    return found
