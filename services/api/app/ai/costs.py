"""Custo de cada chamada, calculado com a tabela de preços vigente na data da chamada."""

from datetime import date
from decimal import Decimal

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.ai.provider import Usage
from app.models import AIModelPrice

MTOK = Decimal(1_000_000)


async def price_for(db: AsyncSession, model: str, on: date) -> AIModelPrice | None:
    # Modelos servidos podem vir com sufixo de data; usa o prefixo conhecido mais longo
    rows = list(
        await db.scalars(
            select(AIModelPrice).where(AIModelPrice.valid_from <= on).order_by(AIModelPrice.valid_from.desc())
        )
    )
    candidates = [p for p in rows if model == p.model or model.startswith(p.model)]
    if not candidates:
        return None
    candidates.sort(key=lambda p: (len(p.model), p.valid_from), reverse=True)
    return candidates[0]


def cost_usd(price: AIModelPrice | None, usage: Usage) -> Decimal:
    if price is None:
        return Decimal(0)
    total = (
        Decimal(usage.input_tokens) * price.input_per_mtok
        + Decimal(usage.output_tokens) * price.output_per_mtok
        + Decimal(usage.cache_read_tokens) * price.cache_read_per_mtok
        + Decimal(usage.cache_write_tokens) * price.cache_write_per_mtok
    ) / MTOK
    return total.quantize(Decimal("0.000001"))
