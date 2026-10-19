"""Cânon protestante de 66 livros (códigos USFM) e nomes em português, inglês e espanhol.

A mesma lista existe no app (apps/app/src/bible/books.ts), gerada a partir de data/books.json.
"""

import json
from dataclasses import dataclass
from functools import cache
from pathlib import Path

_DATA = Path(__file__).parent / "data" / "books.json"


@dataclass(frozen=True)
class BookNames:
    name: str
    abbr: str
    aliases: tuple[str, ...]


@dataclass(frozen=True)
class Book:
    id: int  # 1..66, ordem canônica
    code: str  # USFM: GEN, EXO, ... REV
    testament: str  # OT | NT
    chapters: int
    pt: BookNames
    en: BookNames
    es: BookNames

    def names(self, locale: str) -> BookNames:
        lang = locale.lower()[:2]
        return self.pt if lang == "pt" else self.es if lang == "es" else self.en


@cache
def all_books() -> tuple[Book, ...]:
    raw = json.loads(_DATA.read_text(encoding="utf-8"))
    return tuple(
        Book(
            id=b["id"],
            code=b["code"],
            testament=b["testament"],
            chapters=b["chapters"],
            pt=BookNames(b["pt"]["name"], b["pt"]["abbr"], tuple(b["pt"]["aliases"])),
            en=BookNames(b["en"]["name"], b["en"]["abbr"], tuple(b["en"]["aliases"])),
            es=BookNames(b["es"]["name"], b["es"]["abbr"], tuple(b["es"]["aliases"])),
        )
        for b in raw
    )


@cache
def by_code() -> dict[str, Book]:
    return {b.code: b for b in all_books()}


@cache
def by_id() -> dict[int, Book]:
    return {b.id: b for b in all_books()}


def verse_key(book_id: int, chapter: int, verse: int) -> int:
    """Identificador canônico BBCCCVVV (ex.: João 3:16 = 43003016)."""
    return book_id * 1_000_000 + chapter * 1_000 + verse


def split_key(key: int) -> tuple[int, int, int]:
    return key // 1_000_000, (key // 1_000) % 1_000, key % 1_000
