"""Painel do administrador: chaves das integrações (Anthropic, OpenAI, Resend, Stripe).

As chaves são gravadas criptografadas e nunca voltam inteiras: o painel vê só o final.
Cada grupo tem um teste que faz uma chamada só de leitura ao serviço.
"""

import httpx
from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import CurrentUser, request_meta, require_role
from app.billing import stripe_service
from app.core.config import get_settings
from app.core.errors import AppError
from app.db.session import get_db
from app.services import audit, secrets
from app.services.audit import RequestMeta

router = APIRouter(prefix="/admin/integrations", tags=["admin"])
admin_only = require_role("admin")


@router.get("")
async def status(_: CurrentUser = Depends(admin_only), db: AsyncSession = Depends(get_db)) -> dict:
    await secrets.refresh(db)
    base = get_settings().app_url.rstrip("/")
    return {
        "items": secrets.status(),
        "stripe": {
            # Endereço a cadastrar em Stripe → Developers → Webhooks
            "webhook_url": f"{base}/api/v1/billing/stripe/webhook",
            "webhook_events": stripe_service.WEBHOOK_EVENTS,
        },
    }


class SecretIn(BaseModel):
    # null apaga a chave do painel (volta a valer a variável de ambiente, se houver)
    value: str | None = Field(default=None, max_length=500)


@router.put("/{name}")
async def put_secret(
    name: str,
    body: SecretIn,
    cu: CurrentUser = Depends(admin_only),
    db: AsyncSession = Depends(get_db),
    meta: RequestMeta = Depends(request_meta),
) -> dict:
    spec = secrets.SPECS.get(name)
    if spec is None:
        raise AppError(404, "unknown_integration", "Unknown integration key")
    value = body.value.strip() if body.value else None
    if value and not value.startswith(spec.prefixes):
        raise AppError(
            422, "invalid_key_format", f"Expected a value starting with {' or '.join(spec.prefixes)}"
        )
    # Registra quem mudou, nunca o valor
    audit.record(db, "admin.integration_key", meta, user_id=cu.user.id, name=name, cleared=value is None)
    await secrets.put(db, name, value, cu.user.id)
    return {"items": secrets.status()}


async def _test_anthropic(key: str) -> dict:
    import anthropic

    page = await anthropic.AsyncAnthropic(api_key=key, max_retries=0, timeout=20).models.list(limit=3)
    return {"models": [m.id for m in page.data]}


async def _test_deepseek(key: str) -> dict:
    async with httpx.AsyncClient(timeout=20) as client:
        r = await client.get("https://api.deepseek.com/models", headers={"Authorization": f"Bearer {key}"})
    if r.status_code != 200:
        raise AppError(422, "integration_test_failed", f"DeepSeek answered {r.status_code}")
    return {"models": [m.get("id") for m in r.json().get("data", [])]}


async def _test_openai(key: str) -> dict:
    async with httpx.AsyncClient(timeout=20) as client:
        r = await client.get("https://api.openai.com/v1/models", headers={"Authorization": f"Bearer {key}"})
    if r.status_code != 200:
        raise AppError(422, "integration_test_failed", f"OpenAI answered {r.status_code}")
    return {"models": len(r.json().get("data", []))}


async def _test_resend(key: str) -> dict:
    async with httpx.AsyncClient(timeout=20) as client:
        r = await client.get("https://api.resend.com/domains", headers={"Authorization": f"Bearer {key}"})
    if r.status_code != 200:
        raise AppError(422, "integration_test_failed", f"Resend answered {r.status_code}")
    return {"domains": [{"name": d.get("name"), "status": d.get("status")} for d in r.json().get("data", [])]}


@router.post("/{group}/test")
async def test(group: str, _: CurrentUser = Depends(admin_only)) -> dict:
    name = {
        "anthropic": "anthropic_api_key",
        "deepseek": "deepseek_api_key",
        "openai": "openai_api_key",
        "resend": "resend_api_key",
        "stripe": "stripe_secret_key",
    }.get(group)
    if name is None:
        raise AppError(404, "unknown_integration", "Unknown integration")
    key = secrets.get(name)
    if not key:
        raise AppError(422, "integration_not_configured", "Key not configured")
    try:
        if group == "anthropic":
            detail = await _test_anthropic(key)
        elif group == "deepseek":
            detail = await _test_deepseek(key)
        elif group == "openai":
            detail = await _test_openai(key)
        elif group == "resend":
            detail = await _test_resend(key)
        else:
            detail = await stripe_service.test_connection(key)
    except AppError:
        raise
    except Exception as e:  # chave recusada, rede, etc.
        raise AppError(422, "integration_test_failed", f"{type(e).__name__}: {str(e)[:200]}") from None
    return {"ok": True, "detail": detail}
