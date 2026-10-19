"""Limite de requisições por janela fixa. Usa Redis quando configurado; senão, memória do processo."""

import logging
import time
from collections import defaultdict

from redis.asyncio import Redis
from redis.exceptions import RedisError

from app.core.config import get_settings
from app.core.errors import AppError

_memory: dict[str, tuple[int, float]] = defaultdict(lambda: (0, 0.0))
_redis: Redis | None = None
log = logging.getLogger("biblealpha.ratelimit")


def _client() -> Redis | None:
    global _redis
    url = get_settings().redis_url
    if not url:
        return None
    if _redis is None:
        _redis = Redis.from_url(url)
    return _redis


async def hit(key: str, limit: int, window_seconds: int) -> None:
    """Conta uma tentativa; lança 429 quando `limit` é ultrapassado dentro da janela."""
    full_key = f"rl:{key}"
    redis = _client()
    count = None
    if redis is not None:
        try:
            count = await redis.incr(full_key)
            if count == 1:
                await redis.expire(full_key, window_seconds)
            ttl = await redis.ttl(full_key)
        except (RedisError, OSError) as e:
            log.warning("Redis indisponível para o limite de requisições (usando memória): %s", e)
            count = None
    if count is None:
        now = time.monotonic()
        count, reset_at = _memory[full_key]
        if now >= reset_at:
            count, reset_at = 0, now + window_seconds
        count += 1
        _memory[full_key] = (count, reset_at)
        ttl = int(reset_at - now)
    if count > limit:
        raise AppError(429, "rate_limited", "Too many attempts", headers={"Retry-After": str(max(ttl, 1))})


def reset_memory() -> None:
    _memory.clear()
