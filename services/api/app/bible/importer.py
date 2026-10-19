"""Importação de traduções bíblicas a partir de data/bible/<código>/.

    python -m app.bible.importer blivre web            # importa (ou confirma que já está importada)
    python -m app.bible.importer blivre --replace      # substitui o texto se o arquivo de origem mudou

Cada pasta tem manifest.json (origem, edição, licença, hash) e o arquivo de versículo por linha
(formato VPL do eBible.org). A importação só acontece se o hash e as contagens baterem.
"""

import asyncio
import gzip
import hashlib
import json
import re
import sys
from collections import Counter
from dataclasses import dataclass
from pathlib import Path

from sqlalchemy import delete, insert, select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.bible.books import all_books, verse_key
from app.db.session import dispose_engine, get_sessionmaker
from app.models import BibleTranslation, BibleVerse

DATA_DIR = Path(__file__).resolve().parents[2] / "data" / "bible"
_LINE = re.compile(r"^(?P<code>[1-3A-Z]{3}) (?P<chapter>\d+):(?P<verse>\d+) ?(?P<text>.*)$")


class ImportError_(Exception):
    pass


@dataclass
class ParsedVerse:
    book_id: int
    chapter: int
    verse: int
    text: str


def load_manifest(code: str) -> dict:
    path = DATA_DIR / code / "manifest.json"
    if not path.exists():
        raise ImportError_(f"tradução desconhecida: {code}")
    return json.loads(path.read_text(encoding="utf-8"))


def read_source(manifest: dict) -> tuple[list[ParsedVerse], int]:
    """Lê e valida o arquivo. Devolve os versículos com texto e quantos vieram vazios."""
    raw = gzip.decompress((DATA_DIR / manifest["code"] / manifest["file"]).read_bytes())
    digest = hashlib.sha256(raw).hexdigest()
    if digest != manifest["file_sha256"]:
        raise ImportError_(f"hash diferente do manifesto ({digest}); o arquivo de origem foi alterado")

    lines = raw.decode("utf-8-sig").splitlines()
    if len(lines) != manifest["expected_verses"]:
        raise ImportError_(f"esperava {manifest['expected_verses']} linhas, encontrou {len(lines)}")

    books = all_books()
    # O VPL usa abreviações próprias (JOH, MAR, SOL...); a ordem dos livros é a canônica
    source_codes: list[str] = []
    for line in lines:
        code = line[:3]
        if not source_codes or source_codes[-1] != code:
            source_codes.append(code)
    if len(source_codes) != len(books) or len(set(source_codes)) != len(books):
        raise ImportError_(f"esperava 66 livros na ordem canônica, encontrou {len(source_codes)}")
    book_of = {code: books[i].id for i, code in enumerate(source_codes)}

    verses: list[ParsedVerse] = []
    empty = 0
    for n, line in enumerate(lines, 1):
        m = _LINE.match(line)
        if not m:
            raise ImportError_(f"linha {n} fora do formato: {line[:60]!r}")
        body = m.group("text").strip()
        if not body:
            empty += 1
            continue
        verses.append(
            ParsedVerse(book_of[m.group("code")], int(m.group("chapter")), int(m.group("verse")), body)
        )

    chapters = Counter()
    for v in verses:
        chapters[v.book_id] = max(chapters[v.book_id], v.chapter)
    for b in books:
        if chapters[b.id] != b.chapters:
            raise ImportError_(f"{b.code}: esperava {b.chapters} capítulos, encontrou {chapters[b.id]}")
    keys = [verse_key(v.book_id, v.chapter, v.verse) for v in verses]
    if len(set(keys)) != len(keys):
        raise ImportError_("versículos duplicados no arquivo")
    return verses, empty


async def import_translation(db: AsyncSession, code: str, replace: bool = False) -> str:
    manifest = load_manifest(code)
    existing = await db.scalar(select(BibleTranslation).where(BibleTranslation.code == code))
    if existing and existing.source_sha256 == manifest["file_sha256"]:
        # Metadados novos do manifesto (ex.: id no eBible.org) entram sem reimportar o texto
        notes = {**(existing.notes or {}), **manifest.get("notes", {})}
        if notes != existing.notes:
            existing.notes = notes
            await db.commit()
        return f"{code}: já importada ({existing.verse_count} versículos)"
    if existing and not replace:
        raise ImportError_(f"{code} já existe com outro arquivo de origem; use --replace para substituir")

    verses, empty = read_source(manifest)
    fields = {
        "name": manifest["name"],
        "abbreviation": manifest["abbreviation"],
        "language": manifest["language"],
        "search_config": manifest["search_config"],
        "description": manifest["description"],
        "edition": manifest["edition"],
        "year": manifest.get("year"),
        "license": manifest["license"],
        "license_url": manifest.get("license_url"),
        "attribution": manifest["attribution"],
        "source_url": manifest["source_url"],
        "source_sha256": manifest["file_sha256"],
        "versification": manifest["versification"],
        "notes": {**manifest.get("notes", {}), "empty_verses_skipped": empty},
        "verse_count": len(verses),
    }
    await store_translation(db, code, fields, verses, existing)
    return f"{code}: {len(verses)} versículos importados ({empty} vazios no original)"


async def store_translation(
    db: AsyncSession,
    code: str,
    fields: dict,
    verses: list[ParsedVerse],
    existing: BibleTranslation | None = None,
) -> BibleTranslation:
    """Grava (ou substitui) o texto de uma tradução e monta o índice de busca."""
    if existing:
        for k, v in fields.items():
            setattr(existing, k, v)
        await db.execute(delete(BibleVerse).where(BibleVerse.translation_id == existing.id))
        translation = existing
    else:
        translation = BibleTranslation(code=code, **fields)
        db.add(translation)
    await db.flush()

    rows = [
        {
            "translation_id": translation.id,
            "book_id": v.book_id,
            "chapter": v.chapter,
            "verse": v.verse,
            "verse_key": verse_key(v.book_id, v.chapter, v.verse),
            "text": v.text,
        }
        for v in verses
    ]
    for i in range(0, len(rows), 5000):
        await db.execute(insert(BibleVerse), rows[i : i + 5000])
    await db.execute(
        text(
            "UPDATE bible_verses SET search_vector = to_tsvector(CAST(:cfg AS regconfig), f_unaccent(text)) "
            "WHERE translation_id = :tid"
        ),
        {"cfg": fields["search_config"], "tid": translation.id},
    )
    await db.commit()
    return translation


async def _main(codes: list[str], replace: bool) -> None:
    try:
        async with get_sessionmaker()() as db:
            for code in codes:
                print(await import_translation(db, code, replace=replace))
    finally:
        await dispose_engine()


def main() -> None:
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    if not args:
        sys.exit(__doc__)
    try:
        asyncio.run(_main(args, replace="--replace" in sys.argv))
    except ImportError_ as e:
        sys.exit(f"Importação recusada: {e}")


if __name__ == "__main__":
    main()
