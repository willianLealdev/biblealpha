"""BibleAlpha Kids: rascunho invisível, publicar, despublicar, só admin altera, público sem login."""

from tests.conftest import bearer, login, make_admin, register

ADMIN = "/api/v1/admin/kids/stories"
PUBLIC = "/api/v1/kids/stories"


async def _admin(client) -> dict:
    await register(client, "adm@example.com", "Adm")
    await make_admin("adm@example.com")
    return bearer(await login(client, "adm@example.com"))


async def _generate(client, h, **extra) -> dict:
    r = await client.post(f"{ADMIN}/generate", headers=h, json={"reference": "1 Samuel 17:45-50", **extra})
    assert r.status_code == 201, r.text
    return r.json()


async def test_generated_story_is_a_draft_with_the_real_passage(client):
    h = await _admin(client)
    story = await _generate(client, h, level="small", tone="calm", length="short")
    assert story["status"] == "draft" and story["level"] == "small"
    assert story["reference"] == "1 Samuel 17:45–50"
    assert story["pages"] == 3 and story["page_list"][0]["text"]
    # a passagem bíblica de verdade vem junto, para revisar ao lado
    assert [v["verse"] for v in story["passage"]] == [45, 46, 47, 48, 49, 50]
    assert story["translation"] and story["ai_meta"]["request"]["tone"] == "calm"

    listed = (await client.get(ADMIN, headers=h)).json()
    assert listed["totals"] == {"draft": 1, "review": 0, "published": 0}

    from sqlalchemy import select

    from app.db.session import get_sessionmaker
    from app.models import AIUsage

    async with get_sessionmaker()() as db:
        assert (await db.scalars(select(AIUsage.feature))).all() == ["kids_story"]


async def test_publish_and_unpublish(client):
    h = await _admin(client)
    story = await _generate(client, h)
    sid, slug = story["id"], story["slug"]

    # rascunho e revisão não aparecem para as crianças
    assert (await client.get(PUBLIC)).json()["stories"] == []
    assert (await client.get(f"{PUBLIC}/{slug}")).status_code == 404
    r = await client.post(f"{ADMIN}/{sid}/status", headers=h, json={"status": "review"})
    assert r.json()["status"] == "review"
    assert (await client.get(PUBLIC)).json()["stories"] == []

    r = await client.post(f"{ADMIN}/{sid}/status", headers=h, json={"status": "published"})
    assert r.json()["status"] == "published" and r.json()["published_at"]

    # sem login
    listed = (await client.get(PUBLIC)).json()["stories"]
    assert [s["slug"] for s in listed] == [slug] and listed[0]["pages"] == 3 and listed[0]["quiz"] == 3
    seen = (await client.get(f"{PUBLIC}/{slug}")).json()
    assert seen["reference"] == "1 Samuel 17:45–50" and len(seen["pages"]) == 3
    # nada do painel vai para o público
    assert set(seen) == {
        "slug",
        "language",
        "title",
        "summary",
        "reference",
        "level",
        "pages",
        "lesson",
        "family_question",
        "quiz",
    }
    assert set(seen["pages"][0]) == {"text"}

    # outro idioma não mostra a história em português
    assert (await client.get(PUBLIC, params={"language": "en"})).json()["stories"] == []

    r = await client.post(f"{ADMIN}/{sid}/status", headers=h, json={"status": "draft"})
    assert r.json()["published_at"] is None
    assert (await client.get(PUBLIC)).json()["stories"] == []
    assert (await client.get(f"{PUBLIC}/{slug}")).status_code == 404


async def test_edit_pages_and_level_filter(client):
    h = await _admin(client)
    story = await _generate(client, h)
    r = await client.put(
        f"{ADMIN}/{story['id']}",
        headers=h,
        json={
            "title": "Davi confia em Deus",
            "summary": "Um menino corajoso.",
            "level": "big",
            "lesson": "Deus é maior que qualquer gigante.",
            "family_question": "Do que você tem medo?",
            "pages": [{"text": "Davi era pastor."}, {"text": "Ele confiou em Deus.", "image_prompt": "boy"}],
        },
    )
    assert r.status_code == 200, r.text
    assert r.json()["title"] == "Davi confia em Deus" and r.json()["pages"] == 2
    assert r.json()["page_list"][1] == {"text": "Ele confiou em Deus.", "image_prompt": "boy"}
    assert r.json()["slug"] == story["slug"]
    await client.post(f"{ADMIN}/{story['id']}/status", headers=h, json={"status": "published"})

    assert [s["title"] for s in (await client.get(PUBLIC, params={"level": "big"})).json()["stories"]] == [
        "Davi confia em Deus"
    ]
    assert (await client.get(PUBLIC, params={"level": "small"})).json()["stories"] == []
    seen = (await client.get(f"{PUBLIC}/{story['slug']}")).json()
    assert [p["text"] for p in seen["pages"]] == ["Davi era pastor.", "Ele confiou em Deus."]

    # história sem páginas não é aceita
    r = await client.put(
        f"{ADMIN}/{story['id']}", headers=h, json={"title": "X", "level": "big", "pages": []}
    )
    assert r.status_code == 422


async def test_only_admin_changes_stories(client):
    h = await _admin(client)
    story = await _generate(client, h)
    await register(client, "bia@example.com", "Bia")
    bia = bearer(await login(client, "bia@example.com"))
    assert (await client.get(ADMIN, headers=bia)).status_code == 403
    assert (
        await client.post(f"{ADMIN}/generate", headers=bia, json={"reference": "Gn 1"})
    ).status_code == 403
    r = await client.post(f"{ADMIN}/{story['id']}/status", headers=bia, json={"status": "published"})
    assert r.status_code == 403
    assert (await client.delete(f"{ADMIN}/{story['id']}", headers=bia)).status_code == 403
    # sem login também não
    assert (await client.get(ADMIN)).status_code == 401
    assert (
        await client.post(f"{ADMIN}/{story['id']}/status", json={"status": "published"})
    ).status_code == 401

    assert (await client.delete(f"{ADMIN}/{story['id']}", headers=h)).status_code == 204
    assert (await client.get(f"{ADMIN}/{story['id']}", headers=h)).status_code == 404


async def test_invalid_reference(client):
    h = await _admin(client)
    r = await client.post(f"{ADMIN}/generate", headers=h, json={"reference": "Livro Inventado 3"})
    assert r.status_code == 422


async def test_quiz_comes_with_the_story_and_can_be_edited(client):
    h = await _admin(client)
    story = await _generate(client, h)
    quiz = story["quiz"]
    assert len(quiz) == 3 and all(0 <= q["answer"] < len(q["options"]) for q in quiz)
    r = await client.put(
        f"{ADMIN}/{story['id']}",
        headers=h,
        json={
            "title": story["title"],
            "level": "both",
            "pages": [{"text": "Davi confiou em Deus."}],
            "quiz": [{"question": "Em quem Davi confiou?", "options": ["Em Deus", "Na espada"], "answer": 0}],
        },
    )
    assert r.status_code == 200, r.text
    assert r.json()["quiz"][0]["options"] == ["Em Deus", "Na espada"]
    bad = await client.put(
        f"{ADMIN}/{story['id']}",
        headers=h,
        json={
            "title": "X",
            "level": "both",
            "pages": [{"text": "a"}],
            "quiz": [{"question": "?", "options": ["a", "b"], "answer": 3}],
        },
    )
    assert bad.status_code == 422
    await client.post(f"{ADMIN}/{story['id']}/status", headers=h, json={"status": "published"})
    seen = (await client.get(f"{PUBLIC}/{story['slug']}")).json()
    assert seen["quiz"][0]["question"] == "Em quem Davi confiou?"


async def test_verses_come_from_the_bible_and_need_publishing(client):
    h = await _admin(client)
    verses = "/api/v1/admin/kids/verses"
    r = await client.post(f"{verses}/suggested", headers=h)
    assert r.json()["created"] == 30
    assert (await client.post(f"{verses}/suggested", headers=h)).json()["created"] == 0
    listed = (await client.get(verses, headers=h)).json()["verses"]
    love = next(v for v in listed if v["reference"] == "1 João 4:8")
    assert "amor" in love["text"] and love["status"] == "draft"
    assert (await client.get("/api/v1/kids/verses")).json() == {"verses": []}

    r = await client.post(verses, headers=h, json={"reference": "Salmos 100:1-2", "level": "big"})
    assert r.status_code == 201 and r.json()["reference"] == "Salmos 100:1–2"
    assert (await client.post(verses, headers=h, json={"reference": "Salmos 100:1-2"})).status_code == 409
    assert (await client.post(verses, headers=h, json={"reference": "Salmos 119"})).status_code == 422

    assert (await client.post(f"{verses}/publish-all", headers=h)).json()["published"] == 31
    small = (await client.get("/api/v1/kids/verses", params={"level": "small"})).json()["verses"]
    big = (await client.get("/api/v1/kids/verses", params={"level": "big"})).json()["verses"]
    assert any(v["reference"] == "1 João 4:8" for v in small)
    assert not any(v["reference"] == "Salmos 100:1–2" for v in small)
    assert any(v["reference"] == "Salmos 100:1–2" for v in big)
    assert set(small[0]) == {"reference", "text"}

    r = await client.patch(f"{verses}/{love['id']}", headers=h, json={"status": "draft"})
    assert r.json()["status"] == "draft"
    assert (await client.delete(f"{verses}/{love['id']}", headers=h)).status_code == 204


async def test_bibles_of_the_child_language(client):
    pt = (await client.get("/api/v1/kids/bibles")).json()["bibles"]
    assert pt[0]["code"] == "blivre"
    es = (await client.get("/api/v1/kids/bibles", params={"language": "es"})).json()["bibles"]
    assert [b["code"] for b in es] == ["rv1909"]


async def test_import_starter_stories_as_drafts(client, monkeypatch):
    from app.kids import catalog

    seed = {
        "seed": "noe",
        "verse_key_start": 1006013,
        "verse_key_end": 1006022,
        "level": "small",
        "title": "A arca de Noé",
        "summary": "Deus cuida de Noé.",
        "pages": [{"text": "Noé obedeceu a Deus.", "image_prompt": "ark"}],
        "lesson": "Obedecer a Deus é bom.",
        "family_question": "Como podemos obedecer?",
        "quiz": [
            {"question": "Quem fez a arca?", "options": ["Noé", "Davi"], "answer": 0, "explanation": "Noé."}
        ],
    }
    monkeypatch.setattr(catalog, "starter_stories", lambda language: [seed] if language == "pt-BR" else [])
    h = await _admin(client)
    assert (await client.post(f"{ADMIN}/import", headers=h)).json() == {"created": 1}
    assert (await client.post(f"{ADMIN}/import", headers=h)).json() == {"created": 0}
    row = (await client.get(ADMIN, headers=h)).json()["stories"][0]
    assert row["status"] == "draft" and row["reference"] == "Gênesis 6:13–22"
    assert (await client.get(PUBLIC)).json()["stories"] == []


async def test_story_is_translated_once_per_language_and_redone_after_edit(client):
    from sqlalchemy import func, select

    from app.db.session import get_sessionmaker
    from app.models import KidsStoryTranslation

    async def count(language):
        async with get_sessionmaker()() as db:
            return await db.scalar(
                select(func.count())
                .select_from(KidsStoryTranslation)
                .where(KidsStoryTranslation.language == language)
            )

    h = await _admin(client)
    story = await _generate(client, h)
    await client.post(f"{ADMIN}/{story['id']}/status", headers=h, json={"status": "published"})
    # Alemão: a primeira abertura traduz e salva; a segunda usa a mesma tradução
    r = await client.get(f"{PUBLIC}/{story['slug']}", params={"language": "de"})
    assert r.status_code == 200, r.text
    seen = r.json()
    assert seen["language"] == "de" and len(seen["pages"]) == 3 and len(seen["quiz"]) == 3
    assert [q["answer"] for q in seen["quiz"]] == [q["answer"] for q in story["quiz"]]
    assert seen["reference"].startswith("1 Samuel 17:45")
    again = (await client.get(f"{PUBLIC}/{story['slug']}", params={"language": "de"})).json()
    assert again["title"] == seen["title"] and await count("de") == 1
    listed = (await client.get(PUBLIC, params={"language": "de"})).json()
    assert [s["slug"] for s in listed["stories"]] == [story["slug"]] and listed["preparing"] == 0

    # Corrigir a história apaga as traduções (refeitas do texto novo)
    await client.put(
        f"{ADMIN}/{story['id']}",
        headers=h,
        json={"title": "Novo", "level": "both", "pages": [{"text": "Davi confiou."}]},
    )
    assert await count("de") == 0

    assert (await client.get(PUBLIC, params={"language": "xx-YY"})).status_code == 422


async def test_verses_and_bibles_in_other_languages_come_from_the_bible(client):
    h = await _admin(client)
    await client.post("/api/v1/admin/kids/verses/suggested", headers=h)
    await client.post("/api/v1/admin/kids/verses/publish-all", headers=h)
    en = (await client.get("/api/v1/kids/verses", params={"language": "en"})).json()["verses"]
    love = next(v for v in en if v["reference"] == "1 John 4:8")
    assert "God is love" in love["text"]
    es = (await client.get("/api/v1/kids/verses", params={"language": "es"})).json()["verses"]
    assert any(v["reference"] == "1 Juan 4:8" for v in es)
    # Sem Bíblia no idioma: a em inglês
    fr = (await client.get("/api/v1/kids/verses", params={"language": "fr"})).json()["verses"]
    assert any("God is love" in v["text"] for v in fr)
    assert (await client.get("/api/v1/kids/bibles", params={"language": "en"})).json()["bibles"][0][
        "code"
    ] == "web"
    assert (await client.get("/api/v1/kids/bibles", params={"language": "fr"})).json()["bibles"][0][
        "code"
    ] == "web"


async def test_prepare_language_without_login(client):
    assert (await client.post("/api/v1/kids/languages/pt-BR/prepare")).json() == {"status": "ready"}
    r = await client.post("/api/v1/kids/languages/de/prepare")
    assert r.status_code == 503  # sem os textos em inglês do app ainda não dá para traduzir
    assert (await client.post("/api/v1/kids/languages/xx-YY/prepare")).status_code == 422


async def test_video_upload_in_chunks_publish_and_play_by_parts(client, monkeypatch):
    from app.kids import videos

    monkeypatch.setattr(videos, "CHUNK_SIZE", 10)
    h = await _admin(client)
    base = "/api/v1/admin/kids/videos"
    payload = bytes(range(25))  # 3 pedaços: 10 + 10 + 5
    r = await client.post(base, headers=h, json={"title": "Ovelhinha", "mime": "video/mp4", "size": 25})
    assert r.status_code == 201, r.text
    video = r.json()
    vid = video["id"]
    assert video["status"] == "uploading" and video["chunks"] == 3

    # pedaço com tamanho errado não entra; os certos entram em qualquer ordem
    bad = await client.put(f"{base}/{vid}/chunks/0", headers=h, content=payload[:9])
    assert bad.status_code == 422
    assert (await client.post(f"{base}/{vid}/complete", headers=h)).status_code == 422
    for n in (2, 0, 1):
        r = await client.put(f"{base}/{vid}/chunks/{n}", headers=h, content=payload[n * 10 : n * 10 + 10])
        assert r.status_code == 200, r.text
    done = (await client.post(f"{base}/{vid}/complete", headers=h)).json()
    assert done["status"] == "draft" and done["received_bytes"] == 25

    # rascunho não aparece nem toca
    assert (await client.get("/api/v1/kids/videos")).json() == {"videos": []}
    assert (await client.get(f"/api/v1/kids/videos/{vid}/file")).status_code == 404

    r = await client.put(f"{base}/{vid}/poster", headers={**h, "Content-Type": "image/png"}, content=b"png!")
    assert r.json()["has_poster"]
    r = await client.patch(f"{base}/{vid}", headers=h, json={"status": "published", "level": "small"})
    assert r.json()["status"] == "published"

    listed = (await client.get("/api/v1/kids/videos", params={"level": "small"})).json()["videos"]
    assert [v["title"] for v in listed] == ["Ovelhinha"] and listed[0]["has_poster"]
    # outro idioma sem vídeos próprios mostra os em português
    assert len((await client.get("/api/v1/kids/videos", params={"language": "de"})).json()["videos"]) == 1

    full = await client.get(f"/api/v1/kids/videos/{vid}/file")
    assert full.status_code == 200 and full.content == payload and full.headers["accept-ranges"] == "bytes"
    part = await client.get(f"/api/v1/kids/videos/{vid}/file", headers={"Range": "bytes=8-21"})
    assert part.status_code == 206 and part.content == payload[8:22]
    assert part.headers["content-range"] == "bytes 8-21/25"
    tail = await client.get(f"/api/v1/kids/videos/{vid}/file", headers={"Range": "bytes=-3"})
    assert tail.content == payload[22:]
    assert (
        await client.get(f"/api/v1/kids/videos/{vid}/file", headers={"Range": "bytes=30-"})
    ).status_code == 416
    assert (await client.get(f"/api/v1/kids/videos/{vid}/poster")).content == b"png!"

    # só o administrador envia
    await register(client, "bia@example.com", "Bia")
    bia = bearer(await login(client, "bia@example.com"))
    assert (
        await client.post(base, headers=bia, json={"title": "x", "mime": "video/mp4", "size": 5})
    ).status_code == 403
    assert (await client.put(f"{base}/{vid}/chunks/0", headers=bia, content=b"x")).status_code == 403

    assert (await client.delete(f"{base}/{vid}", headers=h)).status_code == 204
    assert (await client.get("/api/v1/kids/videos")).json() == {"videos": []}


async def test_video_rejects_other_files(client):
    h = await _admin(client)
    r = await client.post(
        "/api/v1/admin/kids/videos", headers=h, json={"title": "x", "mime": "application/zip", "size": 5}
    )
    assert r.status_code == 422
