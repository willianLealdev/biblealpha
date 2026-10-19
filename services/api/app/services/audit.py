import uuid
from dataclasses import dataclass

from sqlalchemy.ext.asyncio import AsyncSession

from app.models import AuditLog


@dataclass
class RequestMeta:
    ip: str | None
    user_agent: str | None


def record(
    db: AsyncSession, action: str, meta: RequestMeta, user_id: uuid.UUID | None = None, **data
) -> None:
    """Adiciona um evento de auditoria à transação atual (gravado no próximo commit)."""
    db.add(AuditLog(user_id=user_id, action=action, ip=meta.ip, user_agent=meta.user_agent, data=data))
