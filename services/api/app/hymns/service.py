"""Harpa Cristã: os 640 hinos em ordem, lidos de um arquivo JSON (sem banco de dados)."""

import json
import re
import unicodedata
from functools import lru_cache
from pathlib import Path

DATA = Path(__file__).parent / "data" / "harpa_crista.json"


def plain(text: str) -> str:
    """Minúsculas e sem acentos, para a busca achar "graca" em "Graça"."""
    nfd = unicodedata.normalize("NFD", text.lower())
    return re.sub(r"\s+", " ", "".join(c for c in nfd if unicodedata.category(c) != "Mn"))


@lru_cache(maxsize=1)
def hymns() -> list[dict]:
    return json.loads(DATA.read_text(encoding="utf-8"))


@lru_cache(maxsize=1)
def _index() -> list[tuple[int, str, str]]:
    return [(h["n"], plain(h["title"]), plain(" ".join([*h["verses"], h["chorus"] or ""]))) for h in hymns()]


def summary(h: dict) -> dict:
    return {"n": h["n"], "title": h["title"], "first_line": h["verses"][0].split("\n", 1)[0]}


def search(q: str) -> list[dict]:
    """Por número ("15"), pelo título ou por um trecho da letra; títulos primeiro."""
    q = q.strip()
    if q.isdigit():
        n = int(q)
        return [summary(hymns()[n - 1])] if 1 <= n <= len(hymns()) else []
    words = plain(q).split()
    by_title, by_lyrics = [], []
    for n, title, lyrics in _index():
        if all(w in title for w in words):
            by_title.append(n)
        elif all(w in lyrics for w in words):
            by_lyrics.append(n)
    return [summary(hymns()[n - 1]) for n in [*by_title, *by_lyrics][:100]]


def get(n: int) -> dict | None:
    return hymns()[n - 1] if 1 <= n <= len(hymns()) else None
