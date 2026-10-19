"""Idiomas da interface instalados pelo painel, sem atualizar o app.

Português, inglês e espanhol vêm dentro do app. Para outro idioma, o administrador cria o
idioma no painel; o app envia os textos em inglês e a IA traduz (com os nomes dos 66 livros).
O administrador pode revisar e corrigir qualquer texto. O app baixa o dicionário quando o
usuário escolhe o idioma e confere a versão ao abrir.
"""

import asyncio
import logging
import re

from fastapi import APIRouter, Depends, Response
from pydantic import BaseModel, Field
from sqlalchemy import delete
from sqlalchemy.ext.asyncio import AsyncSession

from app.ai import service as ai_service
from app.ai.provider import ProviderError, get_provider
from app.api.deps import CurrentUser, current_user, require_role
from app.bible.books import all_books
from app.core import ratelimit, world_data
from app.core.errors import AppError
from app.core.locales import BUILTIN, LOCALE_PATTERN, language_name
from app.db.session import get_db
from app.models import SystemSetting
from app.services import bible as bible_service
from app.services.settings import get_setting, set_setting

log = logging.getLogger(__name__)
router = APIRouter(tags=["languages"])
admin_only = require_role("admin")

LIST_KEY = "ui.languages"
_DICT_KEY = "ui.dict.{code}"
_PLACEHOLDER = re.compile(r"\{\w+\}")
_CHUNK = 120

BUILTIN_INFO = [
    {"code": "pt-BR", "name": "Português", "builtin": True, "version": 0, "enabled": True},
    {"code": "en", "name": "English", "builtin": True, "version": 0, "enabled": True},
    {"code": "es", "name": "Español", "builtin": True, "version": 0, "enabled": True},
]

TRANSLATE_SYSTEM = (
    "You translate the user interface of BibleAlpha, a Bible study app for Christians. "
    "Translate each English text into the requested language, natural and concise, as a native "
    "speaker would see it in a mobile app. Keep placeholders like {name} or {pct} exactly as they are, "
    "keep markdown, emojis and line breaks. Use the usual Christian terminology of that language "
    "(for example the common names of Bible books in the most used Protestant Bible of that language). "
    "Return every key you received, with the same key."
)

_SCHEMA = {
    "type": "object",
    "properties": {
        "items": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {"key": {"type": "string"}, "text": {"type": "string"}},
                "required": ["key", "text"],
                "additionalProperties": False,
            },
        }
    },
    "required": ["items"],
    "additionalProperties": False,
}


def _flatten(node: dict, prefix: str = "") -> dict[str, str]:
    out: dict[str, str] = {}
    for k, v in node.items():
        path = f"{prefix}{k}"
        if isinstance(v, dict):
            out.update(_flatten(v, f"{path}."))
        elif isinstance(v, str):
            out[path] = v
    return out


def _unflatten(flat: dict[str, str]) -> dict:
    root: dict = {}
    for path, text in flat.items():
        node = root
        *parents, leaf = path.split(".")
        for p in parents:
            node = node.setdefault(p, {})
        node[leaf] = text
    return root


async def _languages(db: AsyncSession) -> list[dict]:
    return list((await get_setting(db, LIST_KEY)).get("items", []))


async def _translate(db: AsyncSession, user_id, code: str, flat: dict[str, str]) -> dict[str, str]:
    """Traduz em blocos; um texto que a IA não devolver (ou que perder um {marcador}) fica em inglês."""
    cfg = (await get_setting(db, "ai.models"))["translate"]
    provider = get_provider(cfg["model"])
    out: dict[str, str] = {}
    keys = list(flat)
    for i in range(0, len(keys), _CHUNK):
        part = {k: flat[k] for k in keys[i : i + _CHUNK]}
        lines = "\n".join(f"{k}\t{v!r}" for k, v in part.items())
        prompt = (
            f"<target_language>{language_name(code)} ({code})</target_language>\n"
            f"<texts>\n{lines}\n</texts>\nEach line is: key<TAB>English text (Python string literal)."
        )
        try:
            data, completion = await provider.complete_json(
                model=cfg["model"],
                system=TRANSLATE_SYSTEM,
                prompt=prompt,
                schema=_SCHEMA,
                effort=cfg["effort"],
                max_tokens=int(cfg["max_tokens"]),
            )
        except ProviderError as e:
            # Esse bloco fica em inglês por enquanto e é traduzido de novo no próximo pedido
            log.warning("tradução da interface para %s: bloco falhou (%s)", code, e.code)
            continue
        await ai_service.record_usage(
            db,
            user_id=user_id,
            plan="admin" if user_id else "system",
            feature="ui_translation",
            provider=provider.name,
            completion=completion,
            status="ok",
        )
        for item in data.get("items", []) if isinstance(data, dict) else []:
            key, text = item.get("key"), item.get("text")
            if key in part and isinstance(text, str) and text.strip():
                if sorted(_PLACEHOLDER.findall(text)) == sorted(_PLACEHOLDER.findall(part[key])):
                    out[key] = text
    return out


SOURCE_KEY = "ui.source"


async def _translate_language(code: str, user_id=None) -> None:
    """Traduz (ou completa) os textos do app e os nomes dos livros num idioma, em segundo plano.
    Usa o dicionário em inglês enviado pelo app do administrador (ui.source)."""
    from app.db.session import get_sessionmaker

    async with get_sessionmaker()() as db:
        source = (await get_setting(db, SOURCE_KEY)).get("dictionary")
        if not source:
            return
        key = _DICT_KEY.format(code=code)
        data = await get_setting(db, key)
        flat_source = _flatten(source)
        current = _flatten(data.get("dictionary", {}))
        missing = {k: v for k, v in flat_source.items() if k not in current}
        books = dict(data.get("books", {}))
        try:
            if missing:
                current.update(await _translate(db, user_id, code, missing))
            if len(books) < 66:
                src = {b.code: f"{b.en.name}|{b.en.abbr}" for b in all_books() if b.code not in books}
                for bcode, text in (await _translate(db, user_id, code, src)).items():
                    name, _, abbr = text.partition("|")
                    if name.strip():
                        books[bcode] = {"name": name.strip(), "abbr": (abbr or name).strip()[:12]}
        except AppError:
            pass  # IA fora do ar: fica marcado como "preparing" e tenta de novo no próximo pedido
        version = int(data.get("version", 0)) + 1
        await set_setting(db, key, {"version": version, "dictionary": _unflatten(current), "books": books})
        items = await _languages(db)
        meta = next((x for x in items if x["code"] == code), None)
        ready = len(current) >= len(flat_source) * 0.9
        if meta is None:
            native = next((n for c, n, *_ in world_data.LANGUAGES if c == code), code)
            meta = {"code": code, "name": native, "direction": "rtl" if code in world_data.RTL else "ltr"}
            items.append(meta)
        meta.update(enabled=ready, version=version, status="ready" if ready else "preparing")
        await set_setting(db, LIST_KEY, {"items": items})
        await db.commit()


_running: set[str] = set()


def _start(code: str) -> None:
    if code in _running:
        return
    _running.add(code)

    async def job():
        try:
            await _translate_language(code)
        finally:
            _running.discard(code)

    asyncio.create_task(job())


# ---------- público (o app) ----------


@router.get("/languages/world")
async def world(db: AsyncSession = Depends(get_db)) -> dict:
    """Idiomas e países para o cadastro e o perfil, com a Bíblia de cada idioma (quando houver)."""
    items = {x["code"]: x for x in await _languages(db)}
    bibles = await bible_service.language_bibles(db)
    out = []
    for code, native, english, _iso3 in world_data.LANGUAGES:
        meta = items.get(code)
        status = (
            "ready"
            if code in BUILTIN
            else (meta.get("status", "ready") if meta and meta.get("enabled") else "new")
        )
        if meta and not meta.get("enabled") and meta.get("status") == "preparing":
            status = "preparing"
        out.append(
            {
                "code": code,
                "name": native,
                "name_en": english,
                "rtl": code in world_data.RTL,
                "status": status,
                "bible": bibles.pick(code),
            }
        )
    countries = [{"code": c, "name_en": n, "languages": langs} for c, n, langs in world_data.COUNTRIES]
    return {"languages": out, "countries": countries}


@router.post("/languages/{code}/prepare")
async def prepare(
    code: str, cu: CurrentUser = Depends(current_user), db: AsyncSession = Depends(get_db)
) -> dict:
    """O usuário escolheu um idioma: se o app ainda não estiver nele, a tradução começa agora
    (uma vez por idioma; depois vale para todos)."""
    if code in BUILTIN:
        return {"status": "ready"}
    if code not in world_data.LANGUAGE_CODES:
        raise AppError(404, "language_not_found", "Language not found")
    await ratelimit.hit(f"lang-prepare:{cu.user.id}", limit=10, window_seconds=3600)
    meta = next((x for x in await _languages(db) if x["code"] == code), None)
    if meta and meta.get("enabled"):
        return {"status": "ready"}
    if not (await get_setting(db, SOURCE_KEY)).get("dictionary"):
        raise AppError(503, "language_unavailable", "This language is not available yet")
    _start(code)
    return {"status": "preparing"}


@router.get("/languages")
async def list_languages(db: AsyncSession = Depends(get_db)) -> list[dict]:
    extra = [x for x in await _languages(db) if x.get("enabled")]
    return BUILTIN_INFO + [{**x, "builtin": False} for x in extra]


@router.get("/languages/{code}")
async def get_language(code: str, response: Response, db: AsyncSession = Depends(get_db)) -> dict:
    meta = next((x for x in await _languages(db) if x["code"] == code and x.get("enabled")), None)
    if meta is None:
        raise AppError(404, "language_not_found", "Language not found")
    data = await get_setting(db, _DICT_KEY.format(code=code))
    response.headers["Cache-Control"] = "no-cache"
    return {
        "code": code,
        "name": meta["name"],
        "version": data.get("version", 0),
        "direction": meta.get("direction", "ltr"),
        "dictionary": data.get("dictionary", {}),
        "books": data.get("books", {}),
    }


# ---------- painel ----------


class CreateIn(BaseModel):
    code: str = Field(pattern=LOCALE_PATTERN, max_length=10)
    name: str = Field(min_length=2, max_length=60)  # nome no próprio idioma (ex.: Français)
    direction: str = Field(default="ltr", pattern="^(ltr|rtl)$")
    # Textos do app em inglês (o app envia o dicionário que traz embutido)
    source: dict
    translate: bool = True


class SourceIn(BaseModel):
    hash: str = Field(max_length=80)
    source: dict


@router.put("/admin/languages/source")
async def put_source(
    body: SourceIn, cu: CurrentUser = Depends(admin_only), db: AsyncSession = Depends(get_db)
) -> dict:
    """O app do administrador envia os textos em inglês da versão atual. Idiomas já traduzidos
    recebem só o que for novo, em segundo plano."""
    current = await get_setting(db, SOURCE_KEY)
    if current.get("hash") == body.hash:
        return {"changed": False}
    if not 50 <= len(_flatten(body.source)) <= 5000:
        raise AppError(422, "invalid_source", "Send the app's English dictionary")
    await set_setting(db, SOURCE_KEY, {"hash": body.hash, "dictionary": body.source}, cu.user.id)
    await db.commit()
    for x in await _languages(db):
        if x.get("enabled"):
            _start(x["code"])
    return {"changed": True}


@router.get("/admin/languages")
async def admin_list(_: CurrentUser = Depends(admin_only), db: AsyncSession = Depends(get_db)) -> dict:
    items = []
    for x in await _languages(db):
        data = await get_setting(db, _DICT_KEY.format(code=x["code"]))
        items.append({**x, "keys": len(_flatten(data.get("dictionary", {})))})
    return {"builtin": BUILTIN_INFO, "items": items}


@router.post("/admin/languages")
async def admin_create(
    body: CreateIn, cu: CurrentUser = Depends(admin_only), db: AsyncSession = Depends(get_db)
) -> dict:
    if body.code in BUILTIN:
        raise AppError(422, "builtin_language", "This language is built into the app")
    flat_source = _flatten(body.source)
    if not 50 <= len(flat_source) <= 5000:
        raise AppError(422, "invalid_source", "Send the app's English dictionary")
    flat = await _translate(db, cu.user.id, body.code, flat_source) if body.translate else {}
    books_src = {b.code: f"{b.en.name}|{b.en.abbr}" for b in all_books()}
    books_flat = await _translate(db, cu.user.id, body.code, books_src) if body.translate else {}
    books = {}
    for code, text in books_flat.items():
        name, _, abbr = text.partition("|")
        if name.strip():
            books[code] = {"name": name.strip(), "abbr": (abbr or name).strip()[:12]}

    items = [x for x in await _languages(db) if x["code"] != body.code]
    meta = {"code": body.code, "name": body.name, "direction": body.direction, "enabled": False, "version": 1}
    await set_setting(db, LIST_KEY, {"items": [*items, meta]}, cu.user.id)
    await set_setting(
        db,
        _DICT_KEY.format(code=body.code),
        {"version": 1, "dictionary": _unflatten(flat), "books": books},
        cu.user.id,
    )
    await db.commit()
    return {**meta, "translated": len(flat), "total": len(flat_source), "books": len(books)}


class UpdateIn(BaseModel):
    name: str | None = Field(default=None, min_length=2, max_length=60)
    enabled: bool | None = None
    # Correções de textos: {"study.title": "Étudier"}
    texts: dict[str, str] | None = None
    books: dict[str, dict[str, str]] | None = None


@router.patch("/admin/languages/{code}")
async def admin_update(
    code: str, body: UpdateIn, cu: CurrentUser = Depends(admin_only), db: AsyncSession = Depends(get_db)
) -> dict:
    items = await _languages(db)
    meta = next((x for x in items if x["code"] == code), None)
    if meta is None:
        raise AppError(404, "language_not_found", "Language not found")
    key = _DICT_KEY.format(code=code)
    data = await get_setting(db, key)
    if body.texts or body.books:
        flat = _flatten(data.get("dictionary", {}))
        flat.update({k: v for k, v in (body.texts or {}).items() if v.strip()})
        books = {**data.get("books", {}), **(body.books or {})}
        version = int(data.get("version", 0)) + 1
        await set_setting(
            db, key, {"version": version, "dictionary": _unflatten(flat), "books": books}, cu.user.id
        )
        meta["version"] = version
    if body.name is not None:
        meta["name"] = body.name
    if body.enabled is not None:
        meta["enabled"] = body.enabled
    await set_setting(db, LIST_KEY, {"items": items}, cu.user.id)
    await db.commit()
    return meta


@router.get("/admin/languages/{code}")
async def admin_get(
    code: str, _: CurrentUser = Depends(admin_only), db: AsyncSession = Depends(get_db)
) -> dict:
    meta = next((x for x in await _languages(db) if x["code"] == code), None)
    if meta is None:
        raise AppError(404, "language_not_found", "Language not found")
    data = await get_setting(db, _DICT_KEY.format(code=code))
    return {**meta, "texts": _flatten(data.get("dictionary", {})), "books": data.get("books", {})}


@router.delete("/admin/languages/{code}")
async def admin_delete(
    code: str, cu: CurrentUser = Depends(admin_only), db: AsyncSession = Depends(get_db)
) -> dict:
    items = [x for x in await _languages(db) if x["code"] != code]
    await set_setting(db, LIST_KEY, {"items": items}, cu.user.id)
    await db.execute(delete(SystemSetting).where(SystemSetting.key == _DICT_KEY.format(code=code)))
    await db.commit()
    return {"ok": True}
