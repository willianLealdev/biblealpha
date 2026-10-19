from urllib.parse import quote

from fastapi import APIRouter, BackgroundTasks, Depends, Request, Response, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import CurrentUser, current_user, request_meta
from app.core import ratelimit, security
from app.core.config import get_settings
from app.core.errors import AppError
from app.db.session import get_db
from app.models import AuthSession, User
from app.schemas.auth import (
    EmailIn,
    LoginIn,
    RefreshIn,
    RegisterIn,
    ResetPasswordIn,
    TokenIn,
    TokenOut,
)
from app.services import auth as auth_service
from app.services import email as email_service
from app.services.audit import RequestMeta

router = APIRouter(prefix="/auth", tags=["auth"])

# O app web envia este cabeçalho; formulários de outros sites não conseguem enviá-lo (proteção CSRF do cookie)
WEB_CLIENT_HEADER = "x-ba-client"


def _link(path: str, token: str) -> str:
    return f"{get_settings().app_url.rstrip('/')}{path}?token={quote(token)}"


def _tokens(response: Response, user: User, session: AuthSession, refresh: str) -> TokenOut:
    settings = get_settings()
    access, expires_in = security.create_access_token(user.id, session.id, user.role_names)
    if session.client == "web":
        response.set_cookie(
            settings.refresh_cookie_name,
            refresh,
            max_age=settings.refresh_token_ttl_days * 86400,
            path=settings.refresh_cookie_path,
            httponly=True,
            secure=settings.cookie_secure,
            samesite="strict",
        )
        return TokenOut(access_token=access, expires_in=expires_in)
    return TokenOut(access_token=access, expires_in=expires_in, refresh_token=refresh)


def _clear_cookie(response: Response) -> None:
    settings = get_settings()
    response.delete_cookie(settings.refresh_cookie_name, path=settings.refresh_cookie_path)


@router.post("/register", status_code=status.HTTP_201_CREATED)
async def register(
    body: RegisterIn,
    background: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
    meta: RequestMeta = Depends(request_meta),
) -> dict:
    await ratelimit.hit(f"register:{meta.ip}", limit=5, window_seconds=600)
    await ratelimit.hit(f"register-email:{body.email}", limit=3, window_seconds=3600)
    try:
        user, token = await auth_service.register(
            db,
            name=body.name,
            email=body.email,
            password=body.password,
            locale=body.locale,
            country=body.country,
            accept_terms=body.accept_terms,
            meta=meta,
        )
    except auth_service.EmailTaken as e:
        # Não revela que o e-mail já tem conta; o dono recebe um aviso com o caminho para entrar
        background.add_task(
            email_service.send_action_email,
            "account_exists",
            e.user.email,
            e.user.locale,
            f"{get_settings().app_url.rstrip('/')}/forgot-password",
        )
        return {"status": "verification_sent"}
    background.add_task(
        email_service.send_action_email,
        "verify_email",
        user.email,
        user.locale,
        _link("/verify-email", token),
    )
    return {"status": "verification_sent"}


@router.post("/verify-email")
async def verify_email(
    body: TokenIn, db: AsyncSession = Depends(get_db), meta: RequestMeta = Depends(request_meta)
) -> dict:
    await ratelimit.hit(f"verify:{meta.ip}", limit=20, window_seconds=600)
    await auth_service.verify_email(db, body.token, meta)
    return {"status": "verified"}


@router.post("/resend-verification", status_code=status.HTTP_202_ACCEPTED)
async def resend_verification(
    body: EmailIn,
    background: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
    meta: RequestMeta = Depends(request_meta),
) -> dict:
    await ratelimit.hit(f"resend:{body.email}", limit=3, window_seconds=3600)
    await ratelimit.hit(f"resend-ip:{meta.ip}", limit=10, window_seconds=3600)
    result = await auth_service.new_verification_token(db, body.email)
    if result:
        user, token = result
        background.add_task(
            email_service.send_action_email,
            "verify_email",
            user.email,
            user.locale,
            _link("/verify-email", token),
        )
    return {"status": "accepted"}


@router.post("/login", response_model=TokenOut, response_model_exclude_none=True)
async def login(
    body: LoginIn,
    response: Response,
    db: AsyncSession = Depends(get_db),
    meta: RequestMeta = Depends(request_meta),
) -> TokenOut:
    await ratelimit.hit(f"login:{body.email}", limit=10, window_seconds=900)
    await ratelimit.hit(f"login-ip:{meta.ip}", limit=30, window_seconds=900)
    user, session, refresh = await auth_service.login(
        db, email=body.email, password=body.password, client=body.client, meta=meta
    )
    return _tokens(response, user, session, refresh)


@router.post("/refresh", response_model=TokenOut, response_model_exclude_none=True)
async def refresh(
    request: Request,
    response: Response,
    body: RefreshIn | None = None,
    db: AsyncSession = Depends(get_db),
    meta: RequestMeta = Depends(request_meta),
) -> TokenOut:
    settings = get_settings()
    raw = body.refresh_token if body and body.refresh_token else None
    if raw is None:
        if request.headers.get(WEB_CLIENT_HEADER) != "web":
            raise AppError(401, "invalid_refresh_token", "Session expired, sign in again")
        raw = request.cookies.get(settings.refresh_cookie_name)
    if not raw:
        raise AppError(401, "invalid_refresh_token", "Session expired, sign in again")
    try:
        user, session, new_raw = await auth_service.refresh(db, raw, meta)
    except AppError:
        _clear_cookie(response)
        raise
    return _tokens(response, user, session, new_raw)


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
async def logout(
    response: Response,
    cu: CurrentUser = Depends(current_user),
    db: AsyncSession = Depends(get_db),
    meta: RequestMeta = Depends(request_meta),
) -> Response:
    await auth_service.logout(db, cu.session, meta)
    response.status_code = status.HTTP_204_NO_CONTENT
    _clear_cookie(response)
    return response


@router.post("/forgot-password", status_code=status.HTTP_202_ACCEPTED)
async def forgot_password(
    body: EmailIn,
    background: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
    meta: RequestMeta = Depends(request_meta),
) -> dict:
    await ratelimit.hit(f"forgot:{body.email}", limit=3, window_seconds=3600)
    await ratelimit.hit(f"forgot-ip:{meta.ip}", limit=10, window_seconds=3600)
    result = await auth_service.new_password_reset_token(db, body.email, meta)
    if result:
        user, token = result
        background.add_task(
            email_service.send_action_email,
            "reset_password",
            user.email,
            user.locale,
            _link("/reset-password", token),
        )
    # Mesma resposta exista ou não a conta
    return {"status": "accepted"}


@router.post("/reset-password")
async def reset_password(
    body: ResetPasswordIn, db: AsyncSession = Depends(get_db), meta: RequestMeta = Depends(request_meta)
) -> dict:
    await ratelimit.hit(f"reset:{meta.ip}", limit=10, window_seconds=900)
    await auth_service.reset_password(db, body.token, body.password, meta)
    return {"status": "password_reset"}
