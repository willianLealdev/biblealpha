"""Chaves das integrações (Anthropic, DeepSeek, OpenAI, Resend, Stripe) definidas pelo painel do admin.

Ficam criptografadas no banco (Fernet). A chave de criptografia vem de BA_SECRETS_KEY ou, se
ela não existir, é derivada de BA_JWT_SECRET. Se uma chave não estiver no painel, vale a
variável de ambiente correspondente. O valor nunca volta para o app: o painel só vê os
últimos 4 caracteres.

Cada processo da API guarda as chaves em memória e recarrega do banco a cada 30 segundos
(e na hora, no processo que recebeu a alteração).
"""

import asyncio
import base64
import hashlib
import logging
import os
from dataclasses import dataclass
from datetime import UTC, datetime

from cryptography.fernet import Fernet, InvalidToken
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.models import SystemSetting

log = logging.getLogger(__name__)

_PREFIX = "secret."
REFRESH_SECONDS = 30


@dataclass(frozen=True)
class SecretSpec:
    name: str
    group: str  # anthropic | deepseek | openai | resend | stripe
    env: tuple[str, ...]  # variáveis de ambiente aceitas como alternativa
    prefixes: tuple[str, ...]  # formato esperado (confere erros de digitação)
    secret: bool = True  # False: valor de configuração que pode ser exibido (ex.: remetente)


SPECS: dict[str, SecretSpec] = {
    s.name: s
    for s in (
        SecretSpec(
            "anthropic_api_key", "anthropic", ("ANTHROPIC_API_KEY", "BA_ANTHROPIC_API_KEY"), ("sk-ant-",)
        ),
        SecretSpec("deepseek_api_key", "deepseek", ("DEEPSEEK_API_KEY", "BA_DEEPSEEK_API_KEY"), ("sk-",)),
        SecretSpec("openai_api_key", "openai", ("OPENAI_API_KEY", "BA_OPENAI_API_KEY"), ("sk-",)),
        SecretSpec("resend_api_key", "resend", ("BA_RESEND_API_KEY", "RESEND_API_KEY"), ("re_",)),
        SecretSpec("email_from", "resend", ("BA_EMAIL_FROM",), ("",), secret=False),
        SecretSpec(
            "stripe_secret_key", "stripe", ("BA_STRIPE_SECRET_KEY", "STRIPE_SECRET_KEY"), ("sk_", "rk_")
        ),
        SecretSpec(
            "stripe_publishable_key", "stripe", ("BA_STRIPE_PUBLISHABLE_KEY",), ("pk_",), secret=False
        ),
        SecretSpec("stripe_webhook_secret", "stripe", ("BA_STRIPE_WEBHOOK_SECRET",), ("whsec_",)),
    )
}

_cache: dict[str, str] = {}
_meta: dict[str, dict] = {}
_loaded = False


def _fernet() -> Fernet:
    master = os.environ.get("BA_SECRETS_KEY") or get_settings().jwt_secret
    digest = hashlib.sha256(b"biblealpha-secrets:" + master.encode()).digest()
    return Fernet(base64.urlsafe_b64encode(digest))


def _env_value(spec: SecretSpec) -> str | None:
    for var in spec.env:
        if value := os.environ.get(var):
            return value
    if spec.name == "resend_api_key":
        return get_settings().resend_api_key
    if spec.name == "email_from":
        return get_settings().email_from
    return None


def get(name: str) -> str | None:
    """Valor atual: o do painel; senão a variável de ambiente."""
    return _cache.get(name) or _env_value(SPECS[name])


def source(name: str) -> str | None:
    if name in _cache:
        return "panel"
    return "env" if _env_value(SPECS[name]) else None


def mask(value: str) -> str:
    return f"…{value[-4:]}" if len(value) > 8 else "…"


async def refresh(db: AsyncSession) -> None:
    global _loaded
    rows = (await db.scalars(select(SystemSetting).where(SystemSetting.key.startswith(_PREFIX)))).all()
    fernet = _fernet()
    cache: dict[str, str] = {}
    meta: dict[str, dict] = {}
    for row in rows:
        name = row.key.removeprefix(_PREFIX)
        if name not in SPECS:
            continue
        try:
            cache[name] = fernet.decrypt(row.value["ct"].encode()).decode()
        except (InvalidToken, KeyError):
            # BA_SECRETS_KEY/BA_JWT_SECRET mudou: a chave precisa ser cadastrada de novo
            log.error("Não foi possível ler a chave %s do painel; cadastre-a novamente", name)
            continue
        meta[name] = {"updated_at": row.value.get("updated_at")}
    _cache.clear()
    _cache.update(cache)
    _meta.clear()
    _meta.update(meta)
    _loaded = True


async def put(db: AsyncSession, name: str, value: str | None, by=None) -> None:
    from app.services.settings import set_setting

    key = f"{_PREFIX}{name}"
    if value is None:
        row = await db.get(SystemSetting, key)
        if row is not None:
            await db.delete(row)
    else:
        token = _fernet().encrypt(value.encode()).decode()
        await set_setting(db, key, {"ct": token, "updated_at": datetime.now(UTC).isoformat()}, by)
    await db.commit()
    await refresh(db)


def status() -> list[dict]:
    out = []
    for spec in SPECS.values():
        value = get(spec.name)
        out.append(
            {
                "name": spec.name,
                "group": spec.group,
                "secret": spec.secret,
                "configured": bool(value),
                "source": source(spec.name),
                # Segredos: só o final; valores de configuração aparecem inteiros
                "preview": (mask(value) if spec.secret else value) if value else None,
                "updated_at": _meta.get(spec.name, {}).get("updated_at"),
            }
        )
    return out


async def refresh_loop() -> None:
    from app.db.session import get_sessionmaker

    while True:
        try:
            async with get_sessionmaker()() as db:
                await refresh(db)
        except Exception:  # banco indisponível por um instante: tenta de novo
            log.exception("Falha ao recarregar as chaves das integrações")
        await asyncio.sleep(REFRESH_SECONDS)


def reset_for_tests() -> None:
    global _loaded
    _cache.clear()
    _meta.clear()
    _loaded = False
