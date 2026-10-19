"""Configurações do sistema editáveis pelo administrador (tabela system_settings)."""

import uuid

from sqlalchemy.ext.asyncio import AsyncSession

from app.models import SystemSetting

# Valores usados se a chave ainda não existir no banco
DEFAULTS: dict[str, dict] = {
    "ai.enabled": {"value": True},
    "ai.models": {
        "explain": {"model": "claude-opus-5-5", "effort": "medium", "max_tokens": 16000},
        "chat": {"model": "claude-opus-5-5", "effort": "medium", "max_tokens": 16000},
        "classify": {"model": "claude-haiku-5-5", "effort": "low", "max_tokens": 16},
        "devotional": {"model": "claude-opus-5-5", "effort": "medium", "max_tokens": 8000},
        "sermon": {"model": "claude-opus-5-5", "effort": "medium", "max_tokens": 16000},
        # Traduções (textos do app e devocional em outros idiomas): DeepSeek, bem mais barata.
        # Sem chave da DeepSeek no painel, usa o Claude Haiku.
        "translate": {"model": "deepseek-flash", "effort": "low", "max_tokens": 8000},
        "devotional_translate": {"model": "deepseek-flash", "effort": "low", "max_tokens": 8000},
        # Professor com IA (perguntas de compreensão): DeepSeek com um pouco de raciocínio
        "quiz": {"model": "deepseek-flash", "effort": "medium", "max_tokens": 8000},
        # Estudo visual do capítulo (texto com fontes): Claude
        "visual_study": {"model": "claude-sonnet-5-5", "effort": "medium", "max_tokens": 16000},
        # Visual dos slides do telão (cores e descrição do fundo): DeepSeek
        "slide_design": {"model": "deepseek-flash", "effort": "low", "max_tokens": 4000},
    },
    # Estudo visual: Free gera poucos por mês, Pro tem teto diário de segurança; ver um pronto não conta
    # Fundos dos slides do telão criados pela IA (imagem); trocar de fundo conta como um novo
    "slides.quotas": {"free_monthly": 2, "pro_monthly": 5},
    # Oferta avulsa: valores mínimo/máximo por moeda e perguntas extras à IA de presente (painel → Limites)
    "billing.donation": {"min_brl": 5, "max_brl": 10000, "min_usd": 3, "max_usd": 2000, "bonus_questions": 3},
    "visual.quotas": {"free_monthly": 3, "pro_monthly": 5},
    "visual.images": {"model": "gpt-image-2", "count": 2, "size": "1536x1024", "quality": "medium"},
    "ai.quotas": {"free_daily": 5, "free_monthly": 60, "pro_daily_cap": 200, "pro_per_minute": 8},
    "ai.budget": {"daily_usd": 20, "monthly_usd": 400, "hard_daily_usd": 60, "alert_email": None},
    "fx.usd_brl": {"rate": 5.40, "source": "manual"},
    "ai.alerts": {},
}


async def get_setting(db: AsyncSession, key: str) -> dict:
    row = await db.get(SystemSetting, key)
    if row is None:
        return dict(DEFAULTS.get(key, {}))
    # Chaves novas (ex.: um modelo para uma funcionalidade nova) aparecem com o valor padrão
    return {**DEFAULTS.get(key, {}), **row.value} if isinstance(row.value, dict) else row.value


async def set_setting(db: AsyncSession, key: str, value: dict, by: uuid.UUID | None = None) -> None:
    row = await db.get(SystemSetting, key)
    if row is None:
        db.add(SystemSetting(key=key, value=value, updated_by=by))
    else:
        row.value = value
        row.updated_by = by
