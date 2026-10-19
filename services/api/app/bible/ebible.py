"""Catálogo e importação de Bíblias do eBible.org pelo painel do administrador.

O administrador escolhe uma tradução do catálogo (só as que o eBible.org marca como
redistribuíveis e baixáveis); o servidor baixa o arquivo VPL, confere livros, capítulos e
versículos, lê a licença e grava no banco. O app passa a mostrar a tradução na hora, sem
atualização da loja.
"""

import csv
import hashlib
import io
import re
import time
import zipfile

import httpx
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.bible.books import all_books, verse_key
from app.bible.importer import ImportError_, ParsedVerse, store_translation
from app.models import BibleTranslation

CATALOG_URL = "https://ebible.org/Scriptures/translations.csv"
ZIP_URL = "https://ebible.org/Scriptures/{id}_vpl.zip"
_CATALOG_TTL = 12 * 3600
_catalog_cache: tuple[float, list[dict]] | None = None

# Códigos de livro usados nos arquivos VPL do eBible.org, na ordem canônica (66 livros)
VPL_CODES = (
    "GEN EXO LEV NUM DEU JOS JDG RUT 1SA 2SA 1KI 2KI 1CH 2CH EZR NEH EST JOB PSA PRO ECC SOL ISA JER LAM "
    "EZE DAN HOS JOE AMO OBA JON MIC NAH HAB ZEP HAG ZEC MAL MAT MAR LUK JOH ACT ROM 1CO 2CO GAL EPH PHI "
    "COL 1TH 2TH 1TI 2TI TIT PHM HEB JAM 1PE 2PE 1JO 2JO 3JO JUD REV"
).split()

# Idioma (ISO 639-3 do eBible) -> código usado no app e configuração de busca do PostgreSQL
LANGUAGES: dict[str, tuple[str, str]] = {
    "por": ("pt-BR", "portuguese"),
    "eng": ("en", "english"),
    "spa": ("es", "spanish"),
    "fra": ("fr", "french"),
    "deu": ("de", "german"),
    "ita": ("it", "italian"),
    "nld": ("nl", "dutch"),
    "rus": ("ru", "russian"),
    "swe": ("sv", "swedish"),
    "dan": ("da", "danish"),
    "nor": ("no", "norwegian"),
    "nob": ("nb", "norwegian"),
    "fin": ("fi", "finnish"),
    "hun": ("hu", "hungarian"),
    "ron": ("ro", "romanian"),
    "tur": ("tr", "turkish"),
    "ind": ("id", "indonesian"),
    "ell": ("el", "greek"),
    "grc": ("grc", "simple"),
    "heb": ("he", "simple"),
    "hbo": ("hbo", "simple"),
    "arb": ("ar", "arabic"),
    "hin": ("hi", "hindi"),
    "cmn": ("zh", "simple"),
    "kor": ("ko", "simple"),
    "jpn": ("ja", "simple"),
    "ukr": ("uk", "simple"),
    "pol": ("pl", "simple"),
    "ces": ("cs", "simple"),
    "vie": ("vi", "simple"),
    "tgl": ("tl", "simple"),
    "swh": ("sw", "simple"),
}

_LINE = re.compile(r"^(?P<code>[1-4A-Z]{3}) (?P<chapter>\d+):(?P<verse>\d+) ?(?P<text>.*)$")
_CC = re.compile(r"creativecommons\.org/licenses/([a-z-]+)/(\d\.\d)", re.IGNORECASE)


def language_of(ebible_code: str) -> tuple[str, str]:
    return LANGUAGES.get(ebible_code, (ebible_code[:10], "simple"))


async def _get(url: str, timeout: float = 120) -> bytes:
    async with httpx.AsyncClient(follow_redirects=True, timeout=timeout) as client:
        res = await client.get(url, headers={"User-Agent": "BibleAlpha/1.0 (+https://biblealpha.com)"})
        if res.status_code != 200:
            raise ImportError_(f"eBible.org respondeu {res.status_code} para {url}")
        return res.content


def parse_catalog(raw: bytes) -> list[dict]:
    rows = csv.DictReader(io.StringIO(raw.decode("utf-8-sig", errors="replace")))
    out = []
    for r in rows:
        if r.get("Redistributable") != "True" or r.get("downloadable") != "True":
            continue
        ot, nt = int(r.get("OTbooks") or 0), int(r.get("NTbooks") or 0)
        if ot + nt == 0:
            continue
        lang, _ = language_of(r["languageCode"])
        out.append(
            {
                "id": r["translationId"],
                "language_code": r["languageCode"],
                "language": lang,
                "language_name": r["languageName"],
                "language_name_en": r["languageNameInEnglish"],
                "title": r["shortTitle"] or r["title"],
                "description": r["description"],
                "copyright": r["Copyright"],
                "public_domain": r["Copyright"].strip().lower() == "public domain",
                "ot_books": ot,
                "nt_books": nt,
                "updated": r["UpdateDate"],
                "direction": r.get("textDirection") or "ltr",
            }
        )
    return out


async def catalog(refresh: bool = False) -> list[dict]:
    global _catalog_cache
    if not refresh and _catalog_cache and time.monotonic() - _catalog_cache[0] < _CATALOG_TTL:
        return _catalog_cache[1]
    items = parse_catalog(await _get(CATALOG_URL, timeout=60))
    _catalog_cache = (time.monotonic(), items)
    return items


def parse_vpl(raw: bytes) -> tuple[list[ParsedVerse], dict]:
    """Lê um VPL do eBible.org. Livros deuterocanônicos ficam de fora (o app usa os 66 livros).
    Livros incompletos são aceitos (ex.: só o Novo Testamento); as contagens são conferidas."""
    vpl_to_id = {code: i + 1 for i, code in enumerate(VPL_CODES)}
    usfm_to_id = {b.code: b.id for b in all_books()}
    books = {b.id: b for b in all_books()}
    verses: list[ParsedVerse] = []
    seen: set[int] = set()
    skipped_books: set[str] = set()
    # Numeração diferente da usada no app (ex.: Joel 4, Malaquias 4, versículo 0 com o título do
    # salmo): esses trechos ficam de fora e são registrados, o resto do texto entra normalmente
    out_of_range: list[str] = []
    empty = duplicates = bad = 0
    lines = raw.decode("utf-8-sig", errors="replace").splitlines()
    for line in lines:
        if not line.strip():
            continue
        m = _LINE.match(line)
        if not m:
            bad += 1
            continue
        code = m.group("code")
        book_id = vpl_to_id.get(code) or usfm_to_id.get(code)
        if book_id is None:
            skipped_books.add(code)
            continue
        chapter, verse = int(m.group("chapter")), int(m.group("verse"))
        body = m.group("text").strip()
        if not body:
            empty += 1
            continue
        if not (1 <= chapter <= books[book_id].chapters and 1 <= verse <= 200):
            out_of_range.append(f"{books[book_id].code} {chapter}:{verse}")
            continue
        key = verse_key(book_id, chapter, verse)
        if key in seen:
            duplicates += 1
            continue
        seen.add(key)
        verses.append(ParsedVerse(book_id, chapter, verse, body))

    if bad > max(20, len(lines) // 100):
        raise ImportError_(f"{bad} linhas fora do formato VPL")
    if not verses:
        raise ImportError_("nenhum versículo dos 66 livros encontrado no arquivo")
    chapters: dict[int, set[int]] = {}
    for v in verses:
        chapters.setdefault(v.book_id, set()).add(v.chapter)
    incomplete = [books[b].code for b, ch in chapters.items() if len(ch) != books[b].chapters]
    present = sorted(chapters)
    notes = {
        "books": present if len(present) < 66 else None,
        "incomplete_books": incomplete,
        "skipped_books": sorted(skipped_books),
        "empty_verses_skipped": empty,
        "out_of_range": out_of_range[:50],
        "out_of_range_count": len(out_of_range),
        "duplicates_skipped": duplicates,
        "bad_lines_skipped": bad,
    }
    return verses, notes


def read_license(about_html: str, copyright_text: str) -> tuple[str, str | None]:
    if copyright_text.strip().lower() == "public domain":
        return "Public Domain", None
    m = _CC.search(about_html)
    if m:
        kind, version = m.group(1).lower(), m.group(2)
        return f"CC {kind.upper()} {version}", f"https://creativecommons.org/licenses/{kind}/{version}/"
    # Redistribuível segundo o eBible.org, mas sem licença aberta identificada
    return "Redistributable (eBible.org)", None


def clean_code(value: str) -> str:
    code = re.sub(r"[^a-z0-9]", "", value.lower())[:20]
    if len(code) < 2:
        raise ImportError_("código inválido")
    return code


async def import_from_ebible(
    db: AsyncSession,
    ebible_id: str,
    *,
    code: str | None = None,
    name: str | None = None,
    abbreviation: str | None = None,
    replace: bool = False,
) -> BibleTranslation:
    entry = next((x for x in await catalog() if x["id"] == ebible_id), None)
    if entry is None:
        raise ImportError_("tradução não encontrada no catálogo redistribuível do eBible.org")
    code = clean_code(code or ebible_id)
    existing = await db.scalar(select(BibleTranslation).where(BibleTranslation.code == code))
    if existing and not replace:
        raise ImportError_(f"já existe uma tradução com o código {code}")

    source_url = ZIP_URL.format(id=ebible_id)
    archive = zipfile.ZipFile(io.BytesIO(await _get(source_url)))
    names = archive.namelist()
    vpl_name = next((n for n in names if n.endswith("_vpl.txt")), None)
    if vpl_name is None:
        raise ImportError_("o arquivo baixado não tem o texto VPL")
    raw = archive.read(vpl_name)
    about_name = next((n for n in names if n.endswith("_about.htm")), None)
    about = archive.read(about_name).decode("utf-8", errors="replace") if about_name else ""

    verses, notes = parse_vpl(raw)
    lang, search_config = language_of(entry["language_code"])
    license_name, license_url = read_license(about, entry["copyright"])
    title = (name or entry["title"]).strip()[:200]
    abbr = (abbreviation or ebible_id).strip()[:20].upper()
    year = re.search(r"\b(1[5-9]\d\d|20\d\d)\b", entry["title"] + " " + entry["copyright"])
    copyright_text = entry["copyright"].strip()
    attribution = (
        f"{title} ({abbr}), {'domínio público' if license_name == 'Public Domain' else copyright_text}. "
        f"Licença: {license_name}. Texto obtido em eBible.org."
    )
    fields = {
        "name": title,
        "abbreviation": abbr,
        "language": lang,
        "search_config": search_config,
        "description": entry["description"] or title,
        "edition": f"{entry['title']} (eBible.org {ebible_id}, atualizado em {entry['updated']})"[:200],
        "year": int(year.group(1)) if year else None,
        "license": license_name,
        "license_url": license_url or f"https://ebible.org/{ebible_id}/copyright.htm",
        "attribution": attribution,
        "source_url": source_url,
        "source_sha256": hashlib.sha256(raw).hexdigest(),
        "versification": "kjv",
        "notes": {
            **{k: v for k, v in notes.items() if v},
            "ebible_id": ebible_id,
            "copyright": copyright_text,
            "direction": entry["direction"],
            "language_name": entry["language_name"],
            "language_name_en": entry["language_name_en"],
            "ebible_updated": entry["updated"],
        },
        "verse_count": len(verses),
        "is_active": True,
    }
    return await store_translation(db, code, fields, verses, existing)


def book_codes(notes: dict) -> list[str] | None:
    """Livros disponíveis numa tradução incompleta (None = todos os 66)."""
    ids = notes.get("books")
    return [b.code for b in all_books() if b.id in ids] if ids else None
