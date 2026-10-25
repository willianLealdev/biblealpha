"""Painel do administrador: histórias do BibleAlpha Kids.

A IA escreve um rascunho a partir de uma passagem; o administrador revisa ao lado do texto
bíblico, corrige, envia para revisão e publica. Só o que estiver publicado aparece em /kids.
"""

import uuid
from datetime import UTC, datetime
from typing import Annotated, Literal

from fastapi import APIRouter, Depends, Request
from pydantic import BaseModel, Field, StringConstraints
from sqlalchemy import delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import CurrentUser, RequestMeta, require_role
from app.bible import reference as ref_parser
from app.core.errors import AppError
from app.db.session import get_db
from app.devotional import service as devotional_service
from app.kids import ai as kids_ai
from app.kids import catalog, service, translate, videos
from app.models import KidsStory, KidsStoryPage, KidsVerse, KidsVideo, KidsVideoChunk
from app.services import audit
from app.services import bible as bible_service

router = APIRouter(prefix="/admin/kids", tags=["admin"])
admin_only = require_role("admin")

Language = Literal["pt-BR", "en", "es"]
Level = Literal["small", "big", "both"]
Status = Literal["draft", "review", "published"]


async def _story(db: AsyncSession, story_id: uuid.UUID) -> KidsStory:
    row = await db.get(KidsStory, story_id)
    if row is None:
        raise AppError(404, "story_not_found", "Story not found")
    return row


def _row_out(row: KidsStory, pages: int) -> dict:
    return {
        "id": str(row.id),
        "slug": row.slug,
        "language": row.language,
        "title": row.title,
        "summary": row.summary,
        "reference": row.reference,
        "level": row.level,
        "status": row.status,
        "pages": pages,
        "published_at": row.published_at.isoformat() if row.published_at else None,
        "updated_at": row.updated_at.isoformat() if row.updated_at else None,
    }


async def _detail(db: AsyncSession, row: KidsStory) -> dict:
    pages = await service.pages_of(db, row.id)
    translation, verses = await devotional_service.passage_text(
        db, row.translation_code, row.verse_key_start, row.verse_key_end
    )
    return {
        **_row_out(row, len(pages)),
        "lesson": row.lesson,
        "family_question": row.family_question,
        "quiz": row.quiz,
        "translation": translation.abbreviation,
        "ai_meta": row.ai_meta,
        "page_list": [{"text": p.text, "image_prompt": p.image_prompt} for p in pages],
        # Passagem real, mostrada ao lado do texto da IA na revisão
        "passage": verses,
    }


def _log(db: AsyncSession, cu: CurrentUser, action: str, row: KidsStory) -> None:
    audit.record(db, action, RequestMeta(None, None), cu.user.id, target=str(row.id), title=row.title)


@router.get("/stories")
async def list_stories(
    status: Status | None = None,
    language: Language | None = None,
    _: CurrentUser = Depends(admin_only),
    db: AsyncSession = Depends(get_db),
) -> dict:
    query = select(KidsStory)
    if status:
        query = query.where(KidsStory.status == status)
    if language:
        query = query.where(KidsStory.language == language)
    rows = list(await db.scalars(query.order_by(KidsStory.updated_at.desc())))
    counts = dict(
        (
            await db.execute(
                select(KidsStoryPage.story_id, func.count())
                .where(KidsStoryPage.story_id.in_([r.id for r in rows]))
                .group_by(KidsStoryPage.story_id)
            )
        ).all()
    )
    totals = dict((await db.execute(select(KidsStory.status, func.count()).group_by(KidsStory.status))).all())
    return {
        "stories": [_row_out(r, counts.get(r.id, 0)) for r in rows],
        "totals": {s: totals.get(s, 0) for s in service.STATUSES},
    }


@router.get("/stories/{story_id}")
async def get_story(
    story_id: uuid.UUID, _: CurrentUser = Depends(admin_only), db: AsyncSession = Depends(get_db)
) -> dict:
    return await _detail(db, await _story(db, story_id))


class GenerateIn(BaseModel):
    reference: str = Field(min_length=2, max_length=100)
    language: Language = "pt-BR"
    level: Level = "both"
    tone: Literal["joyful", "calm", "adventure"] = "joyful"
    length: Literal["short", "medium", "long"] = "medium"


@router.post("/stories/generate", status_code=201)
async def generate(
    body: GenerateIn, cu: CurrentUser = Depends(admin_only), db: AsyncSession = Depends(get_db)
) -> dict:
    """A IA reconta a passagem como história infantil. Sai sempre como rascunho."""
    try:
        refs = ref_parser.parse(body.reference, body.language)
    except ref_parser.ReferenceError as e:
        raise AppError(422, "invalid_reference", str(e)) from None
    if len(refs) != 1:
        raise AppError(422, "invalid_reference", "Use a single passage")
    start, end = devotional_service.keys_for(refs[0])
    translation = await bible_service.get_translation(
        db, await devotional_service.translation_code(db, body.language)
    )
    label, story, meta = await kids_ai.write_story(
        db,
        cu.user,
        translation,
        start,
        end,
        language=body.language,
        level=body.level,
        tone=body.tone,
        length=body.length,
    )
    row = await _create(db, cu, body.language, body.level, label, translation.code, start, end, story, meta)
    _log(db, cu, "kids.story_generated", row)
    await db.commit()
    await db.refresh(row)
    return await _detail(db, row)


async def _create(
    db: AsyncSession,
    cu: CurrentUser,
    language: str,
    level: str,
    label: str,
    translation_code: str,
    start: int,
    end: int,
    story: dict,
    meta: dict,
) -> KidsStory:
    """Grava uma história como rascunho, com as páginas."""
    row = KidsStory(
        slug=service.slugify(story["title"]),
        language=language,
        title=story["title"],
        summary=story["summary"],
        reference=label,
        translation_code=translation_code,
        verse_key_start=start,
        verse_key_end=end,
        level=level,
        status="draft",
        lesson=story["lesson"],
        family_question=story["family_question"],
        quiz=kids_ai.clean_quiz(story.get("quiz")),
        ai_meta=meta,
        created_by=cu.user.id,
    )
    db.add(row)
    await db.flush()
    for i, page in enumerate(story["pages"]):
        db.add(
            KidsStoryPage(
                story_id=row.id, position=i, text=page["text"], image_prompt=page.get("image_prompt", "")
            )
        )
    return row


@router.post("/stories/import")
async def import_starter(
    language: Language = "pt-BR", cu: CurrentUser = Depends(admin_only), db: AsyncSession = Depends(get_db)
) -> dict:
    """Histórias prontas que vêm com o sistema (escritas pela IA e guardadas no código).
    Entram como rascunho para o administrador revisar; as que já existem não se repetem."""
    have = set(
        await db.scalars(
            select(KidsStory.ai_meta["seed"].astext).where(
                KidsStory.language == language, KidsStory.ai_meta.has_key("seed")
            )
        )
    )
    translation = await devotional_service.translation_code(db, language)
    created = 0
    for item in catalog.starter_stories(language):
        if item["seed"] in have:
            continue
        start, end = item["verse_key_start"], item["verse_key_end"]
        label = devotional_service.label_for(start, end, language)
        meta = {**item.get("ai_meta", {}), "seed": item["seed"]}
        row = await _create(db, cu, language, item["level"], label, translation, start, end, item, meta)
        _log(db, cu, "kids.story_imported", row)
        created += 1
    await db.commit()
    return {"created": created}


Line = Annotated[str, StringConstraints(strip_whitespace=True, max_length=2000)]


class PageIn(BaseModel):
    text: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=2000)]
    image_prompt: Line = ""


class QuizIn(BaseModel):
    question: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=300)]
    options: list[Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=200)]] = (
        Field(min_length=2, max_length=4)
    )
    answer: int = Field(ge=0, le=3)
    explanation: Line = ""


class StoryIn(BaseModel):
    title: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=200)]
    summary: Line = ""
    level: Level
    lesson: Line = ""
    family_question: Line = ""
    pages: list[PageIn] = Field(min_length=1, max_length=30)
    quiz: list[QuizIn] = Field(default_factory=list, max_length=10)


@router.put("/stories/{story_id}")
async def update_story(
    story_id: uuid.UUID,
    body: StoryIn,
    cu: CurrentUser = Depends(admin_only),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Texto corrigido pelo administrador. A passagem de origem não muda."""
    row = await _story(db, story_id)
    row.title = body.title
    row.summary = body.summary
    row.level = body.level
    row.lesson = body.lesson
    row.family_question = body.family_question
    if any(q.answer >= len(q.options) for q in body.quiz):
        raise AppError(422, "validation_error", "Quiz answer must be one of the options")
    # Na edição as alternativas ficam na ordem que o administrador deixou
    row.quiz = [q.model_dump() for q in body.quiz]
    row.updated_at = datetime.now(UTC)
    await db.execute(delete(KidsStoryPage).where(KidsStoryPage.story_id == row.id))
    for i, page in enumerate(body.pages):
        db.add(KidsStoryPage(story_id=row.id, position=i, text=page.text, image_prompt=page.image_prompt))
    _log(db, cu, "kids.story_edited", row)
    await db.commit()
    await db.refresh(row)
    # Texto mudou: as traduções antigas saem e são refeitas a partir do texto corrigido
    await translate.refresh(db, row)
    return await _detail(db, row)


class StatusIn(BaseModel):
    status: Status


@router.post("/stories/{story_id}/status")
async def set_status(
    story_id: uuid.UUID,
    body: StatusIn,
    cu: CurrentUser = Depends(admin_only),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Rascunho → revisão → publicada. Despublicar = voltar para rascunho."""
    row = await _story(db, story_id)
    if body.status == "published":
        if not row.title.strip() or not await service.pages_of(db, row.id):
            raise AppError(422, "story_incomplete", "Story needs a title and at least one page")
        row.published_at = row.published_at if row.status == "published" else datetime.now(UTC)
    else:
        row.published_at = None
    previous = row.status
    row.status = body.status
    row.updated_at = datetime.now(UTC)
    if previous != body.status:
        _log(db, cu, f"kids.story_{body.status}", row)
    await db.commit()
    await db.refresh(row)
    if body.status == "published" and previous != "published":
        # Publicada: já começa a traduzir para os idiomas que têm leitores
        await translate.refresh(db, row)
    return await _detail(db, row)


@router.delete("/stories/{story_id}", status_code=204)
async def delete_story(
    story_id: uuid.UUID, cu: CurrentUser = Depends(admin_only), db: AsyncSession = Depends(get_db)
) -> None:
    row = await _story(db, story_id)
    _log(db, cu, "kids.story_deleted", row)
    await db.delete(row)
    await db.commit()


# ---------- Versículos para decorar ----------


def _verse_out(v: KidsVerse) -> dict:
    return {
        "id": str(v.id),
        "language": v.language,
        "reference": v.reference,
        "text": v.text,
        "level": v.level,
        "status": v.status,
        "position": v.position,
    }


async def _add_verse(db: AsyncSession, language: str, start: int, end: int, level: str) -> KidsVerse | None:
    """Rascunho com o texto real da Bíblia padrão do idioma (None se já existe ou não há texto)."""
    exists = await db.scalar(
        select(KidsVerse.id).where(
            KidsVerse.language == language, KidsVerse.verse_key_start == start, KidsVerse.verse_key_end == end
        )
    )
    if exists:
        return None
    code = await devotional_service.translation_code(db, language)
    _, verses = await devotional_service.passage_text(db, code, start, end)
    if not verses:
        return None
    last = await db.scalar(select(func.max(KidsVerse.position)).where(KidsVerse.language == language))
    row = KidsVerse(
        language=language,
        reference=devotional_service.label_for(start, end, language),
        translation_code=code,
        verse_key_start=start,
        verse_key_end=end,
        text=" ".join(v["text"].strip() for v in verses),
        level=level,
        status="draft",
        position=(last or 0) + 1,
    )
    db.add(row)
    await db.flush()
    return row


@router.get("/verses")
async def list_verses(
    language: Language = "pt-BR", _: CurrentUser = Depends(admin_only), db: AsyncSession = Depends(get_db)
) -> dict:
    rows = await db.scalars(
        select(KidsVerse).where(KidsVerse.language == language).order_by(KidsVerse.position)
    )
    return {"verses": [_verse_out(v) for v in rows]}


class VerseIn(BaseModel):
    reference: str = Field(min_length=2, max_length=100)
    language: Language = "pt-BR"
    level: Level = "both"


@router.post("/verses", status_code=201)
async def add_verse(
    body: VerseIn, cu: CurrentUser = Depends(admin_only), db: AsyncSession = Depends(get_db)
) -> dict:
    try:
        refs = ref_parser.parse(body.reference, body.language)
    except ref_parser.ReferenceError as e:
        raise AppError(422, "invalid_reference", str(e)) from None
    if len(refs) != 1 or not refs[0].verse_start:
        raise AppError(422, "invalid_reference", "Use one verse or a few verses")
    start, end = devotional_service.keys_for(refs[0])
    if end - start > 5:
        raise AppError(422, "passage_too_long", "Up to 6 verses")
    row = await _add_verse(db, body.language, start, end, body.level)
    if row is None:
        raise AppError(409, "verse_exists", "Verse already added or not found")
    await db.commit()
    return _verse_out(row)


@router.post("/verses/suggested")
async def add_suggested(
    language: Language = "pt-BR", _: CurrentUser = Depends(admin_only), db: AsyncSession = Depends(get_db)
) -> dict:
    """Versículos sugeridos pelo sistema, como rascunho (os que já existem não se repetem)."""
    created = 0
    for start, end, level in catalog.verse_keys():
        if await _add_verse(db, language, start, end, level):
            created += 1
    await db.commit()
    return {"created": created}


class VerseUpdateIn(BaseModel):
    status: Status | None = None
    level: Level | None = None


@router.patch("/verses/{verse_id}")
async def update_verse(
    verse_id: uuid.UUID,
    body: VerseUpdateIn,
    _: CurrentUser = Depends(admin_only),
    db: AsyncSession = Depends(get_db),
) -> dict:
    row = await db.get(KidsVerse, verse_id)
    if row is None:
        raise AppError(404, "verse_not_found", "Verse not found")
    if body.status:
        row.status = body.status
    if body.level:
        row.level = body.level
    await db.commit()
    return _verse_out(row)


@router.post("/verses/publish-all")
async def publish_all_verses(
    language: Language = "pt-BR", _: CurrentUser = Depends(admin_only), db: AsyncSession = Depends(get_db)
) -> dict:
    """Publica de uma vez os versículos em rascunho (o texto é o da Bíblia, sem IA)."""
    rows = list(
        await db.scalars(
            select(KidsVerse).where(KidsVerse.language == language, KidsVerse.status != "published")
        )
    )
    for row in rows:
        row.status = "published"
    await db.commit()
    return {"published": len(rows)}


@router.delete("/verses/{verse_id}", status_code=204)
async def delete_verse(
    verse_id: uuid.UUID, _: CurrentUser = Depends(admin_only), db: AsyncSession = Depends(get_db)
) -> None:
    row = await db.get(KidsVerse, verse_id)
    if row is not None:
        await db.delete(row)
        await db.commit()


# ---------- Vídeos (enviados pelo administrador) ----------


async def _video(db: AsyncSession, video_id: uuid.UUID) -> KidsVideo:
    row = await db.get(KidsVideo, video_id)
    if row is None:
        raise AppError(404, "video_not_found", "Video not found")
    return row


async def _video_out(db: AsyncSession, v: KidsVideo) -> dict:
    chunks, got = await videos.received(db, v)
    return {
        "id": str(v.id),
        "title": v.title,
        "description": v.description,
        "language": v.language,
        "level": v.level,
        "status": v.status,
        "mime": v.mime,
        "size": v.size,
        "chunk_size": v.chunk_size,
        "chunks": videos.chunk_count(v),
        "received_chunks": chunks,
        "received_bytes": got,
        "has_poster": v.poster_mime is not None,
        "published_at": v.published_at.isoformat() if v.published_at else None,
    }


@router.get("/videos")
async def list_videos(_: CurrentUser = Depends(admin_only), db: AsyncSession = Depends(get_db)) -> dict:
    rows = await db.scalars(select(KidsVideo).order_by(KidsVideo.position, KidsVideo.created_at.desc()))
    return {"videos": [await _video_out(db, v) for v in rows]}


Title = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=200)]
LanguageCode = Annotated[str, StringConstraints(pattern=r"^[a-z]{2,3}(-[A-Z]{2})?$")]


class VideoIn(BaseModel):
    title: Title
    description: Line = ""
    language: LanguageCode = "pt-BR"
    level: Level = "both"
    mime: str
    size: int = Field(gt=0, le=videos.MAX_SIZE)


@router.post("/videos", status_code=201)
async def start_video(
    body: VideoIn, cu: CurrentUser = Depends(admin_only), db: AsyncSession = Depends(get_db)
) -> dict:
    """Começa o envio: o painel manda depois os pedaços de `chunk_size` bytes."""
    if body.mime not in videos.VIDEO_TYPES:
        raise AppError(422, "invalid_video", "Send an MP4 video")
    last = await db.scalar(select(func.max(KidsVideo.position)))
    row = KidsVideo(
        title=body.title,
        description=body.description,
        language=body.language,
        level=body.level,
        status="uploading",
        mime=body.mime,
        size=body.size,
        chunk_size=videos.CHUNK_SIZE,
        position=(last or 0) + 1,
        created_by=cu.user.id,
    )
    db.add(row)
    await db.commit()
    return await _video_out(db, row)


@router.put("/videos/{video_id}/chunks/{n}")
async def put_chunk(
    video_id: uuid.UUID,
    n: int,
    request: Request,
    _: CurrentUser = Depends(admin_only),
    db: AsyncSession = Depends(get_db),
) -> dict:
    row = await _video(db, video_id)
    if row.status != "uploading":
        raise AppError(409, "video_complete", "Upload already finished")
    total = videos.chunk_count(row)
    if not 0 <= n < total:
        raise AppError(422, "invalid_chunk", "Chunk out of range")
    data = await request.body()
    expected = row.chunk_size if n < total - 1 else row.size - n * row.chunk_size
    if len(data) != expected:
        raise AppError(422, "invalid_chunk", "Wrong chunk size")
    chunk = await db.get(KidsVideoChunk, (row.id, n))
    if chunk is None:
        db.add(KidsVideoChunk(video_id=row.id, n=n, data=data))
    else:  # reenvio do mesmo pedaço (a conexão caiu no meio)
        chunk.data = data
    await db.commit()
    return {"n": n}


@router.post("/videos/{video_id}/complete")
async def complete_video(
    video_id: uuid.UUID, cu: CurrentUser = Depends(admin_only), db: AsyncSession = Depends(get_db)
) -> dict:
    row = await _video(db, video_id)
    chunks, got = await videos.received(db, row)
    if chunks != videos.chunk_count(row) or got != row.size:
        raise AppError(422, "video_incomplete", "Some parts of the video are missing")
    if row.status == "uploading":
        row.status = "draft"
        audit.record(db, "kids.video_uploaded", RequestMeta(None, None), cu.user.id, target=str(row.id))
        await db.commit()
    return await _video_out(db, row)


@router.put("/videos/{video_id}/poster")
async def put_poster(
    video_id: uuid.UUID,
    request: Request,
    _: CurrentUser = Depends(admin_only),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Imagem de capa do vídeo (aparece na lista antes de tocar)."""
    row = await _video(db, video_id)
    mime = (request.headers.get("content-type") or "").split(";")[0].strip()
    data = await request.body()
    if mime not in videos.POSTER_TYPES or not 0 < len(data) <= videos.MAX_POSTER:
        raise AppError(422, "invalid_image", "Send a JPG, PNG or WebP image up to 4 MB")
    row.poster, row.poster_mime = data, mime
    await db.commit()
    return await _video_out(db, row)


class VideoUpdateIn(BaseModel):
    title: Title | None = None
    description: Line | None = None
    language: LanguageCode | None = None
    level: Level | None = None
    status: Status | None = None


@router.patch("/videos/{video_id}")
async def update_video(
    video_id: uuid.UUID,
    body: VideoUpdateIn,
    cu: CurrentUser = Depends(admin_only),
    db: AsyncSession = Depends(get_db),
) -> dict:
    row = await _video(db, video_id)
    for field in ("title", "description", "language", "level"):
        value = getattr(body, field)
        if value is not None:
            setattr(row, field, value)
    if body.status:
        if row.status == "uploading":
            raise AppError(409, "video_incomplete", "Finish the upload first")
        if body.status == "published" and row.status != "published":
            row.published_at = datetime.now(UTC)
        elif body.status != "published":
            row.published_at = None
        if body.status != row.status:
            audit.record(
                db, f"kids.video_{body.status}", RequestMeta(None, None), cu.user.id, target=str(row.id)
            )
        row.status = body.status
    await db.commit()
    return await _video_out(db, row)


@router.delete("/videos/{video_id}", status_code=204)
async def delete_video(
    video_id: uuid.UUID, cu: CurrentUser = Depends(admin_only), db: AsyncSession = Depends(get_db)
) -> None:
    row = await _video(db, video_id)
    audit.record(db, "kids.video_deleted", RequestMeta(None, None), cu.user.id, target=str(row.id))
    await db.delete(row)
    await db.commit()
