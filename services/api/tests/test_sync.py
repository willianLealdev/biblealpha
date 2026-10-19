import uuid
from datetime import UTC, datetime, timedelta

from tests.conftest import bearer, login, register

JOHN_3_16 = 43003016


def ts(offset_seconds: int = 0) -> str:
    return (datetime.now(UTC) + timedelta(seconds=offset_seconds)).isoformat()


async def _sync(client, tokens, cursor=0, changes=None):
    r = await client.post(
        "/api/v1/sync", headers=bearer(tokens), json={"cursor": cursor, "changes": changes or []}
    )
    assert r.status_code == 200, r.text
    return r.json()


def by_entity(changes, entity):
    return [c for c in changes if c["entity"] == entity]


async def test_first_sync_creates_default_categories(client):
    await register(client)
    tokens = await login(client)
    body = await _sync(client, tokens)
    cats = by_entity(body["changes"], "category")
    assert [c["data"]["name"] for c in cats] == [
        "Promessa",
        "Ensinamento",
        "Aplicação pessoal",
        "Advertência",
        "Profecia",
    ]
    assert body["cursor"] > 0
    # Sem mudanças, nada novo
    assert (await _sync(client, tokens, body["cursor"]))["changes"] == []


async def test_highlight_bookmark_annotation_roundtrip_between_devices(client):
    await register(client)
    phone = await login(client)
    laptop = await login(client)
    first = await _sync(client, phone)
    cat_id = by_entity(first["changes"], "category")[0]["id"]

    hl, bm, note = str(uuid.uuid4()), str(uuid.uuid4()), str(uuid.uuid4())
    pushed = await _sync(
        client,
        phone,
        first["cursor"],
        [
            {
                "entity": "highlight",
                "id": hl,
                "client_updated_at": ts(),
                "data": {"verse_key": JOHN_3_16, "category_id": cat_id},
            },
            {
                "entity": "bookmark",
                "id": bm,
                "client_updated_at": ts(),
                "data": {
                    "verse_key_start": JOHN_3_16,
                    "verse_key_end": 43003018,
                    "translation_code": "blivre",
                },
            },
            {
                "entity": "annotation",
                "id": note,
                "client_updated_at": ts(),
                "data": {
                    "scope": "verse",
                    "verse_key_start": JOHN_3_16,
                    "verse_key_end": JOHN_3_16,
                    "title": "Amor de Deus",
                    "body": "O amor vem antes da resposta humana.",
                    "tags": ["amor", "salvação"],
                },
            },
        ],
    )
    assert pushed["notices"] == []

    # Outro aparelho recebe tudo
    other = await _sync(client, laptop)
    assert by_entity(other["changes"], "highlight")[0]["data"]["verse_key"] == JOHN_3_16
    assert by_entity(other["changes"], "bookmark")[0]["data"]["verse_key_end"] == 43003018
    got_note = by_entity(other["changes"], "annotation")[0]
    assert got_note["data"]["tags"] == ["amor", "salvação"]

    # Apagar o destaque no laptop chega ao celular como exclusão
    after = await _sync(
        client,
        laptop,
        other["cursor"],
        [{"entity": "highlight", "id": hl, "deleted": True, "client_updated_at": ts(5)}],
    )
    phone_view = await _sync(client, phone, pushed["cursor"])
    deleted = by_entity(phone_view["changes"], "highlight")
    assert deleted and deleted[0]["deleted"] is True
    assert after["cursor"] >= phone_view["cursor"] - 1


async def test_last_write_wins_for_highlights(client):
    await register(client)
    tokens = await login(client)
    first = await _sync(client, tokens)
    cats = [c["id"] for c in by_entity(first["changes"], "category")]
    hl = str(uuid.uuid4())
    await _sync(
        client,
        tokens,
        0,
        [
            {
                "entity": "highlight",
                "id": hl,
                "client_updated_at": ts(10),
                "data": {"verse_key": JOHN_3_16, "category_id": cats[1]},
            }
        ],
    )
    # Edição mais antiga (feita offline antes) não sobrescreve
    await _sync(
        client,
        tokens,
        0,
        [
            {
                "entity": "highlight",
                "id": hl,
                "client_updated_at": ts(0),
                "data": {"verse_key": JOHN_3_16, "category_id": cats[3]},
            }
        ],
    )
    state = await _sync(client, tokens)
    assert by_entity(state["changes"], "highlight")[0]["data"]["category_id"] == cats[1]


async def test_annotation_conflict_keeps_both_versions(client):
    await register(client)
    phone = await login(client)
    laptop = await login(client)
    note = str(uuid.uuid4())
    base = {"scope": "chapter", "verse_key_start": 19023000, "verse_key_end": 19023000, "title": "Salmo 23"}
    created = await _sync(
        client,
        phone,
        0,
        [{"entity": "annotation", "id": note, "client_updated_at": ts(), "data": {**base, "body": "v1"}}],
    )
    base_rev = by_entity(created["changes"], "annotation")[0]["rev"]

    # Laptop edita (online)
    await _sync(
        client,
        laptop,
        0,
        [
            {
                "entity": "annotation",
                "id": note,
                "base_rev": base_rev,
                "client_updated_at": ts(1),
                "data": {**base, "body": "editado no laptop"},
            }
        ],
    )
    # Celular editou offline a partir da v1 e só agora sincroniza
    result = await _sync(
        client,
        phone,
        created["cursor"],
        [
            {
                "entity": "annotation",
                "id": note,
                "base_rev": base_rev,
                "client_updated_at": ts(2),
                "data": {**base, "body": "editado no celular"},
            }
        ],
    )

    assert result["notices"][0]["conflict"] == "copied"
    notes = by_entity((await _sync(client, phone))["changes"], "annotation")
    bodies = sorted(n["data"]["body"] for n in notes)
    assert bodies == ["editado no celular", "editado no laptop"]
    assert any("(conflito)" in (n["data"]["title"] or "") for n in notes)


async def test_cannot_touch_other_users_data(client):
    await register(client, email="ana@example.com")
    await register(client, email="bruno@example.com", name="Bruno")
    ana = await login(client, email="ana@example.com")
    bruno = await login(client, email="bruno@example.com")
    ana_cat = by_entity((await _sync(client, ana))["changes"], "category")[0]["id"]
    note = str(uuid.uuid4())
    await _sync(
        client,
        ana,
        0,
        [
            {
                "entity": "annotation",
                "id": note,
                "client_updated_at": ts(),
                "data": {
                    "scope": "verse",
                    "verse_key_start": JOHN_3_16,
                    "verse_key_end": JOHN_3_16,
                    "body": "da Ana",
                },
            }
        ],
    )

    # Bruno tenta sobrescrever a anotação da Ana pelo mesmo id e usar a categoria dela
    result = await _sync(
        client,
        bruno,
        0,
        [
            {
                "entity": "annotation",
                "id": note,
                "client_updated_at": ts(9),
                "data": {
                    "scope": "verse",
                    "verse_key_start": JOHN_3_16,
                    "verse_key_end": JOHN_3_16,
                    "body": "hack",
                },
            },
            {
                "entity": "highlight",
                "id": str(uuid.uuid4()),
                "client_updated_at": ts(),
                "data": {"verse_key": JOHN_3_16, "category_id": ana_cat},
            },
        ],
    )
    errors = {n["entity"]: n["error"] for n in result["notices"]}
    assert errors == {"annotation": "forbidden", "highlight": "invalid_category"}
    assert all(c["entity"] == "category" for c in result["changes"])
    ana_notes = by_entity((await _sync(client, ana))["changes"], "annotation")
    assert ana_notes[0]["data"]["body"] == "da Ana"


async def test_invalid_data_is_rejected_per_item(client):
    await register(client)
    tokens = await login(client)
    result = await _sync(
        client,
        tokens,
        0,
        [
            {
                "entity": "bookmark",
                "id": str(uuid.uuid4()),
                "client_updated_at": ts(),
                "data": {"verse_key_start": 99001001, "verse_key_end": 99001001},
            },
            {
                "entity": "category",
                "id": str(uuid.uuid4()),
                "client_updated_at": ts(),
                "data": {"name": "Minha cor", "color": "orange"},
            },
        ],
    )
    assert result["notices"] == [{"entity": "bookmark", "id": result["notices"][0]["id"], "error": "invalid"}]
    assert "Minha cor" in [c["data"]["name"] for c in by_entity(result["changes"], "category")]


async def test_reading_progress_and_history(client):
    await register(client)
    tokens = await login(client)
    assert (await client.get("/api/v1/me/reading-progress", headers=bearer(tokens))).json() == {
        "progress": None
    }
    r = await client.put(
        "/api/v1/me/reading-progress",
        headers=bearer(tokens),
        json={"translation_code": "blivre", "book": "ROM", "chapter": 8, "verse": 28},
    )
    assert r.json()["progress"]["book"] == "ROM"
    await client.put(
        "/api/v1/me/reading-progress",
        headers=bearer(tokens),
        json={"translation_code": "blivre", "book": "ROM", "chapter": 8},
    )
    history = (await client.get("/api/v1/me/reading-history", headers=bearer(tokens))).json()["history"]
    assert history == [{"book": "ROM", "chapter": 8, "read_on": history[0]["read_on"]}]
    bad = await client.put(
        "/api/v1/me/reading-progress",
        headers=bearer(tokens),
        json={"translation_code": "blivre", "book": "ROM", "chapter": 17},
    )
    assert bad.status_code == 422


async def test_export_and_delete_include_study_data(client):
    await register(client)
    tokens = await login(client)
    await _sync(
        client,
        tokens,
        0,
        [
            {
                "entity": "annotation",
                "id": str(uuid.uuid4()),
                "client_updated_at": ts(),
                "data": {
                    "scope": "verse",
                    "verse_key_start": JOHN_3_16,
                    "verse_key_end": JOHN_3_16,
                    "body": "nota",
                },
            }
        ],
    )
    export = (await client.get("/api/v1/me/export", headers=bearer(tokens))).json()
    assert export["study"]["annotation"][0]["data"]["body"] == "nota"
    assert len(export["study"]["category"]) == 5

    from tests.conftest import PASSWORD

    await client.request("DELETE", "/api/v1/me", headers=bearer(tokens), json={"password": PASSWORD})
    from sqlalchemy import func, select

    from app.db.session import get_sessionmaker
    from app.models import Annotation, HighlightCategory

    async with get_sessionmaker()() as db:
        assert await db.scalar(select(func.count()).select_from(Annotation)) == 0
        assert await db.scalar(select(func.count()).select_from(HighlightCategory)) == 0
