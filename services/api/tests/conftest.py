"""Testes contra um PostgreSQL real.

- Com BA_TEST_DATABASE_URL definido (CI), usa esse banco.
- Sem ele, sobe um PostgreSQL embutido com `pgserver` (desenvolvimento local, sem Docker).
"""

import asyncio
import os
import re
import tempfile
from pathlib import Path

import asyncpg
import pytest

API_DIR = Path(__file__).resolve().parents[1]


def _database_url() -> str:
    url = os.environ.get("BA_TEST_DATABASE_URL")
    if url:
        return url
    import pgserver

    data_dir = Path(tempfile.gettempdir()) / "biblealpha-pgtest"
    server = pgserver.get_server(data_dir, cleanup_mode=None)

    # server.psql() quebra em caminhos com espaço; cria o banco pelo asyncpg
    async def _recreate() -> None:
        conn = await asyncpg.connect(server.get_uri())
        await conn.execute("DROP DATABASE IF EXISTS biblealpha_test WITH (FORCE)")
        await conn.execute("CREATE DATABASE biblealpha_test")
        await conn.close()

    asyncio.run(_recreate())
    uri = server.get_uri("biblealpha_test")
    return re.sub(r"^postgresql://", "postgresql+asyncpg://", uri)


os.environ.update(
    {
        "BA_ENV": "test",
        "BA_EMAIL_BACKEND": "memory",
        "BA_REDIS_URL": "",
        "BA_APP_URL": "https://app.test",
        "BA_JWT_SECRET": "test-secret-with-enough-length-0123456789",
        "BA_DATABASE_URL": _database_url(),
    }
)

from alembic.config import Config  # noqa: E402
from httpx import ASGITransport, AsyncClient  # noqa: E402
from sqlalchemy import text  # noqa: E402

from alembic import command  # noqa: E402
from app.core import ratelimit  # noqa: E402
from app.db.session import dispose_engine, get_engine  # noqa: E402
from app.main import create_app  # noqa: E402
from app.services import email as email_service  # noqa: E402


@pytest.fixture(scope="session", autouse=True)
def _migrate():
    cfg = Config(str(API_DIR / "alembic.ini"))
    cfg.set_main_option("script_location", str(API_DIR / "alembic"))
    command.downgrade(cfg, "base")
    command.upgrade(cfg, "head")


@pytest.fixture(scope="session", autouse=True)
async def _bible(_migrate):
    """As traduções reais, importadas uma vez por execução."""
    from app.bible.importer import import_translation
    from app.db.session import get_sessionmaker

    async with get_sessionmaker()() as db:
        for code in ("blivre", "web", "rv1909"):
            await import_translation(db, code)


@pytest.fixture(autouse=True)
async def _clean():
    yield
    async with get_engine().begin() as conn:
        await conn.execute(
            text(
                "TRUNCATE users, user_preferences, user_roles, auth_sessions, email_tokens, "
                "legal_acceptances, audit_logs, highlight_categories, highlights, bookmarks, annotations, "
                "reading_progress, reading_history, ai_usage, ai_conversations, ai_messages, subscriptions, "
                "payment_events, daily_devotionals, user_devotionals, plan_enrollments, "
                "notification_preferences, sermons, sermon_versions, visual_studies, visual_images "
                "RESTART IDENTITY CASCADE"
            )
        )
        # Volta as configurações da IA ao padrão semeado pela migração
        await conn.execute(
            text(
                "DELETE FROM system_settings WHERE key IN ('ai.alerts', 'bible.defaults') "
                "OR key LIKE 'ui.%' OR key LIKE 'secret.%' OR key LIKE 'stripe.%'"
            )
        )
    from app.services.settings import DEFAULTS

    async with get_engine().begin() as conn:
        for key in ("ai.enabled", "ai.models", "ai.quotas", "ai.budget", "fx.usd_brl"):
            await conn.execute(
                text("UPDATE system_settings SET value = CAST(:v AS jsonb) WHERE key = :k"),
                {"v": __import__("json").dumps(DEFAULTS[key]), "k": key},
            )
    email_service.outbox.clear()
    ratelimit.reset_memory()
    from app.services import secrets

    secrets.reset_for_tests()


@pytest.fixture(scope="session", autouse=True)
async def _dispose():
    yield
    await dispose_engine()


@pytest.fixture
async def client():
    async with AsyncClient(
        transport=ASGITransport(app=create_app(), client=("203.0.113.10", 5000)), base_url="https://app.test"
    ) as c:
        yield c


PASSWORD = "Graça&Paz123"


def last_token(kind_path: str) -> str:
    """Token do último e-mail enviado com link para `kind_path` (ex.: /verify-email)."""
    for message in reversed(email_service.outbox):
        if message.action_url and kind_path in message.action_url:
            return message.action_url.split("token=", 1)[1]
    raise AssertionError(f"nenhum e-mail com {kind_path}")


async def register(client, email="ana@example.com", name="Ana", verify=True, password=PASSWORD):
    r = await client.post(
        "/api/v1/auth/register",
        json={"name": name, "email": email, "password": password, "accept_terms": True},
    )
    assert r.status_code == 201, r.text
    if verify:
        r = await client.post("/api/v1/auth/verify-email", json={"token": last_token("/verify-email")})
        assert r.status_code == 200, r.text


async def login(client, email="ana@example.com", password=PASSWORD, client_kind="native") -> dict:
    r = await client.post(
        "/api/v1/auth/login", json={"email": email, "password": password, "client": client_kind}
    )
    assert r.status_code == 200, r.text
    return r.json()


def bearer(tokens: dict) -> dict:
    return {"Authorization": f"Bearer {tokens['access_token']}"}


async def make_admin(email="ana@example.com"):
    from sqlalchemy import select

    from app.db.session import get_sessionmaker
    from app.models import Role, User, UserRole

    async with get_sessionmaker()() as db:
        user = await db.scalar(select(User).where(User.email == email))
        role = await db.scalar(select(Role).where(Role.name == "admin"))
        db.add(UserRole(user_id=user.id, role_id=role.id))
        await db.commit()
        return user.id
