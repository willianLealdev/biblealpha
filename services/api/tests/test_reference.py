import json
from pathlib import Path

import pytest

from app.bible.reference import Reference, ReferenceError, format_reference, parse

CASES = json.loads((Path(__file__).parent / "fixtures" / "references.json").read_text(encoding="utf-8"))


def _tuple(r: Reference) -> list:
    d = r.as_dict()
    return [d["book"], d["chapter"], d["verse_start"], d["chapter_end"], d["verse_end"]]


@pytest.mark.parametrize("case", CASES["valid"], ids=lambda c: c["input"])
def test_valid_references(case):
    assert [_tuple(r) for r in parse(case["input"], case["locale"])] == case["expected"]


@pytest.mark.parametrize("case", CASES["invalid"], ids=lambda c: c["input"] or "<vazio>")
def test_invalid_references(case):
    with pytest.raises(ReferenceError):
        parse(case["input"], case["locale"])


def test_format():
    assert format_reference(parse("jo 3:16-18")[0]) == "João 3:16–18"
    assert format_reference(parse("Gn 1")[0], "en") == "Genesis 1"
    assert format_reference(parse("Mt 5:3-7:29")[0], abbreviated=True) == "Mt 5:3–7:29"


def test_find_references_in_free_text():
    from app.bible.reference import find_references

    text = (
        "Compare com Gênesis 1:1 e João 1:14. Paulo retoma o tema em Colossenses 1:16-17; "
        "veja também Salmo 23 e Hebreus 1.1. Não é referência: capítulo 3 do livro, ano 2026."
    )
    found = [f"{r.book} {r.chapter}:{r.verse_start}" for _, r in find_references(text)]
    assert found == ["GEN 1:1", "JHN 1:14", "COL 1:16", "PSA 23:None", "HEB 1:1"]
