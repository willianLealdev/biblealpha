import base64
import io

from PIL import Image

from tests.conftest import bearer, login, register

URL = "/api/v1/share/verse-image"
BODY = {"text": "No princípio criou Deus os céus e a terra.", "reference": "Gênesis 1:1 (ARC)"}


def _size(content: bytes) -> tuple[int, int]:
    return Image.open(io.BytesIO(content)).size


async def test_needs_login(client):
    assert (await client.post(URL, json=BODY)).status_code == 401


async def test_feed_and_story(client):
    await register(client)
    h = bearer(await login(client))
    r = await client.post(URL, json={**BODY, "format": "feed", "preset": "ocean"}, headers=h)
    assert r.status_code == 200 and r.headers["content-type"] == "image/jpeg"
    assert _size(r.content) == (1080, 1350)
    r = await client.post(URL, json={**BODY, "format": "story"}, headers=h)
    assert _size(r.content) == (1080, 1920)
    presets = (await client.get("/api/v1/share/presets")).json()["presets"]
    assert any(p["id"] == "gold" for p in presets)


async def test_photo_background(client):
    await register(client)
    h = bearer(await login(client))
    buf = io.BytesIO()
    Image.new("RGB", (400, 300), (30, 90, 160)).save(buf, "JPEG")
    photo = base64.b64encode(buf.getvalue()).decode()
    r = await client.post(URL, json={**BODY, "photo": photo}, headers=h)
    assert r.status_code == 200 and _size(r.content) == (1080, 1350)
    bad = base64.b64encode(b"not an image").decode()
    r = await client.post(URL, json={**BODY, "photo": bad}, headers=h)
    assert r.status_code == 400


async def test_library_of_someone_else(client):
    await register(client)
    h = bearer(await login(client))
    r = await client.post(URL, json={**BODY, "library_id": "00000000-0000-0000-0000-000000000001"}, headers=h)
    assert r.status_code == 404
