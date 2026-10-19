import io

from docx import Document

from tests.conftest import bearer, login, make_admin, register


async def _new(client, tokens, **body):
    r = await client.post(
        "/api/v1/sermons",
        headers=bearer(tokens),
        json={"title": "A dor do pecado", "kind": "expository", **body},
    )
    assert r.status_code == 201, r.text
    return r.json()


async def test_create_from_template_save_and_versions(client):
    await register(client)
    tokens = await login(client)
    s = await _new(client, tokens, main_reference="Romanos 6:23", duration_minutes=35, folder="Domingo")
    sections = [b["title"] for b in s["content"]["blocks"] if b["type"] == "section"]
    assert sections[0] == "Introdução" and "Conclusão" in sections

    blocks = s["content"]["blocks"] + [
        {
            "id": "sc1",
            "type": "scripture",
            "reference": "Romanos 6:23",
            "translation": "BLIVRE",
            "verse_key_start": 45006023,
            "verse_key_end": 45006023,
            "verses": [{"chapter": 6, "verse": 23, "text": "Porque o salário do pecado é a morte..."}],
        },
        {"id": "n1", "type": "note", "text": "Contar a ilustração do farol"},
    ]
    r = await client.put(
        f"/api/v1/sermons/{s['id']}",
        headers=bearer(tokens),
        json={"base_version": 1, "content": {"blocks": blocks}, "tags": ["pecado"]},
    )
    assert r.status_code == 200 and r.json()["version"] == 2

    # Edição em outro aparelho com versão antiga: conflito, nada é sobrescrito
    stale = await client.put(
        f"/api/v1/sermons/{s['id']}", headers=bearer(tokens), json={"base_version": 1, "title": "Outro"}
    )
    assert stale.status_code == 409 and stale.json()["error"]["code"] == "version_conflict"

    versions = (await client.get(f"/api/v1/sermons/{s['id']}/versions", headers=bearer(tokens))).json()[
        "versions"
    ]
    assert len(versions) == 1
    restored = (
        await client.post(
            f"/api/v1/sermons/{s['id']}/versions/{versions[0]['id']}/restore", headers=bearer(tokens)
        )
    ).json()
    assert restored["version"] == 3

    listing = (await client.get("/api/v1/sermons?q=pecado", headers=bearer(tokens))).json()
    assert [x["title"] for x in listing["sermons"]] == ["A dor do pecado"] and listing["folders"] == [
        "Domingo"
    ]


async def test_invalid_blocks_rejected(client):
    await register(client)
    tokens = await login(client)
    s = await _new(client, tokens)
    r = await client.put(
        f"/api/v1/sermons/{s['id']}",
        headers=bearer(tokens),
        json={"base_version": 1, "content": {"blocks": [{"id": "x", "type": "video"}]}},
    )
    assert r.status_code == 422


async def test_trash_restore_duplicate_and_privacy(client):
    await register(client, email="ana@example.com")
    await register(client, email="bruno@example.com", name="Bruno")
    ana = await login(client, email="ana@example.com")
    bruno = await login(client, email="bruno@example.com")
    s = await _new(client, ana)
    assert (await client.get(f"/api/v1/sermons/{s['id']}", headers=bearer(bruno))).status_code == 404
    assert (
        await client.put(
            f"/api/v1/sermons/{s['id']}", headers=bearer(bruno), json={"base_version": 1, "title": "x"}
        )
    ).status_code == 404

    dup = (await client.post(f"/api/v1/sermons/{s['id']}/duplicate", headers=bearer(ana))).json()
    assert dup["title"] == "A dor do pecado (cópia)"
    assert (await client.delete(f"/api/v1/sermons/{s['id']}", headers=bearer(ana))).status_code == 204
    trash = (await client.get("/api/v1/sermons?trash=true", headers=bearer(ana))).json()["sermons"]
    assert [x["id"] for x in trash] == [s["id"]]
    assert (await client.post(f"/api/v1/sermons/{s['id']}/restore", headers=bearer(ana))).json()[
        "deleted_at"
    ] is None


async def test_pulpit_notes_and_docx(client):
    await register(client)
    tokens = await login(client)
    s = await _new(client, tokens, main_reference="Romanos 6:23", objective="Mostrar a graça")
    blocks = [
        {"id": "s1", "type": "section", "role": "intro", "title": "Introdução"},
        {"id": "t1", "type": "text", "text": "O pecado tem **consequências**.\n- Separação\n- Morte"},
        {
            "id": "sc",
            "type": "scripture",
            "reference": "Romanos 6:23",
            "translation": "BLIVRE",
            "verse_key_start": 45006023,
            "verse_key_end": 45006023,
            "verses": [{"chapter": 6, "verse": 23, "text": "Porque o salário do pecado é a morte"}],
        },
    ]
    await client.put(
        f"/api/v1/sermons/{s['id']}",
        headers=bearer(tokens),
        json={"base_version": 1, "content": {"blocks": blocks}},
    )
    notes = (
        await client.post(
            f"/api/v1/sermons/{s['id']}/pulpit-notes",
            headers=bearer(tokens),
            json={"text": "Encurtar a introdução"},
        )
    ).json()
    assert "Encurtar a introdução" in notes["pulpit_notes"]

    r = await client.get(f"/api/v1/sermons/{s['id']}/export.docx", headers=bearer(tokens))
    assert r.status_code == 200 and "attachment" in r.headers["content-disposition"]
    doc = Document(io.BytesIO(r.content))
    text = "\n".join(p.text for p in doc.paragraphs)
    assert (
        "A dor do pecado" in text
        and "Romanos 6:23 (BLIVRE)" in text
        and "Separação" in text
        and "Mostrar a graça" in text
    )

    # PDF de verdade, gerado no servidor (com acentos)
    r = await client.get(f"/api/v1/sermons/{s['id']}/export.pdf", headers=bearer(tokens))
    assert r.status_code == 200 and r.headers["content-type"] == "application/pdf"
    assert r.content.startswith(b"%PDF") and ".pdf" in r.headers["content-disposition"]
    import pathlib
    import tempfile

    pathlib.Path(tempfile.gettempdir(), "ba-sermon-test.pdf").write_bytes(r.content)

    # Slides: estrutura para o modo Apresentar e arquivo PowerPoint
    sl = (await client.get(f"/api/v1/sermons/{s['id']}/slides", headers=bearer(tokens))).json()["slides"]
    assert sl[0]["kind"] == "title" and any(x["kind"] == "scripture" for x in sl)
    r = await client.get(f"/api/v1/sermons/{s['id']}/export.pptx", headers=bearer(tokens))
    assert r.status_code == 200 and r.content[:2] == b"PK" and ".pptx" in r.headers["content-disposition"]
    pathlib.Path(tempfile.gettempdir(), "ba-sermon-test.pptx").write_bytes(r.content)


async def test_generate_with_ai_and_assist(client):
    # Gerar ministração com IA é exclusivo do administrador
    await register(client)
    await make_admin("ana@example.com")
    tokens = await login(client)
    r = await client.post(
        "/api/v1/sermons/generate",
        headers=bearer(tokens),
        json={
            "theme": "A dor do pecado",
            "main_reference": "Romanos 6:23",
            "duration_minutes": 35,
            "level": "advanced",
            "kind": "thematic",
        },
    )
    assert r.status_code == 201, r.text
    s = r.json()
    types = [b["type"] for b in s["content"]["blocks"]]
    assert types[0] == "scripture" and s["content"]["blocks"][0]["verses"][0]["verse"] == 23
    assert "section" in types and s["duration_minutes"] == 35

    a = await client.post(
        f"/api/v1/sermons/{s['id']}/assist",
        headers=bearer(tokens),
        json={"action": "expand", "text": "O salário do pecado"},
    )
    assert a.status_code == 200 and a.json()["suggestion"]

    bad = await client.post(
        "/api/v1/sermons/generate",
        headers=bearer(tokens),
        json={"theme": "x y", "main_reference": "Livro 1:1"},
    )
    assert bad.status_code == 422


async def test_users_only_get_clarifying_ai(client):
    """Usuário comum: a IA esclarece dúvidas, mas não cria ministrações nem estudos para ministrar."""
    await register(client)
    tokens = await login(client)
    gen = await client.post(
        "/api/v1/sermons/generate",
        headers=bearer(tokens),
        json={"theme": "A dor do pecado", "main_reference": "Romanos 6:23"},
    )
    assert gen.status_code == 403

    s = await _new(client, tokens)
    # Nenhuma ação do assistente de blocos: a IA não escreve nem edita a ministração do usuário
    for action in (
        "outline",
        "study",
        "expand",
        "organize",
        "examples",
        "questions",
        "summarize",
        "explain",
        "context",
        "related",
        "word",
        "issues",
    ):
        r = await client.post(
            f"/api/v1/sermons/{s['id']}/assist",
            headers=bearer(tokens),
            json={"action": action, "text": "Romanos 6:23"},
        )
        assert r.status_code == 403 and r.json()["error"]["code"] == "admin_only", action
    # "Perguntas para a IA": só respostas, com ou sem passagem
    q = await client.post(
        "/api/v1/ai/ask",
        headers=bearer(tokens),
        json={"translation": "blivre", "mode": "simple", "question": "Quem era Lázaro em João 11?"},
    )
    assert q.status_code == 200, q.text

    sermon_mode = await client.post(
        "/api/v1/ai/ask",
        headers=bearer(tokens),
        json={"translation": "blivre", "mode": "sermon", "verse_key_start": 45006023},
    )
    assert sermon_mode.status_code == 403
    assert "sermon" not in (await client.get("/api/v1/ai/status", headers=bearer(tokens))).json()["modes"]
