from tests.conftest import bearer, login, make_admin, register


async def test_covers_public_and_admin(client):
    assert (await client.get("/api/v1/learn/covers")).json() == {"covers": {}}
    await register(client)
    h = bearer(await login(client))
    assert (await client.get("/api/v1/admin/learn/covers", headers=h)).status_code == 403
    await make_admin()
    h = bearer(await login(client))
    items = (await client.get("/api/v1/admin/learn/covers", headers=h)).json()["items"]
    assert len(items) == 96 and items[0] == {"key": "book:GEN", "image_id": None}
    # Sem chave da OpenAI configurada, não gera (e não quebra)
    assert (await client.post("/api/v1/admin/learn/covers/book:GEN", headers=h)).status_code == 503
    assert (await client.post("/api/v1/admin/learn/covers/book:XXX", headers=h)).status_code == 404
    assert (await client.delete("/api/v1/admin/learn/covers/book:GEN", headers=h)).status_code == 204
