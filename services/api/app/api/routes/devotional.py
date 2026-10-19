import uuid
from datetime import date, timedelta
from typing import Annotated, Literal

from fastapi import APIRouter, Depends, Response, status
from pydantic import BaseModel, Field, StringConstraints
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import CurrentUser, current_user, require_role
from app.core import ratelimit
from app.core.errors import AppError
from app.core.locales import content_lang
from app.db.session import get_db
from app.devotional import service
from app.devotional.catalog import THEMES, plans, reading_out
from app.models import DailyDevotional, NotificationPreference, PlanDayDone, PlanEnrollment, UserDevotional

router = APIRouter(tags=["devotional"])


def _lang(locale: str) -> str:
    return content_lang(locale)


async def _devotional_out(db: AsyncSession, row, locale: str, mine: UserDevotional | None = None) -> dict:
    translation, verses = await service.passage_text(
        db, row.translation_code, row.verse_key_start, row.verse_key_end
    )
    label = service.label_for(row.verse_key_start, row.verse_key_end, locale)
    out = {
        "id": str(row.id),
        "theme": row.theme,
        "theme_label": THEMES[row.theme][_lang(locale)] if row.theme in THEMES else None,
        "reference": label,
        "verse_key_start": row.verse_key_start,
        "verse_key_end": row.verse_key_end,
        "translation": translation.abbreviation,
        "translation_code": translation.code,
        "verses": verses,
        "content": row.content,
    }
    if isinstance(row, DailyDevotional):
        out["day"] = row.day.isoformat()
        out["kind"] = "daily"
    else:
        out["kind"] = row.kind
        out["created_at"] = row.created_at.isoformat()
    if mine is not None:
        out["mine"] = {
            "id": str(mine.id),
            "completed_on": mine.completed_on.isoformat() if mine.completed_on else None,
            "favorite": mine.favorite,
            "note": mine.note,
        }
    return out


@router.get("/devotionals/themes")
async def themes(cu: CurrentUser = Depends(current_user)) -> dict:
    return {"themes": [{"code": k, "label": v[_lang(cu.user.locale)]} for k, v in THEMES.items()]}


@router.get("/devotionals/today")
async def today(cu: CurrentUser = Depends(current_user), db: AsyncSession = Depends(get_db)) -> dict:
    row = await service.daily(db, cu.user.locale)
    mine = await db.scalar(
        select(UserDevotional).where(UserDevotional.user_id == cu.user.id, UserDevotional.daily_id == row.id)
    )
    return await _devotional_out(db, row, cu.user.locale, mine)


class MarkIn(BaseModel):
    completed: bool | None = None
    favorite: bool | None = None
    note: Annotated[str, StringConstraints(max_length=10_000)] | None = None


async def _apply_mark(row: UserDevotional, body: MarkIn) -> None:
    if body.completed is not None:
        row.completed_on = date.today() if body.completed else None
    if body.favorite is not None:
        row.favorite = body.favorite
    if body.note is not None:
        row.note = body.note


@router.post("/devotionals/today/mark")
async def mark_today(
    body: MarkIn, cu: CurrentUser = Depends(current_user), db: AsyncSession = Depends(get_db)
) -> dict:
    row = await service.daily(db, cu.user.locale)
    mine = await db.scalar(
        select(UserDevotional).where(UserDevotional.user_id == cu.user.id, UserDevotional.daily_id == row.id)
    )
    if mine is None:
        mine = UserDevotional(user_id=cu.user.id, kind="daily", daily_id=row.id, theme=row.theme)
        db.add(mine)
    await _apply_mark(mine, body)
    await db.commit()
    return {
        "mine": {
            "completed_on": mine.completed_on.isoformat() if mine.completed_on else None,
            "favorite": mine.favorite,
            "note": mine.note,
        },
        **(await service.streak(db, cu.user.id)),
    }


class PersonalIn(BaseModel):
    theme: str | None = None
    verse_key_start: int | None = Field(None, ge=1_001_001, le=66_999_999)
    verse_key_end: int | None = Field(None, ge=1_001_001, le=66_999_999)
    length: Literal["short", "medium", "long"] = "medium"


@router.post("/devotionals/personal")
async def personal(
    body: PersonalIn, cu: CurrentUser = Depends(require_role("admin")), db: AsyncSession = Depends(get_db)
) -> dict:
    """Devocional sob medida gerado pela IA: só o administrador (para preparar e publicar)."""
    await ratelimit.hit(f"devotional:{cu.user.id}", limit=10, window_seconds=60)
    row = await service.personal(
        db, cu.user, theme=body.theme, start=body.verse_key_start, end=body.verse_key_end, length=body.length
    )
    return await _devotional_out(db, row, cu.user.locale, row)


class OwnIn(BaseModel):
    title: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=200)]
    verse_key_start: int = Field(ge=1_001_001, le=66_999_999)
    verse_key_end: int | None = Field(None, ge=1_001_001, le=66_999_999)
    theme: str | None = None
    reflection: Annotated[str, StringConstraints(max_length=20_000)] = ""
    application: Annotated[str, StringConstraints(max_length=10_000)] = ""
    prayer: Annotated[str, StringConstraints(max_length=5_000)] = ""
    questions: Annotated[list[Annotated[str, StringConstraints(max_length=500)]], Field(max_length=10)] = []


@router.post("/me/devotionals")
async def create_own(
    body: OwnIn, cu: CurrentUser = Depends(current_user), db: AsyncSession = Depends(get_db)
) -> dict:
    """Devocional escrito pelo próprio usuário."""
    row = UserDevotional(
        user_id=cu.user.id,
        kind="own",
        theme=body.theme if body.theme in THEMES else None,
        translation_code=service.translation_for(cu.user.locale),
        verse_key_start=body.verse_key_start,
        verse_key_end=body.verse_key_end or body.verse_key_start,
        content={
            "title": body.title,
            "context": "",
            "reflection": body.reflection,
            "application": body.application,
            "questions": body.questions,
            "prayer": body.prayer,
        },
    )
    db.add(row)
    await db.commit()
    return await _devotional_out(db, row, cu.user.locale, row)


@router.get("/me/devotionals")
async def my_devotionals(
    favorites: bool = False,
    completed: bool = False,
    cu: CurrentUser = Depends(current_user),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Meus devocionais. `completed`: os que o usuário concluiu, do mais recente ao mais antigo."""
    stmt = select(UserDevotional).where(UserDevotional.user_id == cu.user.id)
    if favorites:
        stmt = stmt.where(UserDevotional.favorite.is_(True))
    if completed:
        stmt = stmt.where(UserDevotional.completed_on.is_not(None))
        order = UserDevotional.completed_on.desc()
    else:
        order = UserDevotional.created_at.desc()
    rows = list(await db.scalars(stmt.order_by(order, UserDevotional.created_at.desc()).limit(500)))
    out = []
    for r in rows:
        source = await db.get(DailyDevotional, r.daily_id) if r.kind == "daily" and r.daily_id else r
        if source is None:
            continue
        item = await _devotional_out(db, source, cu.user.locale, r)
        out.append(item)
    return {"devotionals": out}


@router.patch("/me/devotionals/{devotional_id}")
async def mark(
    devotional_id: uuid.UUID,
    body: MarkIn,
    cu: CurrentUser = Depends(current_user),
    db: AsyncSession = Depends(get_db),
) -> dict:
    row = await db.get(UserDevotional, devotional_id)
    if row is None or row.user_id != cu.user.id:
        raise AppError(404, "devotional_not_found", "Devotional not found")
    await _apply_mark(row, body)
    await db.commit()
    return {"ok": True}


@router.delete("/me/devotionals/{devotional_id}", status_code=status.HTTP_204_NO_CONTENT)
async def remove(
    devotional_id: uuid.UUID, cu: CurrentUser = Depends(current_user), db: AsyncSession = Depends(get_db)
) -> Response:
    row = await db.get(UserDevotional, devotional_id)
    if row is None or row.user_id != cu.user.id:
        raise AppError(404, "devotional_not_found", "Devotional not found")
    await db.delete(row)
    await db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/me/devotionals/stats")
async def stats(cu: CurrentUser = Depends(current_user), db: AsyncSession = Depends(get_db)) -> dict:
    return await service.streak(db, cu.user.id)


# ---------- Planos de leitura ----------


def _plan_summary(code: str, locale: str) -> dict:
    p = plans()[code]
    lang = _lang(locale)
    return {
        "code": p.code,
        "category": p.category,
        "title": p.title[lang],
        "description": p.description[lang],
        "days": len(p.days),
    }


@router.get("/reading-plans")
async def plan_catalog(cu: CurrentUser = Depends(current_user)) -> dict:
    return {"plans": [_plan_summary(code, cu.user.locale) for code in plans()]}


@router.get("/reading-plans/{code}")
async def plan_detail(code: str, cu: CurrentUser = Depends(current_user)) -> dict:
    if code not in plans():
        raise AppError(404, "plan_not_found", "Plan not found")
    p = plans()[code]
    return {
        **_plan_summary(code, cu.user.locale),
        "schedule": [
            {"day": i + 1, "readings": [reading_out(r, cu.user.locale) for r in day]}
            for i, day in enumerate(p.days)
        ],
    }


def _current_day(e: PlanEnrollment, today: date) -> int:
    reference_day = e.paused_on if e.status == "paused" and e.paused_on else today
    return max(1, (reference_day - e.start_date).days + 1)


async def _enrollment_out(db: AsyncSession, e: PlanEnrollment, locale: str) -> dict:
    p = plans()[e.plan_code]
    done = sorted(await db.scalars(select(PlanDayDone.day).where(PlanDayDone.enrollment_id == e.id)))
    total = len(p.days)
    current = min(_current_day(e, date.today()), total)
    next_day = next((d for d in range(1, total + 1) if d not in done), None)
    return {
        "id": str(e.id),
        "plan": _plan_summary(e.plan_code, locale),
        "status": e.status,
        "start_date": e.start_date.isoformat(),
        "current_day": current,
        "done_days": done,
        "progress": round(len(done) / total * 100, 1),
        # Atraso: dias do calendário já passados e ainda não lidos
        "behind": len([d for d in range(1, current) if d not in done]),
        "today": {"day": current, "readings": [reading_out(r, locale) for r in p.days[current - 1]]},
        "next_unread": next_day,
    }


async def _own_enrollment(db: AsyncSession, cu: CurrentUser, enrollment_id: uuid.UUID) -> PlanEnrollment:
    e = await db.get(PlanEnrollment, enrollment_id)
    if e is None or e.user_id != cu.user.id:
        raise AppError(404, "enrollment_not_found", "Plan not found")
    return e


class EnrollIn(BaseModel):
    code: str
    start_date: date | None = None


@router.post("/me/reading-plans")
async def enroll(
    body: EnrollIn, cu: CurrentUser = Depends(current_user), db: AsyncSession = Depends(get_db)
) -> dict:
    if body.code not in plans():
        raise AppError(404, "plan_not_found", "Plan not found")
    e = PlanEnrollment(user_id=cu.user.id, plan_code=body.code, start_date=body.start_date or date.today())
    db.add(e)
    await db.commit()
    return await _enrollment_out(db, e, cu.user.locale)


@router.get("/me/reading-plans")
async def my_plans(cu: CurrentUser = Depends(current_user), db: AsyncSession = Depends(get_db)) -> dict:
    rows = await db.scalars(
        select(PlanEnrollment)
        .where(PlanEnrollment.user_id == cu.user.id)
        .order_by(PlanEnrollment.created_at.desc())
    )
    return {"enrollments": [await _enrollment_out(db, e, cu.user.locale) for e in rows]}


class DayIn(BaseModel):
    done: bool = True


@router.post("/me/reading-plans/{enrollment_id}/days/{day}")
async def mark_day(
    enrollment_id: uuid.UUID,
    day: int,
    body: DayIn,
    cu: CurrentUser = Depends(current_user),
    db: AsyncSession = Depends(get_db),
) -> dict:
    e = await _own_enrollment(db, cu, enrollment_id)
    if not 1 <= day <= len(plans()[e.plan_code].days):
        raise AppError(422, "invalid_day", "Invalid day")
    existing = await db.get(PlanDayDone, (e.id, day))
    if body.done and existing is None:
        db.add(PlanDayDone(enrollment_id=e.id, day=day))
    elif not body.done and existing is not None:
        await db.delete(existing)
    await db.flush()
    done = await db.scalars(select(PlanDayDone.day).where(PlanDayDone.enrollment_id == e.id))
    e.status = (
        "done"
        if len(set(done)) == len(plans()[e.plan_code].days)
        else ("paused" if e.status == "paused" else "active")
    )
    await db.commit()
    return await _enrollment_out(db, e, cu.user.locale)


class ActionIn(BaseModel):
    action: Literal["pause", "resume", "reschedule"]


@router.post("/me/reading-plans/{enrollment_id}/action")
async def plan_action(
    enrollment_id: uuid.UUID,
    body: ActionIn,
    cu: CurrentUser = Depends(current_user),
    db: AsyncSession = Depends(get_db),
) -> dict:
    e = await _own_enrollment(db, cu, enrollment_id)
    today = date.today()
    if body.action == "pause" and e.status == "active":
        e.status, e.paused_on = "paused", today
    elif body.action == "resume" and e.status == "paused" and e.paused_on:
        # Os dias pausados não contam: o plano continua de onde parou
        e.start_date += timedelta(days=(today - e.paused_on).days)
        e.status, e.paused_on = "active", None
    elif body.action == "reschedule":
        # Reprograma para que hoje seja o primeiro dia ainda não lido
        done = set(await db.scalars(select(PlanDayDone.day).where(PlanDayDone.enrollment_id == e.id)))
        first = next((d for d in range(1, len(plans()[e.plan_code].days) + 1) if d not in done), 1)
        e.start_date = today - timedelta(days=first - 1)
        e.status, e.paused_on = "active", None
    await db.commit()
    return await _enrollment_out(db, e, cu.user.locale)


@router.delete("/me/reading-plans/{enrollment_id}", status_code=status.HTTP_204_NO_CONTENT)
async def leave_plan(
    enrollment_id: uuid.UUID, cu: CurrentUser = Depends(current_user), db: AsyncSession = Depends(get_db)
) -> Response:
    e = await _own_enrollment(db, cu, enrollment_id)
    await db.execute(delete(PlanEnrollment).where(PlanEnrollment.id == e.id))
    await db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


# ---------- Lembretes ----------


class NotificationIn(BaseModel):
    devotional_time: Annotated[str, StringConstraints(pattern=r"^([01]\d|2[0-3]):[0-5]\d$")] | None = None
    plan_reminders: bool = True
    timezone: Annotated[str, StringConstraints(max_length=60)] = "America/Sao_Paulo"


@router.get("/me/notifications")
async def get_notifications(
    cu: CurrentUser = Depends(current_user), db: AsyncSession = Depends(get_db)
) -> dict:
    p = await db.get(NotificationPreference, cu.user.id)
    if p is None:
        return {"devotional_time": None, "plan_reminders": True, "timezone": "America/Sao_Paulo"}
    return {"devotional_time": p.devotional_time, "plan_reminders": p.plan_reminders, "timezone": p.timezone}


@router.put("/me/notifications")
async def put_notifications(
    body: NotificationIn, cu: CurrentUser = Depends(current_user), db: AsyncSession = Depends(get_db)
) -> dict:
    p = await db.get(NotificationPreference, cu.user.id)
    if p is None:
        p = NotificationPreference(user_id=cu.user.id)
        db.add(p)
    p.devotional_time, p.plan_reminders, p.timezone = body.devotional_time, body.plan_reminders, body.timezone
    await db.commit()
    return body.model_dump()
