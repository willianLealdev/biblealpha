"""Gera apps/app/src/bible/books.ts a partir de services/api/app/bible/data/books.json.

    py tools/sync_books.py          # gera
    py tools/sync_books.py --check  # falha se o arquivo do app estiver desatualizado (CI)
"""

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SRC = ROOT / "services/api/app/bible/data/books.json"
DEST = ROOT / "apps/app/src/bible/books.ts"


def render() -> str:
    books = json.loads(SRC.read_text(encoding="utf-8"))
    data = json.dumps(books, ensure_ascii=False, indent=2)
    return (
        "// Gerado por tools/sync_books.py a partir de services/api/app/bible/data/books.json. Não edite à mão.\n\n"
        "export type BookNames = { name: string; abbr: string; aliases: string[] };\n"
        "export type Book = {\n"
        "  id: number;\n"
        "  code: string;\n"
        "  testament: 'OT' | 'NT';\n"
        "  chapters: number;\n"
        "  pt: BookNames;\n"
        "  en: BookNames;\n"
        "  es: BookNames;\n"
        "};\n\n"
        f"export const BOOKS: Book[] = {data};\n"
    )


if __name__ == "__main__":
    content = render()
    if "--check" in sys.argv:
        current = DEST.read_text(encoding="utf-8") if DEST.exists() else ""
        sys.exit(0 if current == content else "books.ts desatualizado: rode py tools/sync_books.py")
    DEST.parent.mkdir(parents=True, exist_ok=True)
    DEST.write_text(content, encoding="utf-8", newline="\n")
    print(f"gerado {DEST.relative_to(ROOT)}")
