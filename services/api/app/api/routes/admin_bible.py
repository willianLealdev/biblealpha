"""Painel do administrador: Bíblias. Importar do catálogo do eBible.org, ativar/desativar,
escolher a tradução padrão de cada idioma e remover. Tudo aparece no app sem atualizar a loja."""

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel, Field
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import CurrentUser, request_meta, require_role
from app.bible import bulk, ebible
from app.bible.importer import ImportError_
from app.core.errors import AppError
from app.db.session import get_db
from app.models import BibleTranslation, BibleVerse
from app.services import audit
from app.services import bible as bible_service
from app.services.audit import RequestMeta
from app.services.settings import get_setting, set_setting

router = APIRouter(prefix="/admin/bibles", tags=["admin"])
admin_only = require_role("admin")


def _out(t: BibleTranslation, defaults: set[str]) -> dict:
    notes = t.notes or {}
    return {
        "code": t.code,
        "name": t.name,
        "abbreviation": t.abbreviation,
        "language": t.language,
        "language_name": notes.get("language_name"),
        "license": t.license,
        "verse_count": t.verse_count,
        "is_active": t.is_active,
        "is_default": t.code in defaults,
        "ebible_id": notes.get("ebible_id"),
        "books": ebible.book_codes(notes),
        "incomplete_books": notes.get("incomplete_books", []),
        "imported_at": t.imported_at.isoformat() if t.imported_at else None,
    }


async def _defaults(db: AsyncSession) -> set[str]:
    active = await bible_service.list_translations(db)
    return await bible_service.default_codes(db, active) if active else set()


@router.get("")
async def list_bibles(_: CurrentUser = Depends(admin_only), db: AsyncSession = Depends(get_db)) -> dict:
    rows = (
        await db.scalars(select(BibleTranslation).order_by(BibleTranslation.language, BibleTranslation.name))
    ).all()
    defaults = await _defaults(db)
    return {"translations": [_out(t, defaults) for t in rows]}


@router.get("/catalog")
async def catalog(
    q: str = Query("", max_length=100),
    language: str = Query("", max_length=10),
    full_only: bool = False,
    refresh: bool = False,
    _: CurrentUser = Depends(admin_only),
    db: AsyncSession = Depends(get_db),
) -> dict:
    try:
        items = await ebible.catalog(refresh=refresh)
    except Exception as e:  # rede fora, eBible.org indisponível
        raise AppError(502, "catalog_unavailable", f"eBible.org catalog unavailable: {e}") from None
    imported = {
        (t.notes or {}).get("ebible_id"): t.code for t in (await db.scalars(select(BibleTranslation))).all()
    }
    needle = q.strip().lower()
    lang = language.strip().lower()
    out = []
    for x in items:
        if lang and lang not in (
            x["language_code"],
            x["language"].lower(),
            x["language"].lower().split("-")[0],
        ):
            continue
        if full_only and (x["ot_books"] < 39 or x["nt_books"] < 27):
            continue
        hay = f"{x['id']} {x['title']} {x['language_name']} {x['language_name_en']}".lower()
        if needle and needle not in hay:
            continue
        out.append({**x, "imported_as": imported.get(x["id"])})
    # Primeiro as completas e de domínio público
    out.sort(key=lambda x: (-(x["ot_books"] + x["nt_books"]), not x["public_domain"], x["title"]))
    languages = sorted({(x["language_code"], x["language_name_en"]) for x in items}, key=lambda p: p[1])
    return {
        "items": out[:200],
        "total": len(out),
        "languages": [{"code": c, "name": n} for c, n in languages],
    }


class ImportIn(BaseModel):
    ebible_id: str = Field(min_length=2, max_length=40)
    code: str | None = Field(default=None, max_length=20)
    name: str | None = Field(default=None, max_length=200)
    abbreviation: str | None = Field(default=None, max_length=20)
    replace: bool = False


@router.post("/import")
async def import_bible(
    body: ImportIn,
    cu: CurrentUser = Depends(admin_only),
    db: AsyncSession = Depends(get_db),
    meta: RequestMeta = Depends(request_meta),
) -> dict:
    try:
        t = await ebible.import_from_ebible(
            db,
            body.ebible_id,
            code=body.code,
            name=body.name,
            abbreviation=body.abbreviation,
            replace=body.replace,
        )
    except ImportError_ as e:
        await db.rollback()
        raise AppError(422, "import_failed", str(e)) from None
    audit.record(db, "admin.bible_import", meta, user_id=cu.user.id, code=t.code, ebible_id=body.ebible_id)
    await db.commit()
    return _out(t, await _defaults(db))


class UpdateIn(BaseModel):
    name: str | None = Field(default=None, min_length=2, max_length=200)
    abbreviation: str | None = Field(default=None, min_length=1, max_length=20)
    description: str | None = Field(default=None, max_length=2000)
    is_active: bool | None = None


async def _get(db: AsyncSession, code: str) -> BibleTranslation:
    t = await db.scalar(select(BibleTranslation).where(BibleTranslation.code == code))
    if t is None:
        raise AppError(404, "translation_not_found", "Translation not found")
    return t


@router.patch("/{code}")
async def update_bible(
    code: str, body: UpdateIn, _: CurrentUser = Depends(admin_only), db: AsyncSession = Depends(get_db)
) -> dict:
    t = await _get(db, code)
    for field, value in body.model_dump(exclude_none=True).items():
        setattr(t, field, value)
    if body.is_active is False:
        others = await db.scalar(
            select(BibleTranslation.code).where(
                BibleTranslation.is_active.is_(True), BibleTranslation.code != code
            )
        )
        if others is None:
            raise AppError(422, "last_translation", "At least one translation must stay active")
    await db.commit()
    return _out(t, await _defaults(db))


class DefaultIn(BaseModel):
    code: str


@router.put("/default")
async def set_default(
    body: DefaultIn, cu: CurrentUser = Depends(admin_only), db: AsyncSession = Depends(get_db)
) -> dict:
    t = await _get(db, body.code)
    if not t.is_active:
        raise AppError(422, "translation_inactive", "Activate the translation first")
    current = await get_setting(db, bible_service.DEFAULTS_KEY)
    await set_setting(
        db, bible_service.DEFAULTS_KEY, {**current, bible_service.lang2(t.language): t.code}, cu.user.id
    )
    await db.commit()
    return {"ok": True}


@router.delete("/{code}")
async def delete_bible(
    code: str,
    cu: CurrentUser = Depends(admin_only),
    db: AsyncSession = Depends(get_db),
    meta: RequestMeta = Depends(request_meta),
) -> dict:
    t = await _get(db, code)
    if code in bible_service.BUILTIN_DEFAULTS.values():
        raise AppError(422, "builtin_translation", "Built-in translations can be deactivated, not deleted")
    await db.execute(delete(BibleVerse).where(BibleVerse.translation_id == t.id))
    await db.delete(t)
    audit.record(db, "admin.bible_delete", meta, user_id=cu.user.id, code=code)
    await db.commit()
    return {"ok": True}


class ImportAllIn(BaseModel):
    update: bool = False


@router.post("/import-all")
async def import_all(body: ImportAllIn, _: CurrentUser = Depends(admin_only)) -> dict:
    """Importa todo o catálogo redistribuível em segundo plano (pode levar algumas horas)."""
    status = await bulk.get_status()
    if status.get("running") and bulk.running_here():
        raise AppError(409, "bulk_running", "The import is already running")
    bulk.start_background(update=body.update)
    return {"started": True}


@router.get("/import-all")
async def import_all_status(_: CurrentUser = Depends(admin_only)) -> dict:
    return await bulk.get_status()
