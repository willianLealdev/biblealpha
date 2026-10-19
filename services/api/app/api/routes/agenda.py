"""Agenda do pregador: data, hora, igreja, endereço (conforme o país), mensagem anexada e observações."""

import uuid
from datetime import UTC, date, datetime, time, timedelta
from typing import Annotated
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from fastapi import APIRouter, Depends, Response
from pydantic import BaseModel, Field, StringConstraints
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import CurrentUser, current_user
from app.core import ratelimit
from app.core.errors import AppError
from app.db.session import get_db
from app.models import PreachingEvent, Sermon

router = APIRouter(prefix="/agenda", tags=["agenda"])

Short = Annotated[str, StringConstraints(strip_whitespace=True, max_length=120)]


class EventIn(BaseModel):
    local_date: date
    local_time: time
    # Fuso do aparelho (ex.: "America/Sao_Paulo") e o deslocamento em minutos naquela data, como reserva
    timezone: Annotated[str, StringConstraints(max_length=64)] | None = None
    utc_offset_minutes: int = Field(0, ge=-14 * 60, le=14 * 60)
    church_name: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=160)]
    country: Annotated[str, StringConstraints(pattern=r"^[A-Z]{2}$")] | None = None
    postal_code: Annotated[str, StringConstraints(strip_whitespace=True, max_length=20)] | None = None
    street: Annotated[str, StringConstraints(strip_whitespace=True, max_length=200)] | None = None
    number: Annotated[str, StringConstraints(strip_whitespace=True, max_length=20)] | None = None
    complement: Short | None = None
    district: Short | None = None
    city: Short | None = None
    region: Short | None = None
    sermon_id: uuid.UUID | None = None
    notes: Annotated[str, StringConstraints(max_length=5000)] = ""


def starts_at(local_date: date, local_time: time, tz: str | None, offset_minutes: int) -> datetime:
    naive = datetime.combine(local_date, local_time)
    if tz:
        try:
            return naive.replace(tzinfo=ZoneInfo(tz)).astimezone(UTC)
        except (ZoneInfoNotFoundError, ValueError):
            pass
    return (naive - timedelta(minutes=offset_minutes)).replace(tzinfo=UTC)


def address_line(e: PreachingEvent) -> str:
    street = " ".join(x for x in (e.street, e.number) if x)
    if e.street and e.number:
        street = f"{e.street}, {e.number}"
    parts = [street, e.complement, e.district, e.city, e.region, e.postal_code, e.country]
    return " · ".join(p for p in parts if p)


def _out(e: PreachingEvent, sermon_title: str | None) -> dict:
    return {
        "id": str(e.id),
        "local_date": e.local_date.isoformat(),
        "local_time": e.local_time.strftime("%H:%M"),
        "timezone": e.timezone,
        "starts_at": e.starts_at.isoformat(),
        "church_name": e.church_name,
        "country": e.country,
        "postal_code": e.postal_code,
        "street": e.street,
        "number": e.number,
        "complement": e.complement,
        "district": e.district,
        "city": e.city,
        "region": e.region,
        "address": address_line(e),
        "sermon_id": str(e.sermon_id) if e.sermon_id else None,
        "sermon_title": sermon_title,
        "notes": e.notes,
        "reminder_sent": e.reminder_sent_at is not None,
    }


async def _own(db: AsyncSession, cu: CurrentUser, event_id: uuid.UUID) -> PreachingEvent:
    e = await db.get(PreachingEvent, event_id)
    if e is None or e.user_id != cu.user.id:
        raise AppError(404, "event_not_found", "Appointment not found")
    return e


async def _sermon_title(db: AsyncSession, cu: CurrentUser, sermon_id: uuid.UUID | None) -> str | None:
    if sermon_id is None:
        return None
    s = await db.get(Sermon, sermon_id)
    # Só a própria ministração pode ser anexada
    if s is None or s.user_id != cu.user.id or s.deleted_at is not None:
        raise AppError(404, "sermon_not_found", "Sermon not found")
    return s.title


def _apply(e: PreachingEvent, body: EventIn) -> None:
    new_start = starts_at(body.local_date, body.local_time, body.timezone, body.utc_offset_minutes)
    if e.starts_at != new_start:
        e.reminder_sent_at = None  # data mudou: lembra de novo
    data = body.model_dump()
    for k, v in data.items():
        setattr(e, k, v)
    e.starts_at = new_start


@router.get("")
async def list_events(
    past: bool = False, cu: CurrentUser = Depends(current_user), db: AsyncSession = Depends(get_db)
) -> dict:
    now = datetime.now(UTC) - timedelta(hours=3)  # o compromisso de hoje continua na lista
    q = select(PreachingEvent, Sermon.title).outerjoin(Sermon, Sermon.id == PreachingEvent.sermon_id)
    q = q.where(PreachingEvent.user_id == cu.user.id)
    if past:
        q = q.where(PreachingEvent.starts_at < now).order_by(PreachingEvent.starts_at.desc()).limit(200)
    else:
        q = q.where(PreachingEvent.starts_at >= now).order_by(PreachingEvent.starts_at).limit(200)
    rows = await db.execute(q)
    return {"items": [_out(e, title) for e, title in rows]}


@router.post("", status_code=201)
async def create_event(
    body: EventIn, cu: CurrentUser = Depends(current_user), db: AsyncSession = Depends(get_db)
) -> dict:
    await ratelimit.hit(f"agenda:{cu.user.id}", limit=60, window_seconds=600)
    title = await _sermon_title(db, cu, body.sermon_id)
    e = PreachingEvent(user_id=cu.user.id)
    _apply(e, body)
    db.add(e)
    await db.commit()
    return _out(e, title)


@router.get("/{event_id}")
async def get_event(
    event_id: uuid.UUID, cu: CurrentUser = Depends(current_user), db: AsyncSession = Depends(get_db)
) -> dict:
    e = await _own(db, cu, event_id)
    title = (await db.get(Sermon, e.sermon_id)).title if e.sermon_id else None
    return _out(e, title)


@router.put("/{event_id}")
async def update_event(
    event_id: uuid.UUID,
    body: EventIn,
    cu: CurrentUser = Depends(current_user),
    db: AsyncSession = Depends(get_db),
) -> dict:
    e = await _own(db, cu, event_id)
    title = await _sermon_title(db, cu, body.sermon_id)
    _apply(e, body)
    await db.commit()
    return _out(e, title)


@router.delete("/{event_id}", status_code=204)
async def delete_event(
    event_id: uuid.UUID, cu: CurrentUser = Depends(current_user), db: AsyncSession = Depends(get_db)
) -> Response:
    e = await _own(db, cu, event_id)
    await db.delete(e)
    await db.commit()
    return Response(status_code=204)
