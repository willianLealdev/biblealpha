import time

from sqlalchemy import func, select

from app.bible.books import all_books
from app.db.session import get_sessionmaker
from app.models import BibleTranslation, BibleVerse


async def test_corpus_integrity():
    """66 livros, 1.189 capítulos e a contagem de versículos do arquivo de origem."""
    async with get_sessionmaker()() as db:
        for code, expected in (("blivre", 31102), ("web", 31098)):
            t = await db.scalar(select(BibleTranslation).where(BibleTranslation.code == code))
            assert t.verse_count == expected
            count = await db.scalar(select(func.count()).where(BibleVerse.translation_id == t.id))
            assert count == expected
            chapters = await db.scalar(
                select(func.count()).select_from(
                    select(BibleVerse.book_id, BibleVerse.chapter)
                    .where(BibleVerse.translation_id == t.id)
                    .distinct()
                    .subquery()
                )
            )
            assert chapters == 1189 == sum(b.chapters for b in all_books())


async def test_translations_show_license_and_source(client):
    r = await client.get("/api/v1/bible/translations")
    data = {t["code"]: t for t in r.json()}
    assert data["blivre"]["license"] == "CC BY 4.0 BR"
    assert data["web"]["license"] == "Public Domain"
    assert data["rv1909"]["language_name"] == "Español"
    # Lista resumida com ETag; os créditos completos ficam no detalhe
    again = await client.get("/api/v1/bible/translations", headers={"if-none-match": r.headers["etag"]})
    assert again.status_code == 304
    detail = (await client.get("/api/v1/bible/translations/blivre")).json()
    assert "Diego Santos" in detail["attribution"]
    assert detail["source_url"].startswith("https://ebible.org/")


async def test_read_chapter_with_navigation(client):
    r = await client.get("/api/v1/bible/blivre/chapters/JHN/3")
    assert r.status_code == 200
    body = r.json()
    assert body["verses"][15]["verse"] == 16
    assert body["verses"][15]["text"].startswith("Porque Deus amou ao mundo")
    assert body["prev"] == {"book": "JHN", "chapter": 2}
    assert body["next"] == {"book": "JHN", "chapter": 4}
    assert "max-age" in r.headers["cache-control"]

    # ETag: segunda leitura sem baixar de novo
    r2 = await client.get("/api/v1/bible/blivre/chapters/JHN/3", headers={"If-None-Match": r.headers["etag"]})
    assert r2.status_code == 304

    first = (await client.get("/api/v1/bible/blivre/chapters/GEN/1")).json()
    assert first["prev"] is None
    last = (await client.get("/api/v1/bible/blivre/chapters/REV/22")).json()
    assert last["next"] is None
    assert (await client.get("/api/v1/bible/blivre/chapters/MAL/4")).json()["next"] == {
        "book": "MAT",
        "chapter": 1,
    }
    assert (await client.get("/api/v1/bible/blivre/chapters/JHN/22")).status_code == 404
    assert (await client.get("/api/v1/bible/nope/chapters/JHN/1")).status_code == 404


async def test_passage_by_reference(client):
    r = await client.get("/api/v1/bible/blivre/passage", params={"ref": "Jo 3:16-17; Rm 5:8"})
    passages = r.json()["passages"]
    assert [p["label"] for p in passages] == ["João 3:16–17", "Romanos 5:8"]
    assert [v["verse"] for v in passages[0]["verses"]] == [16, 17]
    r = await client.get("/api/v1/bible/web/passage", params={"ref": "John 1:1"})
    assert r.json()["passages"][0]["verses"][0]["text"].startswith("In the beginning was the Word")
    r = await client.get("/api/v1/bible/blivre/passage", params={"ref": "Livro 1:1"})
    assert r.status_code == 422


async def test_search_ignores_accents_and_is_fast(client):
    start = time.perf_counter()
    r = await client.get("/api/v1/bible/blivre/search", params={"q": "unigenito"})
    elapsed = time.perf_counter() - start
    body = r.json()
    assert body["type"] == "text"
    assert any(x["book"] == "JHN" and x["chapter"] == 3 and x["verse"] == 16 for x in body["results"])
    assert elapsed < 0.3

    phrase = (await client.get("/api/v1/bible/blivre/search", params={"q": '"no princípio"'})).json()
    assert phrase["results"][0]["book"] == "GEN"

    nt = (await client.get("/api/v1/bible/blivre/search", params={"q": "amor", "testament": "NT"})).json()
    assert nt["total"] > 0 and all(x["verse_key"] >= 40_000_000 for x in nt["results"])

    one_book = (await client.get("/api/v1/bible/blivre/search", params={"q": "amor", "book": "1JN"})).json()
    assert one_book["total"] > 0 and {x["book"] for x in one_book["results"]} == {"1JN"}

    en = (await client.get("/api/v1/bible/web/search", params={"q": "shepherd"})).json()
    assert any(x["book"] == "PSA" and x["chapter"] == 23 for x in en["results"])


async def test_search_with_reference_jumps(client):
    body = (await client.get("/api/v1/bible/blivre/search", params={"q": "Rm 12:1-2"})).json()
    assert body["type"] == "reference"
    assert body["references"][0]["book"] == "ROM"


async def test_full_download_for_offline(client):
    r = await client.get("/api/v1/bible/blivre/download")
    data = r.json()
    assert len(data["books"]) == 66
    assert sum(len(v) for v in data["books"].values()) == 31102
    assert r.headers["etag"]
