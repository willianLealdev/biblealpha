import uuid
from datetime import UTC, date, datetime, timedelta
from typing import Annotated, Literal
from urllib.parse import quote

from fastapi import APIRouter, Depends, Query, Response, status
from pydantic import BaseModel, Field, StringConstraints
from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import CurrentUser, current_user, require_role
from app.core import ratelimit
from app.core.errors import AppError
from app.core.locales import content_lang
from app.db.session import get_db
from app.models import Sermon, SermonVersion
from app.sermon import ai as sermon_ai
from app.sermon.export_docx import build_docx
from app.sermon.export_pdf import build_pdf
from app.sermon.export_pptx import build_pptx, slides_for
from app.sermon.schema import Content, Kind
from app.sermon.templates import TEMPLATES, blocks_for

router = APIRouter(prefix="/sermons", tags=["sermons"])

Short = Annotated[str, StringConstraints(strip_whitespace=True, max_length=200)]
SNAPSHOT_EVERY = timedelta(minutes=5)


def _summary(s: Sermon) -> dict:
    return {
        "id": str(s.id),
        "title": s.title,
        "theme": s.theme,
        "main_reference": s.main_reference,
        "kind": s.kind,
        "folder": s.folder,
        "tags": s.tags,
        "scheduled_for": s.scheduled_for.isoformat() if s.scheduled_for else None,
        "duration_minutes": s.duration_minutes,
        "updated_at": s.updated_at.isoformat(),
        "deleted_at": s.deleted_at.isoformat() if s.deleted_at else None,
    }


def _full(s: Sermon) -> dict:
    return {
        **_summary(s),
        "other_references": s.other_references,
        "objective": s.objective,
        "audience": s.audience,
        "event": s.event,
        "content": s.content,
        "pulpit_notes": s.pulpit_notes,
        "version": s.version,
    }


async def _own(
    db: AsyncSession, cu: CurrentUser, sermon_id: uuid.UUID, include_deleted: bool = False
) -> Sermon:
    s = await db.get(Sermon, sermon_id)
    if s is None or s.user_id != cu.user.id or (s.deleted_at is not None and not include_deleted):
        raise AppError(404, "sermon_not_found", "Sermon not found")
    return s


class Meta(BaseModel):
    title: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=200)] | None = (
        None
    )
    theme: Short | None = None
    main_reference: Annotated[str, StringConstraints(strip_whitespace=True, max_length=120)] | None = None
    other_references: (
        Annotated[list[Annotated[str, StringConstraints(max_length=120)]], Field(max_length=50)] | None
    ) = None
    kind: Kind | None = None
    objective: Annotated[str, StringConstraints(max_length=2000)] | None = None
    audience: Short | None = None
    event: Short | None = None
    scheduled_for: date | None = None
    duration_minutes: int | None = Field(None, ge=1, le=600)
    folder: Annotated[str, StringConstraints(strip_whitespace=True, max_length=80)] | None = None
    tags: Annotated[list[Annotated[str, StringConstraints(max_length=40)]], Field(max_length=20)] | None = (
        None
    )


def _apply_meta(s: Sermon, meta: Meta) -> None:
    for field, value in meta.model_dump(exclude_unset=True).items():
        if field == "title" and not value:
            continue
        setattr(s, field, value)


@router.get("/templates")
async def templates(cu: CurrentUser = Depends(current_user)) -> dict:
    lang = "pt-BR" if cu.user.locale.startswith("pt") else "en"
    return {"kinds": [{"kind": k, "sections": [t[lang] for _, t in v]} for k, v in TEMPLATES.items()]}


@router.get("")
async def list_sermons(
    q: str = Query("", max_length=100),
    folder: str | None = None,
    trash: bool = False,
    cu: CurrentUser = Depends(current_user),
    db: AsyncSession = Depends(get_db),
) -> dict:
    stmt = select(Sermon).where(Sermon.user_id == cu.user.id)
    stmt = stmt.where(Sermon.deleted_at.is_not(None) if trash else Sermon.deleted_at.is_(None))
    if folder:
        stmt = stmt.where(Sermon.folder == folder)
    if q:
        like = f"%{q}%"
        stmt = stmt.where(
            or_(Sermon.title.ilike(like), Sermon.theme.ilike(like), Sermon.main_reference.ilike(like))
        )
    rows = list(await db.scalars(stmt.order_by(Sermon.updated_at.desc()).limit(300)))
    folders = sorted({s.folder for s in rows if s.folder})
    return {"sermons": [_summary(s) for s in rows], "folders": folders}


class CreateIn(Meta):
    use_template: bool = True


@router.post("", status_code=status.HTTP_201_CREATED)
async def create(
    body: CreateIn, cu: CurrentUser = Depends(current_user), db: AsyncSession = Depends(get_db)
) -> dict:
    kind = body.kind or "thematic"
    pt = cu.user.locale.startswith("pt")
    s = Sermon(
        user_id=cu.user.id,
        title=body.title or ("Nova ministração" if pt else "New sermon"),
        kind=kind,
        content={"blocks": blocks_for(kind, cu.user.locale) if body.use_template else []},
    )
    _apply_meta(s, body)
    db.add(s)
    await db.commit()
    await db.refresh(s)
    return _full(s)


@router.get("/{sermon_id}")
async def get_sermon(
    sermon_id: uuid.UUID, cu: CurrentUser = Depends(current_user), db: AsyncSession = Depends(get_db)
) -> dict:
    return _full(await _own(db, cu, sermon_id))


class SaveIn(Meta):
    base_version: int
    content: Content | None = None


@router.put("/{sermon_id}")
async def save(
    sermon_id: uuid.UUID,
    body: SaveIn,
    cu: CurrentUser = Depends(current_user),
    db: AsyncSession = Depends(get_db),
) -> dict:
    s = await _own(db, cu, sermon_id)
    if body.base_version != s.version:
        # Editada em outro aparelho: o app salva a versão local como cópia, nada se perde
        raise AppError(409, "version_conflict", "This sermon was changed on another device")
    _apply_meta(s, body)
    if body.content is not None:
        s.content = body.content.model_dump()
    s.version += 1
    s.updated_at = datetime.now(UTC)
    last = await db.scalar(
        select(SermonVersion.created_at)
        .where(SermonVersion.sermon_id == s.id)
        .order_by(SermonVersion.created_at.desc())
        .limit(1)
    )
    if last is None or datetime.now(UTC) - last >= SNAPSHOT_EVERY:
        db.add(SermonVersion(sermon_id=s.id, version=s.version, title=s.title, content=s.content))
    await db.commit()
    await db.refresh(s)
    return _full(s)


@router.get("/{sermon_id}/versions")
async def versions(
    sermon_id: uuid.UUID, cu: CurrentUser = Depends(current_user), db: AsyncSession = Depends(get_db)
) -> dict:
    s = await _own(db, cu, sermon_id)
    rows = await db.scalars(
        select(SermonVersion)
        .where(SermonVersion.sermon_id == s.id)
        .order_by(SermonVersion.created_at.desc())
        .limit(100)
    )
    return {
        "versions": [
            {"id": str(v.id), "version": v.version, "title": v.title, "created_at": v.created_at.isoformat()}
            for v in rows
        ]
    }


@router.post("/{sermon_id}/versions/{version_id}/restore")
async def restore_version(
    sermon_id: uuid.UUID,
    version_id: uuid.UUID,
    cu: CurrentUser = Depends(current_user),
    db: AsyncSession = Depends(get_db),
) -> dict:
    s = await _own(db, cu, sermon_id)
    v = await db.get(SermonVersion, version_id)
    if v is None or v.sermon_id != s.id:
        raise AppError(404, "version_not_found", "Version not found")
    # O estado atual vira uma versão antes de voltar, para que a restauração também possa ser desfeita
    db.add(SermonVersion(sermon_id=s.id, version=s.version, title=s.title, content=s.content))
    s.content, s.title = v.content, v.title
    s.version += 1
    s.updated_at = datetime.now(UTC)
    await db.commit()
    await db.refresh(s)
    return _full(s)


@router.post("/{sermon_id}/duplicate", status_code=status.HTTP_201_CREATED)
async def duplicate(
    sermon_id: uuid.UUID, cu: CurrentUser = Depends(current_user), db: AsyncSession = Depends(get_db)
) -> dict:
    s = await _own(db, cu, sermon_id)
    copy = Sermon(
        user_id=cu.user.id,
        title=f"{s.title} ({'cópia' if cu.user.locale.startswith('pt') else 'copy'})"[:200],
        theme=s.theme,
        main_reference=s.main_reference,
        other_references=list(s.other_references),
        kind=s.kind,
        objective=s.objective,
        audience=s.audience,
        event=s.event,
        duration_minutes=s.duration_minutes,
        folder=s.folder,
        tags=list(s.tags),
        content=s.content,
    )
    db.add(copy)
    await db.commit()
    await db.refresh(copy)
    return _full(copy)


@router.delete("/{sermon_id}", status_code=status.HTTP_204_NO_CONTENT)
async def trash(
    sermon_id: uuid.UUID, cu: CurrentUser = Depends(current_user), db: AsyncSession = Depends(get_db)
) -> Response:
    s = await _own(db, cu, sermon_id)
    s.deleted_at = datetime.now(UTC)
    await db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post("/{sermon_id}/restore")
async def restore(
    sermon_id: uuid.UUID, cu: CurrentUser = Depends(current_user), db: AsyncSession = Depends(get_db)
) -> dict:
    s = await _own(db, cu, sermon_id, include_deleted=True)
    s.deleted_at = None
    await db.commit()
    await db.refresh(s)
    return _full(s)


class PulpitNoteIn(BaseModel):
    text: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=2000)]


@router.post("/{sermon_id}/pulpit-notes")
async def pulpit_note(
    sermon_id: uuid.UUID,
    body: PulpitNoteIn,
    cu: CurrentUser = Depends(current_user),
    db: AsyncSession = Depends(get_db),
) -> dict:
    s = await _own(db, cu, sermon_id)
    stamp = datetime.now(UTC).strftime("%d/%m %H:%M")
    s.pulpit_notes = (s.pulpit_notes + f"\n[{stamp}] {body.text}").strip()
    await db.commit()
    return {"pulpit_notes": s.pulpit_notes}


_EXPORT_LABELS = {
    "pt-BR": {
        "main": "Texto principal",
        "theme": "Tema",
        "objective": "Objetivo",
        "audience": "Público",
        "event": "Evento",
        "date": "Data",
        "duration": "Duração",
        "note": "Nota",
    },
    "es": {
        "main": "Texto principal",
        "theme": "Tema",
        "objective": "Objetivo",
        "audience": "Público",
        "event": "Evento",
        "date": "Fecha",
        "duration": "Duración",
        "note": "Nota",
    },
    "en": {
        "main": "Main passage",
        "theme": "Theme",
        "objective": "Goal",
        "audience": "Audience",
        "event": "Event",
        "date": "Date",
        "duration": "Length",
        "note": "Note",
    },
}


def _download(content: bytes, media_type: str, title: str, ext: str) -> Response:
    safe = "".join(c for c in title if c.isalnum() or c in " -_").strip() or "ministracao"
    ascii_name = safe.encode("ascii", "ignore").decode() or "ministracao"
    return Response(
        content,
        media_type=media_type,
        headers={
            "Content-Disposition": f'attachment; filename="{ascii_name}.{ext}"; '
            f"filename*=UTF-8''{quote(safe)}.{ext}"
        },
    )


@router.get("/{sermon_id}/export.docx")
async def export_docx(
    sermon_id: uuid.UUID, cu: CurrentUser = Depends(current_user), db: AsyncSession = Depends(get_db)
) -> Response:
    s = await _own(db, cu, sermon_id)
    labels = _EXPORT_LABELS[content_lang(cu.user.locale)]
    media = "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    return _download(build_docx(s, labels), media, s.title, "docx")


@router.get("/{sermon_id}/slides")
async def slides(
    sermon_id: uuid.UUID, cu: CurrentUser = Depends(current_user), db: AsyncSession = Depends(get_db)
) -> dict:
    """Estrutura dos slides (modo Apresentar do app)."""
    return {"slides": slides_for(await _own(db, cu, sermon_id))}


@router.get("/{sermon_id}/export.pptx")
async def export_pptx(
    sermon_id: uuid.UUID, cu: CurrentUser = Depends(current_user), db: AsyncSession = Depends(get_db)
) -> Response:
    s = await _own(db, cu, sermon_id)
    media = "application/vnd.openxmlformats-officedocument.presentationml.presentation"
    return _download(build_pptx(s), media, s.title, "pptx")


@router.get("/{sermon_id}/export.pdf")
async def export_pdf(
    sermon_id: uuid.UUID, cu: CurrentUser = Depends(current_user), db: AsyncSession = Depends(get_db)
) -> Response:
    """Arquivo PDF de verdade (no navegador, baixa direto; no celular, abre o compartilhar)."""
    s = await _own(db, cu, sermon_id)
    labels = _EXPORT_LABELS[content_lang(cu.user.locale)]
    return _download(build_pdf(s, labels), "application/pdf", s.title, "pdf")


# ---------- IA ----------


class GenerateIn(BaseModel):
    theme: Annotated[str, StringConstraints(strip_whitespace=True, min_length=2, max_length=200)]
    main_reference: Annotated[str, StringConstraints(strip_whitespace=True, min_length=2, max_length=120)]
    objective: Annotated[str, StringConstraints(max_length=1000)] | None = None
    duration_minutes: int = Field(30, ge=5, le=180)
    level: Literal["basic", "intermediate", "advanced"] = "intermediate"
    kind: Kind = "thematic"


@router.post("/generate", status_code=status.HTTP_201_CREATED)
async def generate(
    body: GenerateIn, cu: CurrentUser = Depends(require_role("admin")), db: AsyncSession = Depends(get_db)
) -> dict:
    """Gerar ministração com IA é exclusivo do administrador. Usuários usam a IA só para tirar dúvidas."""
    await ratelimit.hit(f"sermon-gen:{cu.user.id}", limit=5, window_seconds=60)
    draft = await sermon_ai.generate(
        db,
        cu.user,
        theme=body.theme,
        main_reference=body.main_reference,
        objective=body.objective,
        duration=body.duration_minutes,
        level=body.level,
        kind=body.kind,
    )
    s = Sermon(
        user_id=cu.user.id,
        title=draft["title"][:200],
        theme=body.theme,
        main_reference=body.main_reference,
        kind=body.kind,
        objective=(draft.get("objective") or "")[:2000] or None,
        duration_minutes=body.duration_minutes,
        content={"blocks": draft["blocks"]},
    )
    db.add(s)
    await db.commit()
    await db.refresh(s)
    return _full(s)


class AssistIn(BaseModel):
    action: Literal[tuple(sermon_ai.ASSIST_ACTIONS)]  # type: ignore[valid-type]
    text: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=20_000)]


@router.post("/{sermon_id}/assist")
async def assist(
    sermon_id: uuid.UUID,
    body: AssistIn,
    cu: CurrentUser = Depends(current_user),
    db: AsyncSession = Depends(get_db),
) -> dict:
    # A IA não escreve nem edita ministrações de usuários: isso é só do admin.
    # Os demais tiram dúvidas em "Perguntas para a IA" (/ai/ask), que nunca escreve a ministração.
    if "admin" not in cu.user.role_names:
        raise AppError(403, "admin_only", "Only the administrator can use the sermon assistant")
    await ratelimit.hit(f"sermon-assist:{cu.user.id}", limit=20, window_seconds=60)
    s = await _own(db, cu, sermon_id)
    return await sermon_ai.assist(
        db, cu.user, action=body.action, text=body.text, sermon_title=s.title, main_reference=s.main_reference
    )
