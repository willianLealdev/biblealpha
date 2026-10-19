import asyncio
import logging
from contextlib import asynccontextmanager

from fastapi import APIRouter, FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.agenda import reminders
from app.api.routes import (
    admin,
    admin_bible,
    admin_devotional,
    agenda,
    ai,
    auth,
    bible,
    billing,
    devotional,
    integrations,
    languages,
    me,
    screens,
    sermons,
    study,
    system,
    visual,
)
from app.bible import bulk
from app.core.config import get_settings
from app.core.errors import register_error_handlers
from app.core.http_security import SecurityMiddleware
from app.db.session import dispose_engine
from app.devotional import prewarm
from app.services import secrets

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")


@asynccontextmanager
async def lifespan(_: FastAPI):
    # Chaves das integrações cadastradas no painel (recarregadas periodicamente)
    tasks = [asyncio.create_task(secrets.refresh_loop())]
    if get_settings().devotional_prewarm_enabled:
        tasks.append(asyncio.create_task(prewarm.loop()))
    if get_settings().agenda_reminders_enabled:
        tasks.append(asyncio.create_task(reminders.loop()))
    if get_settings().bible_auto_import_enabled:
        tasks.append(asyncio.create_task(bulk.auto_loop()))
    yield
    for task in tasks:
        task.cancel()
    await dispose_engine()


def create_app() -> FastAPI:
    settings = get_settings()
    # Documentação da API só fora de produção (não expõe o mapa de rotas)
    docs = settings.env in ("development", "test")
    app = FastAPI(
        title="BibleAlpha API",
        version="0.1.0",
        lifespan=lifespan,
        docs_url="/api/docs" if docs else None,
        openapi_url="/api/openapi.json" if docs else None,
        redoc_url=None,
    )
    register_error_handlers(app)
    app.add_middleware(SecurityMiddleware, docs_enabled=docs)
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_credentials=True,
        allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE"],
        allow_headers=[
            "Authorization",
            "Content-Type",
            "Accept",
            "X-BA-Client",
            "X-Screen-Token",
            "If-None-Match",
        ],
    )

    v1 = APIRouter(prefix="/api/v1")
    v1.include_router(system.router)
    v1.include_router(auth.router)
    v1.include_router(me.router)
    v1.include_router(bible.router)
    v1.include_router(study.router)
    v1.include_router(ai.router)
    v1.include_router(admin.router)
    v1.include_router(admin_bible.router)
    v1.include_router(admin_devotional.router)
    v1.include_router(languages.router)
    v1.include_router(integrations.router)
    v1.include_router(billing.router)
    v1.include_router(devotional.router)
    v1.include_router(sermons.router)
    v1.include_router(visual.router)
    v1.include_router(screens.router)
    v1.include_router(agenda.router)
    app.include_router(v1)
    return app


app = create_app()
