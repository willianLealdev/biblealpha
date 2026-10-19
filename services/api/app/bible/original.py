"""Importação dos textos originais, do léxico e das referências cruzadas.

    python -m app.bible.original            # importa o que faltar (baixa os arquivos)
    python -m app.bible.original --replace  # importa de novo

Fontes (licenças abertas, com crédito no app):
- STEPBible.org (Tyndale House, Cambridge), CC BY 4.0: TAHOT (hebraico/aramaico do AT) e TAGNT
  (grego do NT), palavra por palavra, com transliteração, tradução da palavra, Strong e
  morfologia; TBESH/TBESG (léxicos breves).
- OpenBible.info, CC BY: referências cruzadas com votos de relevância.

Em produção roda sozinho ao subir o servidor (junto com a importação das Bíblias).
"""

import asyncio
import io
import logging
import re
import sys
import zipfile
from urllib.parse import quote

import httpx
from sqlalchemy import delete, func, insert, select

from app.bible.books import by_code, verse_key
from app.db.session import dispose_engine, get_sessionmaker
from app.models import BiblePlace, CrossReference, LexiconEntry, OriginalWord, PlaceMention
from app.services.settings import get_setting, set_setting

log = logging.getLogger(__name__)

STATUS_KEY = "bible.original"
STEP = "https://raw.githubusercontent.com/STEPBible/STEPBible-Data/master/"
HEBREW = [
    "Translators Amalgamated OT+NT/TAHOT Gen-Deu - Translators Amalgamated Hebrew OT - STEPBible.org CC BY.txt",
    "Translators Amalgamated OT+NT/TAHOT Jos-Est - Translators Amalgamated Hebrew OT - STEPBible.org CC BY.txt",
    "Translators Amalgamated OT+NT/TAHOT Job-Sng - Translators Amalgamated Hebrew OT - STEPBible.org CC BY.txt",
    "Translators Amalgamated OT+NT/TAHOT Isa-Mal - Translators Amalgamated Hebrew OT - STEPBible.org CC BY.txt",
]
GREEK = [
    "Translators Amalgamated OT+NT/TAGNT Mat-Jhn - Translators Amalgamated Greek NT - STEPBible.org CC-BY.txt",
    "Translators Amalgamated OT+NT/TAGNT Act-Rev - Translators Amalgamated Greek NT - STEPBible.org CC-BY.txt",
]
LEXICONS = [
    "Lexicons/TBESH - Translators Brief lexicon of Extended Strongs for Hebrew - STEPBible.org CC BY.txt",
    "Lexicons/TBESG - Translators Brief lexicon of Extended Strongs for Greek - STEPBible.org CC BY.txt",
]
XREF_URL = "https://a.openbible.info/data/cross-references.zip"
PLACES_URL = "https://raw.githubusercontent.com/openbibleinfo/Bible-Geocoding-Data/main/data/ancient.jsonl"

CREDITS = {
    "original": "Hebraico, aramaico e grego: STEPBible.org (Tyndale House, Cambridge), CC BY 4.0.",
    "crossrefs": "Referências cruzadas: OpenBible.info, CC BY.",
    "places": "Lugares: OpenBible.info Bible Geocoding Data, CC BY 4.0 (geometria: OpenStreetMap, ODbL).",
}

# Nomes OSIS do OpenBible → códigos USFM do app
OSIS = {
    "Gen": "GEN", "Exod": "EXO", "Lev": "LEV", "Num": "NUM", "Deut": "DEU", "Josh": "JOS", "Judg": "JDG",
    "Ruth": "RUT", "1Sam": "1SA", "2Sam": "2SA", "1Kgs": "1KI", "2Kgs": "2KI", "1Chr": "1CH", "2Chr": "2CH",
    "Ezra": "EZR", "Neh": "NEH", "Esth": "EST", "Job": "JOB", "Ps": "PSA", "Prov": "PRO", "Eccl": "ECC",
    "Song": "SNG", "Isa": "ISA", "Jer": "JER", "Lam": "LAM", "Ezek": "EZK", "Dan": "DAN", "Hos": "HOS",
    "Joel": "JOL", "Amos": "AMO", "Obad": "OBA", "Jonah": "JON", "Mic": "MIC", "Nah": "NAM", "Hab": "HAB",
    "Zeph": "ZEP", "Hag": "HAG", "Zech": "ZEC", "Mal": "MAL", "Matt": "MAT", "Mark": "MRK", "Luke": "LUK",
    "John": "JHN", "Acts": "ACT", "Rom": "ROM", "1Cor": "1CO", "2Cor": "2CO", "Gal": "GAL", "Eph": "EPH",
    "Phil": "PHP", "Col": "COL", "1Thess": "1TH", "2Thess": "2TH", "1Tim": "1TI", "2Tim": "2TI", "Titus": "TIT",
    "Phlm": "PHM", "Heb": "HEB", "Jas": "JAS", "1Pet": "1PE", "2Pet": "2PE", "1John": "1JN", "2John": "2JN",
    "3John": "3JN", "Jude": "JUD", "Rev": "REV",
}  # fmt: skip

_REF = re.compile(
    r"^(?P<book>[1-3]?[A-Za-z]{2,3})\.(?P<ch>\d+)\.(?P<v>\d+)(?:\([^)]*\))?#(?P<n>\d+)=(?P<type>[^\t]*)$"
)
_TAG = re.compile(r"<[^>]+>")


def _key(book: str, chapter: int, verse: int) -> int | None:
    b = by_code().get(book.upper())
    if b is None or not 1 <= chapter <= b.chapters:
        return None
    return verse_key(b.id, chapter, verse)


async def _download(path_or_url: str) -> bytes:
    url = path_or_url if path_or_url.startswith("http") else STEP + quote(path_or_url)
    async with httpx.AsyncClient(timeout=300, follow_redirects=True) as client:
        r = await client.get(url, headers={"User-Agent": "BibleAlpha/1.0 (+https://biblealpha.com)"})
        r.raise_for_status()
        return r.content


def parse_words(text: str, greek: bool) -> list[dict]:
    """Linhas do TAHOT/TAGNT → palavras. Mantém a primeira ocorrência de cada posição do verso."""
    out: list[dict] = []
    seen: set[tuple[int, int]] = set()
    for line in text.splitlines():
        cols = line.split("\t")
        m = _REF.match(cols[0].strip()) if cols else None
        if not m or len(cols) < 5:
            continue
        key = _key(m.group("book"), int(m.group("ch")), int(m.group("v")))
        if key is None:
            continue
        pos = int(m.group("n"))
        if (key, pos) in seen:
            continue
        seen.add((key, pos))
        if greek:
            # "Βίβλος (Biblos)" | inglês | "G0976=N-NSF" | "βίβλος=book" | edições | ... | espanhol
            word = cols[1].strip()
            wm = re.match(r"^(.*?)\s*\(([^)]*)\)\s*$", word)
            text_, translit = (wm.group(1), wm.group(2)) if wm else (word, "")
            strong, _, morph = cols[3].partition("=")
            gloss_en = cols[2].strip()
            gloss_es = cols[8].strip() if len(cols) > 8 else None
        else:
            # hebraico | transliteração | inglês | "H9003/{H7225G}" | gramática
            text_, translit, gloss_en = cols[1].strip(), cols[2].strip(), cols[3].strip()
            main = re.search(r"\{([HG]\d+[A-Za-z]?)\}", cols[4])
            strong = main.group(1) if main else (re.findall(r"[HG]\d+[A-Za-z]?", cols[4]) or [""])[-1]
            morph = cols[5].strip() if len(cols) > 5 else ""
            gloss_es = None
        out.append(
            {
                "verse_key": key,
                "position": pos,
                "text": text_[:120],
                "translit": translit[:160],
                "gloss_en": gloss_en[:200],
                "gloss_es": gloss_es[:200] if gloss_es else None,
                "strong": (strong.strip() or None) if strong else None,
                "morph": morph.strip()[:40],
            }
        )
    return out


def parse_lexicon(text: str) -> list[dict]:
    """TBESH/TBESG: strong | "dStrong =" | dStrong | lema | transliteração | morfologia | sentido | definição."""
    out: dict[str, dict] = {}
    for line in text.splitlines():
        cols = line.split("\t")
        if len(cols) < 8 or not re.match(r"^[HG]\d{4}", cols[0]):
            continue
        strong = cols[1].split("=")[0].strip() or cols[0].strip()
        if not re.match(r"^[HG]\d+[A-Za-z]?$", strong) or strong in out:
            continue
        definition = _TAG.sub("", cols[7].replace("<br>", "\n").replace("<BR>", "\n").replace("<BR />", "\n"))
        out[strong] = {
            "strong": strong,
            "base": cols[0].strip()[:8],
            "lemma": cols[3].strip()[:120],
            "translit": cols[4].strip()[:120],
            "morph": cols[5].strip()[:40],
            "gloss": cols[6].strip()[:300],
            "definition": definition.strip()[:6000],
            "i18n": {},
        }
    return list(out.values())


def _osis_key(ref: str) -> int | None:
    m = re.match(r"^([1-3]?[A-Za-z]+)\.(\d+)\.(\d+)$", ref)
    if not m or m.group(1) not in OSIS:
        return None
    return _key(OSIS[m.group(1)], int(m.group(2)), int(m.group(3)))


def parse_crossrefs(text: str) -> list[dict]:
    out = []
    for line in text.splitlines()[1:]:
        cols = line.split("\t")
        if len(cols) < 3:
            continue
        try:
            votes = int(cols[2])
        except ValueError:
            continue
        if votes <= 0:
            continue
        start_ref, _, end_ref = cols[1].partition("-")
        src, start = _osis_key(cols[0]), _osis_key(start_ref)
        end = _osis_key(end_ref) if end_ref else start
        if src and start and end and end >= start:
            out.append({"from_key": src, "to_start": start, "to_end": end, "votes": votes})
    return out


def parse_places(text: str) -> tuple[list[dict], list[dict]]:
    """ancient.jsonl → lugares (com a coordenada mais provável) e os versículos onde aparecem."""
    import json

    places, mentions = [], []
    for line in text.splitlines():
        if not line.strip():
            continue
        r = json.loads(line)
        idents = r.get("identifications") or []
        res = (idents[0].get("resolutions") or [{}])[0] if idents else {}
        lonlat = res.get("lonlat")
        if not lonlat:
            continue
        try:
            lon, lat = (float(x) for x in lonlat.split(",")[:2])
        except ValueError:
            continue
        pid = str(r["id"])[:20]
        places.append(
            {
                "id": pid,
                "name": str(r.get("friendly_id", ""))[:120],
                "lon": lon,
                "lat": lat,
                "kind": str(res.get("class", ""))[:40],
            }
        )
        for v in r.get("verses") or []:
            sort = str(v.get("sort", ""))
            if sort.isdigit() and len(sort) == 8:
                mentions.append({"place_id": pid, "verse_key": int(sort)})
    return places, mentions


async def _bulk(model, rows: list[dict]) -> None:
    for i in range(0, len(rows), 5000):
        async with get_sessionmaker()() as db:
            await db.execute(insert(model), rows[i : i + 5000])
            await db.commit()


async def import_all(replace: bool = False) -> dict:
    async with get_sessionmaker()() as db:
        have_words = await db.scalar(select(func.count()).select_from(OriginalWord))
        have_xrefs = await db.scalar(select(func.count()).select_from(CrossReference))
        have_lex = await db.scalar(select(func.count()).select_from(LexiconEntry))
        have_places = await db.scalar(select(func.count()).select_from(BiblePlace))
        if replace:
            for model in (OriginalWord, CrossReference, LexiconEntry, PlaceMention, BiblePlace):
                await db.execute(delete(model))
            await db.commit()
            have_words = have_xrefs = have_lex = have_places = 0
    counts = {"words": have_words, "lexicon": have_lex, "crossrefs": have_xrefs, "places": have_places}
    if not have_lex:
        rows = []
        for path in LEXICONS:
            rows += parse_lexicon((await _download(path)).decode("utf-8-sig"))
        await _bulk(LexiconEntry, rows)
        counts["lexicon"] = len(rows)
    if not have_words:
        total = 0
        for path, greek in [(p, False) for p in HEBREW] + [(p, True) for p in GREEK]:
            rows = parse_words((await _download(path)).decode("utf-8-sig"), greek)
            await _bulk(OriginalWord, rows)
            total += len(rows)
        counts["words"] = total
    if not have_xrefs:
        archive = zipfile.ZipFile(io.BytesIO(await _download(XREF_URL)))
        name = next(n for n in archive.namelist() if n.endswith(".txt"))
        rows = parse_crossrefs(archive.read(name).decode("utf-8-sig"))
        await _bulk(CrossReference, rows)
        counts["crossrefs"] = len(rows)
    if not have_places:
        places, mentions = parse_places((await _download(PLACES_URL)).decode("utf-8-sig"))
        await _bulk(BiblePlace, places)
        await _bulk(PlaceMention, mentions)
        counts["places"] = len(places)
    async with get_sessionmaker()() as db:
        await set_setting(db, STATUS_KEY, {**counts, "done": True})
        await db.commit()
    return counts


async def ensure_imported() -> None:
    """Produção: importa uma vez (chamado na importação automática ao subir o servidor)."""
    async with get_sessionmaker()() as db:
        if (await get_setting(db, STATUS_KEY)).get("done") and await db.scalar(
            select(func.count()).select_from(BiblePlace)
        ):
            return
    log.info("Importando hebraico, grego, léxico e referências cruzadas")
    log.info("Importação dos originais concluída: %s", await import_all())


async def _main(replace: bool) -> None:
    try:
        print(await import_all(replace=replace))
    finally:
        await dispose_engine()


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    asyncio.run(_main("--replace" in sys.argv))
