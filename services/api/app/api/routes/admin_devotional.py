"""Painel do administrador: devocional do dia para todos os usuários.

O sistema já escolhe uma passagem por dia (366 por ano, sem repetir). Aqui o administrador vê a
agenda, troca a passagem ou o tema de qualquer dia, gera o texto com a IA (no idioma escolhido ou
nos três) ou escreve e corrige ele mesmo. O que for salvo aparece para todos naquele dia.
"""

import asyncio
from datetime import date, timedelta
from typing import Annotated, Literal

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel, Field, StringConstraints
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import CurrentUser, require_role
from app.bible import reference as ref_parser
from app.core.errors import AppError
from app.core.locales import BUILTIN, content_lang
from app.db.session import get_db
from app.devotional import service
from app.devotional.catalog import THEMES, item_for_day, reference
from app.models import DailyDevotional

router = APIRouter(prefix="/admin/devotionals", tags=["admin"])
admin_only = require_role("admin")

Locale = Literal["pt-BR", "en", "es"]


def _label(start: int, end: int, locale: str) -> str:
    return service.label_for(start, end, locale)


def _keys(text: str, locale: str) -> tuple[int, int]:
    try:
        refs = ref_parser.parse(text, locale)
    except ref_parser.ReferenceError as e:
        raise AppError(422, "invalid_reference", str(e)) from None
    if len(refs) != 1:
        raise AppError(422, "invalid_reference", "Use a single passage")
    return service.keys_for(refs[0])


async def _row(db: AsyncSession, day: date, locale: str) -> DailyDevotional | None:
    return await db.scalar(
        select(DailyDevotional).where(DailyDevotional.day == day, DailyDevotional.locale == locale)
    )


def _out(day: date, locale: str, row: DailyDevotional | None) -> dict:
    item = item_for_day(day)
    planned = service.keys_for(reference(item.ref))
    return {
        "day": day.isoformat(),
        "locale": locale,
        "theme": row.theme if row else item.theme,
        "reference": _label(row.verse_key_start, row.verse_key_end, locale)
        if row
        else _label(*planned, locale),
        "status": "none" if row is None else ("edited" if row.model.startswith("admin") else "auto"),
        "content": row.content if row else None,
    }


@router.get("")
async def agenda(
    locale: Locale = "pt-BR",
    start: date | None = None,
    days: int = Query(30, ge=1, le=120),
    _: CurrentUser = Depends(admin_only),
    db: AsyncSession = Depends(get_db),
) -> dict:
    first = start or date.today()
    rows = {
        r.day: r
        for r in await db.scalars(
            select(DailyDevotional).where(
                DailyDevotional.locale == locale,
                DailyDevotional.day >= first,
                DailyDevotional.day < first + timedelta(days=days),
            )
        )
    }
    return {
        "themes": [{"code": k, "label": v[content_lang(locale)]} for k, v in THEMES.items()],
        "days": [
            _out(first + timedelta(days=i), locale, rows.get(first + timedelta(days=i))) for i in range(days)
        ],
    }


class GenerateIn(BaseModel):
    day: date
    locales: list[Locale] = Field(default_factory=lambda: list(BUILTIN), min_length=1)
    theme: str | None = None
    # Em branco: a passagem que o sistema escolheu para o dia
    reference: str | None = Field(default=None, max_length=100)
    length: Literal["short", "medium", "long"] = "medium"


async def _store(db: AsyncSession, day: date, locale: str, theme: str, start: int, end: int, content, model):
    row = await _row(db, day, locale)
    if row is None:
        row = DailyDevotional(day=day, locale=locale)
        db.add(row)
    row.theme = theme
    row.translation_code = await service.translation_code(db, locale)
    row.verse_key_start, row.verse_key_end = start, end
    row.content = content
    row.model = model
    await db.commit()
    return row


@router.post("/generate")
async def generate(
    body: GenerateIn, _: CurrentUser = Depends(admin_only), db: AsyncSession = Depends(get_db)
) -> dict:
    """O Claude escreve o devocional em português; os outros idiomas são traduzidos dele (DeepSeek)."""
    if body.day < date.today():
        raise AppError(422, "past_day", "Choose today or a future day")
    item = item_for_day(body.day)
    theme = body.theme if body.theme in THEMES else item.theme
    locales = list(dict.fromkeys(body.locales))
    base_locale = service.BASE_LOCALE
    if base_locale in locales or body.reference or body.theme:
        start, end = (
            _keys(body.reference, base_locale) if body.reference else service.keys_for(reference(item.ref))
        )
        content, model = await service.generate_daily_content(db, base_locale, theme, start, end, body.length)
        base = await _store(db, body.day, base_locale, theme, start, end, content, f"admin:{model}")
    else:
        base = await service.daily(db, base_locale, body.day)
    out = [_out(body.day, base_locale, base)] if base_locale in locales else []
    for locale in locales:
        if locale == base_locale:
            continue
        translated = await service.translate_content(db, base.content, locale)
        if translated is None:  # sem tradução agora: o Claude escreve direto nesse idioma
            content, model = await service.generate_daily_content(
                db, locale, base.theme, base.verse_key_start, base.verse_key_end, body.length
            )
        else:
            content, model = translated
        row = await _store(
            db,
            body.day,
            locale,
            base.theme,
            base.verse_key_start,
            base.verse_key_end,
            content,
            f"admin:{model}",
        )
        out.append(_out(body.day, locale, row))
    return {"days": out}


Text = Annotated[str, StringConstraints(max_length=20_000)]


class ContentIn(BaseModel):
    title: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=200)]
    context: Text = ""
    reflection: Text = ""
    application: Text = ""
    questions: Annotated[list[Annotated[str, StringConstraints(max_length=500)]], Field(max_length=10)] = []
    prayer: Text = ""


class SaveIn(BaseModel):
    day: date
    locale: Locale
    theme: str
    reference: str = Field(min_length=2, max_length=100)
    content: ContentIn


@router.put("")
async def save(
    body: SaveIn, _: CurrentUser = Depends(admin_only), db: AsyncSession = Depends(get_db)
) -> dict:
    """Devocional escrito ou corrigido pelo administrador."""
    if body.theme not in THEMES:
        raise AppError(422, "invalid_theme", "Unknown theme")
    start, end = _keys(body.reference, body.locale)
    translation, verses = await service.passage_text(db, service.translation_for(body.locale), start, end)
    if not verses:
        raise AppError(404, "verse_not_found", "Passage not found")
    content = await service.checked_content(
        db, translation, {**body.content.model_dump(), "references": [_label(start, end, body.locale)]}
    )
    row = await _row(db, body.day, body.locale)
    if row is None:
        row = DailyDevotional(day=body.day, locale=body.locale)
        db.add(row)
    row.theme = body.theme
    row.translation_code = translation.code
    row.verse_key_start, row.verse_key_end = start, end
    row.content = content
    row.model = "admin"
    await db.commit()
    if body.locale == service.BASE_LOCALE:
        # As traduções daquele dia são refeitas a partir do texto corrigido (em segundo plano)
        asyncio.create_task(service.retranslate_day(body.day))
    return _out(body.day, body.locale, row)


@router.delete("/{day}/{locale}")
async def reset(
    day: date, locale: Locale, _: CurrentUser = Depends(admin_only), db: AsyncSession = Depends(get_db)
) -> dict:
    """Volta o dia ao automático: a passagem escolhida pelo sistema, com o texto gerado de novo.
    (A linha é mantida para não perder quem já marcou o devocional como concluído.)"""
    row = await _row(db, day, locale)
    if row is not None:
        item = item_for_day(day)
        start, end = service.keys_for(reference(item.ref))
        row.content, row.model = await service.generate_daily_content(db, locale, item.theme, start, end)
        row.theme = item.theme
        row.translation_code = service.translation_for(locale)
        row.verse_key_start, row.verse_key_end = start, end
        await db.commit()
    return _out(day, locale, row)
