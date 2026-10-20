import uuid

from fastapi import APIRouter, Depends, Response, status
from fastapi.responses import JSONResponse
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import CurrentUser, current_user, request_meta
from app.core import ratelimit
from app.db.session import get_db
from app.models import User
from app.schemas.auth import (
    ChangePasswordIn,
    DeleteAccountIn,
    PreferencesIn,
    PreferencesOut,
    SessionOut,
    UserOut,
    UserUpdateIn,
)
from app.services import auth as auth_service
from app.services.audit import RequestMeta
from app.services.plans import get_plan

router = APIRouter(prefix="/me", tags=["account"])


def _user_out(user: User, plan: str = "free") -> UserOut:
    return UserOut(
        plan=plan,
        id=user.id,
        email=user.email,
        name=user.name,
        locale=user.locale,
        country=user.country,
        email_verified=user.email_verified_at is not None,
        roles=user.role_names,
        created_at=user.created_at,
        preferences=PreferencesOut.model_validate(user.preferences),
    )


@router.get("", response_model=UserOut)
async def get_me(cu: CurrentUser = Depends(current_user), db: AsyncSession = Depends(get_db)) -> UserOut:
    return _user_out(cu.user, await get_plan(db, cu.user.id))


@router.patch("", response_model=UserOut)
async def update_me(
    body: UserUpdateIn, cu: CurrentUser = Depends(current_user), db: AsyncSession = Depends(get_db)
) -> UserOut:
    for field, value in body.model_dump(exclude_unset=True, exclude_none=True).items():
        setattr(cu.user, field, value)
    await db.commit()
    await db.refresh(cu.user)
    return _user_out(cu.user, await get_plan(db, cu.user.id))


@router.patch("/preferences", response_model=PreferencesOut)
async def update_preferences(
    body: PreferencesIn, cu: CurrentUser = Depends(current_user), db: AsyncSession = Depends(get_db)
) -> PreferencesOut:
    prefs = cu.user.preferences
    for field, value in body.model_dump(exclude_unset=True, exclude_none=True).items():
        setattr(prefs, field, value)
    await db.commit()
    await db.refresh(prefs)
    return PreferencesOut.model_validate(prefs)


@router.post("/password", status_code=status.HTTP_204_NO_CONTENT)
async def change_password(
    body: ChangePasswordIn,
    cu: CurrentUser = Depends(current_user),
    db: AsyncSession = Depends(get_db),
    meta: RequestMeta = Depends(request_meta),
) -> Response:
    await ratelimit.hit(f"password:{cu.user.id}", limit=5, window_seconds=900)
    await auth_service.change_password(
        db, cu.user, cu.session, body.current_password, body.new_password, meta
    )
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/sessions", response_model=list[SessionOut])
async def list_sessions(
    cu: CurrentUser = Depends(current_user), db: AsyncSession = Depends(get_db)
) -> list[SessionOut]:
    sessions = await auth_service.list_sessions(db, cu.user)
    return [
        SessionOut(
            id=s.id,
            client=s.client,
            user_agent=s.user_agent,
            ip=str(s.ip) if s.ip else None,
            trusted=s.trusted,
            device_name=s.device_name,
            created_at=s.created_at,
            last_used_at=s.last_used_at,
            current=s.id == cu.session.id,
        )
        for s in sessions
    ]


@router.delete("/sessions/{session_id}", status_code=status.HTTP_204_NO_CONTENT)
async def revoke_session(
    session_id: uuid.UUID,
    cu: CurrentUser = Depends(current_user),
    db: AsyncSession = Depends(get_db),
    meta: RequestMeta = Depends(request_meta),
) -> Response:
    await auth_service.revoke_session(db, cu.user, session_id, meta)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post("/sessions/revoke-others")
async def revoke_other_sessions(
    cu: CurrentUser = Depends(current_user),
    db: AsyncSession = Depends(get_db),
    meta: RequestMeta = Depends(request_meta),
) -> dict:
    count = await auth_service.revoke_other_sessions(db, cu.user, cu.session, meta)
    return {"revoked": count}


@router.get("/export")
async def export_data(
    cu: CurrentUser = Depends(current_user), db: AsyncSession = Depends(get_db)
) -> JSONResponse:
    await ratelimit.hit(f"export:{cu.user.id}", limit=5, window_seconds=3600)
    data = await auth_service.export_data(db, cu.user)
    return JSONResponse(
        data, headers={"Content-Disposition": 'attachment; filename="biblealpha-meus-dados.json"'}
    )


@router.delete("", status_code=status.HTTP_204_NO_CONTENT)
async def delete_account(
    body: DeleteAccountIn,
    cu: CurrentUser = Depends(current_user),
    db: AsyncSession = Depends(get_db),
    meta: RequestMeta = Depends(request_meta),
) -> Response:
    await ratelimit.hit(f"delete:{cu.user.id}", limit=5, window_seconds=900)
    await auth_service.delete_account(db, cu.user, body.password, meta)
    return Response(status_code=status.HTTP_204_NO_CONTENT)
