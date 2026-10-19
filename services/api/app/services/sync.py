"""Sincronização dos dados de estudo entre aparelhos (funciona offline).

O aparelho guarda um cursor (maior `rev` já recebido) e uma fila de alterações locais.
Em cada sincronização envia a fila e recebe tudo que mudou desde o cursor.

Regras de conflito:
- Categorias, destaques e favoritos: vence a edição mais recente no aparelho (client_updated_at).
- Anotações: nunca se perde texto. Se a anotação mudou no servidor depois da última versão que o
  aparelho viu (base_rev), a versão do aparelho é salva como uma cópia marcada como conflito.
"""

import uuid
from datetime import UTC, datetime
from typing import Annotated, Literal

from pydantic import BaseModel, Field, StringConstraints, field_validator
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.bible.books import by_id, split_key
from app.core.errors import AppError
from app.core.locales import content_lang
from app.models import Annotation, Bookmark, Highlight, HighlightCategory, User
from app.models.study import SyncedMixin, user_data_rev

COLORS = ("yellow", "blue", "green", "red", "purple", "orange")

DEFAULT_CATEGORIES = {
    "pt-BR": [
        ("Promessa", "yellow"),
        ("Ensinamento", "blue"),
        ("Aplicação pessoal", "green"),
        ("Advertência", "red"),
        ("Profecia", "purple"),
    ],
    "en": [
        ("Promise", "yellow"),
        ("Teaching", "blue"),
        ("Personal application", "green"),
        ("Warning", "red"),
        ("Prophecy", "purple"),
    ],
    "es": [
        ("Promesa", "yellow"),
        ("Enseñanza", "blue"),
        ("Aplicación personal", "green"),
        ("Advertencia", "red"),
        ("Profecía", "purple"),
    ],
}


def _valid_key(key: int) -> int:
    book_id, chapter, verse = split_key(key)
    book = by_id().get(book_id)
    if book is None or not 1 <= chapter <= book.chapters or not 0 <= verse <= 200:
        raise ValueError("invalid verse key")
    return key


VerseKey = Annotated[int, Field(ge=1_001_000, le=66_999_999)]


class CategoryData(BaseModel):
    name: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=60)]
    color: Literal[COLORS]  # type: ignore[valid-type]
    position: int = Field(0, ge=0, le=100)


class HighlightData(BaseModel):
    verse_key: VerseKey
    category_id: uuid.UUID

    _key = field_validator("verse_key")(_valid_key)


class BookmarkData(BaseModel):
    verse_key_start: VerseKey
    verse_key_end: VerseKey
    translation_code: Annotated[str, StringConstraints(max_length=20)] | None = None
    label: Annotated[str, StringConstraints(max_length=200)] | None = None

    _keys = field_validator("verse_key_start", "verse_key_end")(_valid_key)


class AnnotationData(BaseModel):
    scope: Literal["book", "chapter", "verse", "range"]
    verse_key_start: VerseKey
    verse_key_end: VerseKey
    title: Annotated[str, StringConstraints(max_length=200)] | None = None
    body: Annotated[str, StringConstraints(max_length=20_000)] = ""
    tags: Annotated[
        list[Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=40)]],
        Field(max_length=20),
    ] = []

    _keys = field_validator("verse_key_start", "verse_key_end")(_valid_key)


Entity = Literal["category", "highlight", "bookmark", "annotation"]

MODELS: dict[str, tuple[type[SyncedMixin], type[BaseModel]]] = {
    "category": (HighlightCategory, CategoryData),
    "highlight": (Highlight, HighlightData),
    "bookmark": (Bookmark, BookmarkData),
    "annotation": (Annotation, AnnotationData),
}
# Categorias antes de destaques (destaque referencia categoria)
ORDER = {"category": 0, "highlight": 1, "bookmark": 2, "annotation": 3}


class Change(BaseModel):
    entity: Entity
    id: uuid.UUID
    deleted: bool = False
    client_updated_at: datetime
    # Última versão do servidor que o aparelho conhecia (para detectar conflito em anotações)
    base_rev: int | None = None
    data: dict | None = None


class SyncIn(BaseModel):
    cursor: int = Field(0, ge=0)
    changes: Annotated[list[Change], Field(max_length=500)] = []


def _now() -> datetime:
    return datetime.now(UTC)


async def _next_rev(db: AsyncSession) -> int:
    return await db.scalar(user_data_rev.next_value().select())


def serialize(entity: str, row: SyncedMixin) -> dict:
    base = {
        "entity": entity,
        "id": str(row.id),
        "rev": row.rev,
        "deleted": row.deleted_at is not None,
        "client_updated_at": row.client_updated_at.isoformat(),
    }
    if row.deleted_at is not None:
        return base
    if isinstance(row, HighlightCategory):
        base["data"] = {"name": row.name, "color": row.color, "position": row.position}
    elif isinstance(row, Highlight):
        base["data"] = {"verse_key": row.verse_key, "category_id": str(row.category_id)}
    elif isinstance(row, Bookmark):
        base["data"] = {
            "verse_key_start": row.verse_key_start,
            "verse_key_end": row.verse_key_end,
            "translation_code": row.translation_code,
            "label": row.label,
        }
    elif isinstance(row, Annotation):
        base["data"] = {
            "scope": row.scope,
            "verse_key_start": row.verse_key_start,
            "verse_key_end": row.verse_key_end,
            "title": row.title,
            "body": row.body,
            "tags": row.tags,
            "created_at": row.created_at.isoformat() if row.created_at else None,
        }
    return base


async def ensure_default_categories(db: AsyncSession, user: User) -> None:
    exists = await db.scalar(
        select(HighlightCategory.id).where(HighlightCategory.user_id == user.id).limit(1)
    )
    if exists:
        return
    lang = content_lang(user.locale)
    now = _now()
    for position, (name, color) in enumerate(DEFAULT_CATEGORIES[lang]):
        db.add(
            HighlightCategory(
                id=uuid.uuid4(),
                user_id=user.id,
                rev=await _next_rev(db),
                client_updated_at=now,
                name=name,
                color=color,
                position=position,
            )
        )
    await db.flush()


async def _apply(db: AsyncSession, user: User, change: Change) -> dict | None:
    """Aplica uma alteração. Devolve um aviso (conflito/erro) ou None."""
    model, schema = MODELS[change.entity]
    row = await db.get(model, change.id)
    if row is not None and row.user_id != user.id:
        # Mesmo UUID de outro usuário: nunca toca no dado alheio
        return {"entity": change.entity, "id": str(change.id), "error": "forbidden"}

    if change.deleted:
        if row is None or row.deleted_at is not None:
            return None
        if change.entity == "annotation" and change.base_rev is not None and row.rev > change.base_rev:
            return {"entity": change.entity, "id": str(change.id), "conflict": "kept_server_version"}
        if change.entity != "annotation" and change.client_updated_at < row.client_updated_at:
            return None
        row.deleted_at = _now()
        row.client_updated_at = change.client_updated_at
        row.rev = await _next_rev(db)
        row.updated_at = _now()
        if change.entity == "category":
            # Destaques da categoria apagada também somem
            for h in await db.scalars(
                select(Highlight).where(Highlight.category_id == row.id, Highlight.deleted_at.is_(None))
            ):
                h.deleted_at, h.rev, h.client_updated_at = (
                    _now(),
                    await _next_rev(db),
                    change.client_updated_at,
                )
        return None

    try:
        data = schema.model_validate(change.data or {})
    except Exception:  # noqa: BLE001 (dado inválido vira aviso, não derruba o lote)
        return {"entity": change.entity, "id": str(change.id), "error": "invalid"}
    values = data.model_dump()

    if change.entity == "highlight":
        cat = await db.get(HighlightCategory, data.category_id)
        if cat is None or cat.user_id != user.id or cat.deleted_at is not None:
            return {"entity": change.entity, "id": str(change.id), "error": "invalid_category"}
    if change.entity in ("bookmark", "annotation") and values["verse_key_end"] < values["verse_key_start"]:
        return {"entity": change.entity, "id": str(change.id), "error": "invalid"}

    if row is None:
        db.add(
            model(
                id=change.id,
                user_id=user.id,
                rev=await _next_rev(db),
                client_updated_at=change.client_updated_at,
                **values,
            )
        )
        return None

    if change.entity == "annotation":
        changed_on_server = change.base_rev is not None and row.rev > change.base_rev
        same = all(getattr(row, k) == v for k, v in values.items())
        if changed_on_server and not same and row.deleted_at is None:
            copy_id = uuid.uuid4()
            title = values.get("title") or ""
            word = {"pt-BR": "conflito", "es": "conflicto"}.get(content_lang(user.locale), "conflict")
            values["title"] = f"{title} ({word})".strip()
            db.add(
                Annotation(
                    id=copy_id,
                    user_id=user.id,
                    rev=await _next_rev(db),
                    client_updated_at=change.client_updated_at,
                    **values,
                )
            )
            return {
                "entity": "annotation",
                "id": str(change.id),
                "conflict": "copied",
                "copy_id": str(copy_id),
            }
    elif change.client_updated_at < row.client_updated_at:
        return None  # o servidor tem uma edição mais recente

    for k, v in values.items():
        setattr(row, k, v)
    row.deleted_at = None
    row.client_updated_at = change.client_updated_at
    row.updated_at = _now()
    row.rev = await _next_rev(db)
    return None


async def sync(db: AsyncSession, user: User, payload: SyncIn) -> dict:
    await ensure_default_categories(db, user)
    notices = []
    for change in sorted(payload.changes, key=lambda c: ORDER[c.entity]):
        notice = await _apply(db, user, change)
        if notice:
            notices.append(notice)
        await db.flush()
    await db.commit()

    changes = []
    max_rev = payload.cursor
    for entity, (model, _) in MODELS.items():
        stmt = select(model).where(model.user_id == user.id, model.rev > payload.cursor)
        if payload.cursor == 0:
            stmt = stmt.where(model.deleted_at.is_(None))
        for row in await db.scalars(stmt.order_by(model.rev)):
            changes.append(serialize(entity, row))
            max_rev = max(max_rev, row.rev)
    if payload.cursor == 0 and not changes:
        max_rev = 0
    return {"cursor": max_rev, "changes": changes, "notices": notices}


def require_sane_batch(payload: SyncIn) -> None:
    ids = [(c.entity, c.id) for c in payload.changes]
    if len(ids) != len(set(ids)):
        raise AppError(422, "duplicate_changes", "The same item appears twice in one batch")
