"""Lembrete por e-mail dos compromissos da agenda (um dia antes)."""

import asyncio
import logging
from datetime import UTC, datetime, timedelta

from sqlalchemy import select, text

from app.core.config import get_settings
from app.db.session import get_engine, get_sessionmaker
from app.models import PreachingEvent, Sermon, User
from app.services import email as email_service

log = logging.getLogger("biblealpha.agenda")

REMIND_BEFORE = timedelta(hours=24)
INTERVAL_SECONDS = 300
LOCK_KEY = 7_204_211  # só uma instância da API envia os lembretes

_DATE_FORMAT = {"pt": "%d/%m/%Y", "es": "%d/%m/%Y", "en": "%m/%d/%Y"}


def _fmt_date(d, locale: str) -> str:
    return d.strftime(_DATE_FORMAT.get(locale.lower()[:2], "%d/%m/%Y"))


async def send_due(now: datetime | None = None) -> int:
    """Envia os lembretes que vencem agora. Devolve quantos foram enviados."""
    from app.api.routes.agenda import address_line

    now = now or datetime.now(UTC)
    sent = 0
    async with get_sessionmaker()() as db:
        rows = await db.execute(
            select(PreachingEvent, User, Sermon.title)
            .join(User, User.id == PreachingEvent.user_id)
            .outerjoin(Sermon, Sermon.id == PreachingEvent.sermon_id)
            .where(
                PreachingEvent.reminder_sent_at.is_(None),
                PreachingEvent.starts_at > now,
                PreachingEvent.starts_at <= now + REMIND_BEFORE,
                User.deleted_at.is_(None),
                User.email_verified_at.is_not(None),
            )
            .limit(500)
        )
        base = get_settings().app_url.rstrip("/")
        for event, user, title in rows:
            try:
                await email_service.send_agenda_reminder(
                    user.email,
                    user.locale,
                    church=event.church_name,
                    date=_fmt_date(event.local_date, user.locale),
                    time=event.local_time.strftime("%H:%M"),
                    address=address_line(event),
                    message=title,
                    notes=event.notes,
                    url=f"{base}/agenda/{event.id}",
                )
            except Exception:
                log.exception("lembrete da agenda %s não enviado", event.id)
                continue
            event.reminder_sent_at = now
            sent += 1
        await db.commit()
    return sent


async def loop() -> None:
    await asyncio.sleep(20)
    async with get_engine().connect() as conn:
        if not await conn.scalar(text("SELECT pg_try_advisory_lock(:k)"), {"k": LOCK_KEY}):
            return
        while True:
            try:
                n = await send_due()
                if n:
                    log.info("%s lembrete(s) da agenda enviado(s)", n)
            except Exception:
                log.exception("rotina de lembretes da agenda falhou")
            await asyncio.sleep(INTERVAL_SECONDS)
