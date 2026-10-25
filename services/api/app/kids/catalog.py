"""BibleAlpha Kids: conteúdo inicial que vem com o sistema.

- Versículos sugeridos para decorar (só a referência: o texto sai da Bíblia cadastrada).
- Histórias prontas (escritas pela IA e guardadas em `starter_stories.json`), que o administrador
  importa como rascunho, revisa e publica.
"""

import json
from functools import cache
from pathlib import Path

from app.bible.books import by_code, verse_key

# (livro, capítulo, versículo inicial, versículo final, nível). Curtos para os Pequenos.
VERSES: list[tuple[str, int, int, int, str]] = [
    ("1JN", 4, 8, 8, "small"),
    ("GEN", 1, 1, 1, "small"),
    ("PSA", 23, 1, 1, "small"),
    ("JHN", 3, 16, 16, "both"),
    ("PHP", 4, 13, 13, "small"),
    ("PSA", 119, 105, 105, "small"),
    ("PSA", 56, 3, 3, "small"),
    ("1PE", 5, 7, 7, "small"),
    ("PSA", 118, 24, 24, "small"),
    ("JHN", 14, 6, 6, "both"),
    ("EPH", 6, 1, 1, "small"),
    ("COL", 3, 20, 20, "both"),
    ("EPH", 4, 32, 32, "both"),
    ("1TH", 5, 17, 17, "small"),
    ("PSA", 136, 1, 1, "small"),
    ("ISA", 41, 10, 10, "big"),
    ("JOS", 1, 9, 9, "big"),
    ("PRO", 3, 5, 6, "big"),
    ("JHN", 15, 12, 12, "small"),
    ("PSA", 46, 1, 1, "small"),
    ("PRO", 17, 17, 17, "both"),
    ("MAT", 19, 14, 14, "both"),
    ("LUK", 2, 11, 11, "small"),
    ("ACT", 16, 31, 31, "both"),
    ("PSA", 34, 8, 8, "both"),
    ("2TI", 3, 16, 16, "big"),
    ("ROM", 8, 28, 28, "big"),
    ("MAT", 6, 33, 33, "big"),
    ("PSA", 139, 14, 14, "both"),
    ("JER", 29, 11, 11, "big"),
]


def verse_keys() -> list[tuple[int, int, str]]:
    out = []
    for book, chapter, v1, v2, level in VERSES:
        b = by_code()[book]
        out.append((verse_key(b.id, chapter, v1), verse_key(b.id, chapter, v2), level))
    return out


STARTER_FILE = Path(__file__).with_name("starter_stories.json")


@cache
def _starter() -> dict:
    if not STARTER_FILE.exists():
        return {}
    return json.loads(STARTER_FILE.read_text(encoding="utf-8"))


def starter_stories(language: str) -> list[dict]:
    """Histórias prontas do idioma: {seed, verse_key_start, verse_key_end, level, title, summary,
    pages[{text, image_prompt}], lesson, family_question, quiz, ai_meta}."""
    return list(_starter().get(language, []))
