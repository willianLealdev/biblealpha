"""BibleAlpha Kids: rotas públicas, sem login e somente leitura.

Mostram apenas o que o administrador publicou (e o texto bíblico já cadastrado), em qualquer
idioma do BibleAlpha: as histórias são traduzidas uma vez por idioma e salvas para todos.
Não recebem nem guardam nada da criança.
"""

import uuid
from typing import Literal

from fastapi import APIRouter, Depends, Request
from fastapi.responses import Response
from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import request_meta
from app.core import ratelimit
from app.core.errors import AppError
from app.db.session import get_db
from app.kids import service, translate
from app.kids import videos as kids_videos
from app.models import BibleVerse, KidsStory, KidsStoryPage, KidsStoryTranslation, KidsVerse, KidsVideo
from app.services import bible as bible_service
from app.services.settings import get_setting

router = APIRouter(prefix="/kids", tags=["kids"])

LevelQuery = Literal["small", "big"]


def _language(code: str) -> str:
    if not translate.valid_language(code):
        raise AppError(422, "language_not_found", "Unknown language")
    return code


def _levels(query, model, level: str | None):
    return query.where(model.level.in_((level, "both"))) if level else query


async def _page_counts(db: AsyncSession, ids: list) -> dict:
    rows = await db.execute(
        select(KidsStoryPage.story_id, func.count())
        .where(KidsStoryPage.story_id.in_(ids))
        .group_by(KidsStoryPage.story_id)
    )
    return dict(rows.all())


@router.get("/stories")
async def stories(
    language: str = "pt-BR",
    level: LevelQuery | None = None,
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Histórias do idioma. Em outro idioma que não o português, as que ainda não foram
    traduzidas começam a ser traduzidas agora ("preparing" diz quantas faltam)."""
    language = _language(language)
    native = list(
        await db.scalars(
            _levels(
                select(KidsStory).where(KidsStory.status == "published", KidsStory.language == language),
                KidsStory,
                level,
            ).order_by(KidsStory.position, KidsStory.published_at.desc())
        )
    )
    out = [(s, None) for s in native]
    waiting = 0
    if language != translate.BASE:
        base = list(
            await db.scalars(
                _levels(
                    select(KidsStory).where(
                        KidsStory.status == "published", KidsStory.language == translate.BASE
                    ),
                    KidsStory,
                    level,
                ).order_by(KidsStory.position, KidsStory.published_at.desc())
            )
        )
        done = {
            t.story_id: t
            for t in await db.scalars(
                select(KidsStoryTranslation).where(
                    KidsStoryTranslation.language == language,
                    KidsStoryTranslation.story_id.in_([s.id for s in base]),
                )
            )
        }
        out += [(s, done[s.id]) for s in base if s.id in done]
        waiting = sum(1 for s in base if s.id not in done)
        if waiting:
            translate.start(language)
    counts = await _page_counts(db, [s.id for s, _ in out])
    books = await translate.book_names(db, language)
    items = []
    for s, tr in out:
        card = service.public_out(s)
        card["reference"] = translate.label(s.verse_key_start, s.verse_key_end, language, books)
        card["language"] = language
        if tr:
            card["title"], card["summary"] = tr.title, tr.summary
        items.append({**card, "pages": counts.get(s.id, 0), "quiz": len(s.quiz or [])})
    return {"stories": items, "preparing": waiting}


@router.get("/stories/{slug}")
async def story(slug: str, language: str = "pt-BR", db: AsyncSession = Depends(get_db)) -> dict:
    language = _language(language)
    row = await db.scalar(select(KidsStory).where(KidsStory.slug == slug, KidsStory.status == "published"))
    if row is None:
        raise AppError(404, "story_not_found", "Story not found")
    out = service.public_out(row, await service.pages_of(db, row.id))
    if row.language != language and row.language == translate.BASE:
        # Primeira pessoa a abrir nesse idioma: traduz agora e fica salvo para os próximos
        tr = await translate.translate_story(db, row, language)
        if tr is None:
            raise AppError(503, "translation_unavailable", "Translation is not ready yet")
        out.update(
            title=tr.title,
            summary=tr.summary,
            pages=[{"text": p} for p in tr.pages],
            lesson=tr.lesson,
            family_question=tr.family_question,
            quiz=tr.quiz,
            language=language,
        )
    out["reference"] = translate.label(
        row.verse_key_start, row.verse_key_end, out["language"], await translate.book_names(db, language)
    )
    return out


@router.get("/verses")
async def verses(
    language: str = "pt-BR",
    level: LevelQuery | None = None,
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Versículos publicados. Em outro idioma: os mesmos versículos, com o texto da Bíblia desse
    idioma (sem Bíblia nele, a padrão em inglês). Nunca traduzidos pela IA."""
    language = _language(language)
    own = list(
        await db.scalars(
            _levels(
                select(KidsVerse).where(KidsVerse.status == "published", KidsVerse.language == language),
                KidsVerse,
                level,
            ).order_by(KidsVerse.position)
        )
    )
    if own:
        return {"verses": [{"reference": v.reference, "text": v.text} for v in own]}
    base = list(
        await db.scalars(
            _levels(
                select(KidsVerse).where(
                    KidsVerse.status == "published", KidsVerse.language == translate.BASE
                ),
                KidsVerse,
                level,
            ).order_by(KidsVerse.position)
        )
    )
    if not base:
        return {"verses": []}
    code = (await bible_service.language_bibles(db)).pick(language) or "web"
    translation = await bible_service.get_translation(db, code)
    rows = await db.execute(
        select(BibleVerse.verse_key, BibleVerse.text).where(
            BibleVerse.translation_id == translation.id,
            or_(*[BibleVerse.verse_key.between(v.verse_key_start, v.verse_key_end) for v in base]),
        )
    )
    text = dict(rows.all())
    books = await translate.book_names(db, language)
    out = []
    for v in base:
        words = [text[k] for k in sorted(text) if v.verse_key_start <= k <= v.verse_key_end]
        if words:
            out.append(
                {
                    "reference": translate.label(v.verse_key_start, v.verse_key_end, language, books),
                    "text": " ".join(w.strip() for w in words),
                }
            )
    return {"verses": out}


@router.get("/bibles")
async def bibles(language: str = "pt-BR", db: AsyncSession = Depends(get_db)) -> dict:
    """Bíblias do idioma (as mesmas do app oficial), a padrão primeiro; sem nenhuma, a em inglês."""
    language = _language(language)
    index = await bible_service.language_bibles(db)
    items = index.options(language) or index.options("en")
    return {"bibles": [{"code": t.code, "name": t.name, "abbreviation": t.abbreviation} for t in items]}


@router.post("/languages/{code}/prepare")
async def prepare(code: str, request: Request, db: AsyncSession = Depends(get_db)) -> dict:
    """O aparelho da criança está num idioma que o app ainda não tem: a tradução dos textos e das
    histórias começa agora (uma vez por idioma; depois vale para todos). Sem login, com limite por IP."""
    from app.api.routes import languages as languages_routes

    code = _language(code)
    if code in ("pt-BR", "en", "es"):
        return {"status": "ready"}
    await ratelimit.hit(f"kids-lang:{request_meta(request).ip}", limit=20, window_seconds=3600)
    translate.start(code)
    meta = next((x for x in await languages_routes._languages(db) if x["code"] == code), None)
    if meta and meta.get("enabled"):
        return {"status": "ready"}
    if not (await get_setting(db, languages_routes.SOURCE_KEY)).get("dictionary"):
        raise AppError(503, "language_unavailable", "This language is not available yet")
    languages_routes._start(code)
    return {"status": "preparing"}


@router.get("/videos")
async def list_videos(
    language: str = "pt-BR",
    level: LevelQuery | None = None,
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Vídeos publicados no idioma; sem nenhum nesse idioma, os em português."""
    language = _language(language)

    async def published(lang: str) -> list[KidsVideo]:
        query = select(KidsVideo).where(KidsVideo.status == "published", KidsVideo.language == lang)
        return list(await db.scalars(_levels(query, KidsVideo, level).order_by(KidsVideo.position)))

    rows = await published(language)
    if not rows and language != translate.BASE:
        rows = await published(translate.BASE)
    return {
        "videos": [
            {
                "id": str(v.id),
                "title": v.title,
                "description": v.description,
                "language": v.language,
                "has_poster": v.poster_mime is not None,
            }
            for v in rows
        ]
    }


async def _published_video(db: AsyncSession, video_id: str) -> KidsVideo:
    try:
        key = uuid.UUID(video_id)
    except ValueError:
        raise AppError(404, "video_not_found", "Video not found") from None
    row = await db.get(KidsVideo, key)
    if row is None or row.status != "published":
        raise AppError(404, "video_not_found", "Video not found")
    return row


@router.get("/videos/{video_id}/file")
async def video_file(video_id: str, request: Request, db: AsyncSession = Depends(get_db)) -> Response:
    """O vídeo, inteiro ou por partes (o Safari do iPhone pede por partes)."""
    return kids_videos.stream(request, await _published_video(db, video_id))


@router.get("/videos/{video_id}/poster")
async def video_poster(video_id: str, db: AsyncSession = Depends(get_db)) -> Response:
    row = await _published_video(db, video_id)
    poster = await db.scalar(select(KidsVideo.poster).where(KidsVideo.id == row.id))
    if not poster:
        raise AppError(404, "poster_not_found", "No poster")
    return Response(poster, media_type=row.poster_mime, headers={"Cache-Control": "public, max-age=86400"})
