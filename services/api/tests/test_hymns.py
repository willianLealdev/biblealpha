async def test_list_and_search(client):
    r = (await client.get("/api/v1/hymns")).json()
    assert r["total"] == 640 and len(r["hymns"]) == 640
    assert r["hymns"][0]["n"] == 1 and r["hymns"][0]["title"] == "Chuvas de Graça"
    found = (await client.get("/api/v1/hymns", params={"q": "chuvas de graca"})).json()["hymns"]
    assert found[0]["n"] == 1
    assert (await client.get("/api/v1/hymns", params={"q": "15"})).json()["hymns"][0]["n"] == 15


async def test_get_hymn(client):
    h = (await client.get("/api/v1/hymns/1")).json()
    assert h["n"] == 1 and h["verses"] and h["chorus"] and h["prev"] is None and h["next"] == 2
    assert (await client.get("/api/v1/hymns/641")).status_code == 404
