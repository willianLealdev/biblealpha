"""Comandos administrativos.

python -m app.cli grant-role email@exemplo.com admin
python -m app.cli revoke-role email@exemplo.com admin
python -m app.cli verify-email email@exemplo.com    # primeiro admin, antes de a Resend estar configurada
"""

import asyncio
import sys
from datetime import UTC, datetime

from sqlalchemy import delete, select

from app.db.session import dispose_engine, get_sessionmaker
from app.models import Role, User, UserRole


async def _set_role(email: str, role_name: str, grant: bool) -> None:
    async with get_sessionmaker()() as db:
        user = await db.scalar(select(User).where(User.email == email.lower(), User.deleted_at.is_(None)))
        role = await db.scalar(select(Role).where(Role.name == role_name))
        if user is None or role is None:
            sys.exit(f"Usuário ou papel não encontrado: {email} / {role_name}")
        if grant:
            if not await db.get(UserRole, (user.id, role.id)):
                db.add(UserRole(user_id=user.id, role_id=role.id))
        else:
            await db.execute(delete(UserRole).where(UserRole.user_id == user.id, UserRole.role_id == role.id))
        await db.commit()
    await dispose_engine()
    print(f"{'Concedido' if grant else 'Removido'}: {role_name} -> {email}")


async def _verify_email(email: str) -> None:
    async with get_sessionmaker()() as db:
        user = await db.scalar(select(User).where(User.email == email.lower(), User.deleted_at.is_(None)))
        if user is None:
            sys.exit(f"Usuário não encontrado: {email}")
        user.email_verified_at = user.email_verified_at or datetime.now(UTC)
        await db.commit()
    await dispose_engine()
    print(f"E-mail confirmado: {email}")


def main() -> None:
    if len(sys.argv) == 3 and sys.argv[1] == "verify-email":
        asyncio.run(_verify_email(sys.argv[2]))
        return
    if len(sys.argv) != 4 or sys.argv[1] not in ("grant-role", "revoke-role"):
        sys.exit(__doc__)
    asyncio.run(_set_role(sys.argv[2], sys.argv[3], grant=sys.argv[1] == "grant-role"))


if __name__ == "__main__":
    main()
