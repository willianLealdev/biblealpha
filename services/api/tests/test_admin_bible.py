import io
import zipfile

from app.bible import ebible
from tests.conftest import bearer, login, make_admin, register

CSV = (
    '"languageCode","translationId","languageName","languageNameInEnglish","dialect","homeDomain","title",'
    '"description","Redistributable","Copyright","UpdateDate","publicationURL","OTbooks","OTchapters","OTverses",'
    '"NTbooks","NTchapters","NTverses","DCbooks","DCchapters","DCverses","FCBHID","Certified","inScript",'
    '"swordName","rodCode","textDirection","downloadable","font","shortTitle","PODISBN","script","sourceDate"\n'
    '"fra","fratest","Français","French","","ebible.org","Bible de test","Une Bible de test","True",'
    '"public domain","2026-01-01","","0","0","0","2","0","0","0","0","0","","True","","","","ltr","True","",'
    '"French Test Bible 1910","","Latin",""\n'
    '"eng","engclosed","English","English","","x","Closed","Closed","False","Copyright","2026-01-01","","39","0",'
    '"0","27","0","0","0","0","0","","True","","","","ltr","False","","Closed","","Latin",""\n'
)


def _zip() -> bytes:
    # Só Judas e 3 João (Novo Testamento parcial) + um livro deuterocanônico que deve ser ignorado
    lines = [f"JUD 1:{v} Jude verset {v}." for v in range(1, 26)]
    lines += [f"3JO 1:{v} Troisième Jean {v}." for v in range(1, 15)]
    lines += ["TOB 1:1 Tobie."]
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w") as z:
        z.writestr("fratest_vpl.txt", "\n".join(lines) + "\n")
        z.writestr("fratest_about.htm", "<p>Public Domain</p>")
    return buf.getvalue()


async def _fake_get(url: str, timeout: float = 120) -> bytes:
    if url.endswith("translations.csv"):
        return CSV.encode()
    assert url.endswith("fratest_vpl.zip")
    return _zip()


async def _admin(client):
    await register(client)
    await make_admin()
    return await login(client)


async def test_translations_have_one_default_per_language(client):
    items = (await client.get("/api/v1/bible/translations")).json()
    defaults = {t["language"]: t["code"] for t in items if t["is_default"]}
    assert defaults == {"pt-BR": "blivre", "en": "web", "es": "rv1909"}
    rv = next(t for t in items if t["code"] == "rv1909")
    assert rv["books"] is None and rv["license"] == "Public Domain"
    r = await client.get("/api/v1/bible/rv1909/chapters/JHN/3")
    assert "Porque de tal manera amó Dios al mundo" in r.json()["verses"][15]["text"]


async def test_admin_imports_from_ebible_catalog(client, monkeypatch):
    monkeypatch.setattr(ebible, "_get", _fake_get)
    monkeypatch.setattr(ebible, "_catalog_cache", None)
    tokens = await _admin(client)

    cat = (await client.get("/api/v1/admin/bibles/catalog?language=fra", headers=bearer(tokens))).json()
    assert [x["id"] for x in cat["items"]] == ["fratest"]  # a fechada não aparece

    r = await client.post(
        "/api/v1/admin/bibles/import", headers=bearer(tokens), json={"ebible_id": "fratest", "code": "frtest"}
    )
    assert r.status_code == 200, r.text
    out = r.json()
    assert out["language"] == "fr" and out["verse_count"] == 39 and out["books"] == ["3JN", "JUD"]

    # Aparece no app na hora, como padrão do francês
    items = (await client.get("/api/v1/bible/translations")).json()
    fr = next(t for t in items if t["code"] == "frtest")
    assert fr["is_default"] and fr["license"] == "Public Domain" and fr["books"] == ["3JN", "JUD"]
    ch = (await client.get("/api/v1/bible/frtest/chapters/JUD/1")).json()
    assert len(ch["verses"]) == 25
    missing = await client.get("/api/v1/bible/frtest/chapters/GEN/1")
    assert missing.status_code == 404 and missing.json()["error"]["code"] == "book_not_in_translation"

    # Busca e importação repetida
    s = (await client.get("/api/v1/bible/frtest/search?q=verset")).json()
    assert s["total"] == 25
    again = await client.post(
        "/api/v1/admin/bibles/import", headers=bearer(tokens), json={"ebible_id": "fratest", "code": "frtest"}
    )
    assert again.status_code == 422

    # Desativar some do app; remover apaga
    await client.patch("/api/v1/admin/bibles/frtest", headers=bearer(tokens), json={"is_active": False})
    assert "frtest" not in [t["code"] for t in (await client.get("/api/v1/bible/translations")).json()]
    assert (await client.delete("/api/v1/admin/bibles/frtest", headers=bearer(tokens))).status_code == 200
    assert (await client.delete("/api/v1/admin/bibles/blivre", headers=bearer(tokens))).status_code == 422


async def test_admin_sets_default_and_users_cannot(client):
    tokens = await _admin(client)
    r = await client.put("/api/v1/admin/bibles/default", headers=bearer(tokens), json={"code": "web"})
    assert r.status_code == 200
    await register(client, email="bia@example.com", name="Bia")
    user = await login(client, email="bia@example.com")
    assert (await client.get("/api/v1/admin/bibles", headers=bearer(user))).status_code == 403
    listed = (await client.get("/api/v1/admin/bibles", headers=bearer(tokens))).json()["translations"]
    assert {t["code"] for t in listed} >= {"blivre", "web", "rv1909"}


def test_parse_vpl_skips_other_numbering_and_keeps_the_rest():
    lines = ("JOE 3:21 ultimo.", "JOE 4:1 numeracao.", "PSA 3:0 titulo.", "JUD 1:1 Judas.", "JUD 1:1 outro.")
    verses, notes = ebible.parse_vpl("\n".join(lines).encode())
    assert [(v.chapter, v.verse) for v in verses] == [(3, 21), (1, 1)]
    assert notes["out_of_range_count"] == 2 and notes["duplicates_skipped"] == 1


def test_parse_vpl_rejects_out_of_canon_chapters():
    import pytest

    from app.bible.importer import ImportError_

    with pytest.raises(ImportError_):
        ebible.parse_vpl(b"JUD 2:1 Nao existe.\n")
