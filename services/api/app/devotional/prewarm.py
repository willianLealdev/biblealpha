"""Deixa o devocional do dia pronto antes de o usuário abrir (português pelo Claude, os outros
idiomas traduzidos dele).

A cada hora, gera (se ainda não existir) o devocional de hoje e dos próximos dias em cada
idioma do app: português, inglês, espanhol e os idiomas ativados no painel. Cada dia e idioma é
gerado uma única vez e servido a todos os usuários daquele idioma.
"""

import asyncio
import logging
from datetime import UTC, date, datetime, timedelta

from sqlalchemy import select, text

from app.core.locales import BUILTIN
from app.db.session import get_engine, get_sessionmaker
from app.devotional import service
from app.models import User
from app.services.settings import get_setting

log = logging.getLogger(__name__)

LOCK = 734_120_002  # só um processo da API prepara por vez
DAYS_AHEAD = 2
EVERY_SECONDS = 3600


async def locales() -> list[str]:
    """Idiomas preparados com antecedência: os do app e os que usuários ativos (últimos 30 dias) usam."""
    async with get_sessionmaker()() as db:
        extra = [
            x["code"] for x in (await get_setting(db, "ui.languages")).get("items", []) if x.get("enabled")
        ]
        since = datetime.now(UTC) - timedelta(days=30)
        used = await db.scalars(
            select(User.locale).where(User.deleted_at.is_(None), User.last_login_at >= since).distinct()
        )
        active = [await service.devotional_locale(db, code) for code in used]
    return list(dict.fromkeys([*BUILTIN, *extra, *active]))


async def prepare(days_ahead: int = DAYS_AHEAD) -> int:
    """Gera o que faltar. Devolve quantos devocionais foram preparados agora."""
    made = 0
    for locale in await locales():
        for i in range(days_ahead + 1):
            day = date.today() + timedelta(days=i)
            async with get_sessionmaker()() as db:
                target = await service.devotional_locale(db, locale)
                if await service.find_daily(db, day, target) is None:
                    await service.daily(db, target, day)
                    made += 1
    return made


async def loop() -> None:
    await asyncio.sleep(20)  # deixa a API subir primeiro
    async with get_engine().connect() as conn:
        if not await conn.scalar(text("SELECT pg_try_advisory_lock(:k)"), {"k": LOCK}):
            return
        while True:
            try:
                made = await prepare()
                if made:
                    log.info("Devocionais preparados com antecedência: %s", made)
            except Exception:  # IA fora do ar etc.: tenta de novo na próxima hora
                log.exception("Falha ao preparar os devocionais")
            await asyncio.sleep(EVERY_SECONDS)
