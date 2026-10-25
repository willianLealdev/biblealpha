"""BibleAlpha Kids: regras comuns às rotas públicas e do painel."""

import re
import unicodedata
import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import KidsStory, KidsStoryPage

LANGUAGES = ("pt-BR", "en", "es")
LEVELS = ("small", "big", "both")
STATUSES = ("draft", "review", "published")


def slugify(title: str) -> str:
    """Endereço amigável da história (ex.: "davi-e-golias-3f9a1c"); o final evita repetição."""
    plain = unicodedata.normalize("NFKD", title).encode("ascii", "ignore").decode().lower()
    base = re.sub(r"[^a-z0-9]+", "-", plain).strip("-")[:60] or "historia"
    return f"{base}-{uuid.uuid4().hex[:6]}"


async def pages_of(db: AsyncSession, story_id: uuid.UUID) -> list[KidsStoryPage]:
    return list(
        await db.scalars(
            select(KidsStoryPage).where(KidsStoryPage.story_id == story_id).order_by(KidsStoryPage.position)
        )
    )


def public_out(story: KidsStory, pages: list[KidsStoryPage] | None = None) -> dict:
    """O que a criança vê: só o conteúdo publicado, sem dados do painel (quem criou, IA, custo)."""
    out = {
        "slug": story.slug,
        "language": story.language,
        "title": story.title,
        "summary": story.summary,
        "reference": story.reference,
        "level": story.level,
    }
    if pages is not None:
        out["pages"] = [{"text": p.text} for p in pages]
        out["lesson"] = story.lesson
        out["family_question"] = story.family_question
        out["quiz"] = story.quiz or []
    return out
