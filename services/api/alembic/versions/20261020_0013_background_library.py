"""biblioteca de fundos do telão: o fundo é da pessoa e pode ser usado em qualquer ministração

Revision ID: 0013
Revises: 0012
Create Date: 2026-10-20 12:00:00
"""
from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = '0013'
down_revision: str | None = '0012'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column('slide_backgrounds', sa.Column('label', sa.String(length=200), nullable=True))
    # Apagar a ministração não apaga mais o fundo (ele continua na biblioteca da pessoa)
    op.drop_constraint('fk_slide_backgrounds_sermon_id_sermons', 'slide_backgrounds', type_='foreignkey')
    op.alter_column('slide_backgrounds', 'sermon_id', existing_type=sa.Uuid(), nullable=True)
    op.create_foreign_key(
        'fk_slide_backgrounds_sermon_id_sermons', 'slide_backgrounds', 'sermons', ['sermon_id'], ['id'],
        ondelete='SET NULL',
    )
    op.create_index('ix_slide_backgrounds_user', 'slide_backgrounds', ['user_id', 'created_at'])
    # Fundo escolhido em cada ministração
    op.add_column('sermons', sa.Column('slide_background_id', sa.Uuid(), nullable=True))
    op.create_foreign_key(
        'fk_sermons_slide_background', 'sermons', 'slide_backgrounds', ['slide_background_id'], ['id'],
        ondelete='SET NULL',
    )
    # Fundos que já existiam: nome = título da ministração; cada ministração fica com o fundo mais recente
    op.execute(
        "UPDATE slide_backgrounds b SET label = s.title FROM sermons s WHERE s.id = b.sermon_id"
    )
    op.execute(
        """
        UPDATE sermons s SET slide_background_id = b.id
        FROM (
            SELECT DISTINCT ON (sermon_id) id, sermon_id FROM slide_backgrounds
            WHERE sermon_id IS NOT NULL ORDER BY sermon_id, created_at DESC
        ) b
        WHERE s.id = b.sermon_id
        """
    )


def downgrade() -> None:
    op.drop_constraint('fk_sermons_slide_background', 'sermons', type_='foreignkey')
    op.drop_column('sermons', 'slide_background_id')
    op.drop_index('ix_slide_backgrounds_user', table_name='slide_backgrounds')
    op.drop_constraint('fk_slide_backgrounds_sermon_id_sermons', 'slide_backgrounds', type_='foreignkey')
    op.execute("DELETE FROM slide_backgrounds WHERE sermon_id IS NULL")
    op.alter_column('slide_backgrounds', 'sermon_id', existing_type=sa.Uuid(), nullable=False)
    op.create_foreign_key(
        'fk_slide_backgrounds_sermon_id_sermons', 'slide_backgrounds', 'sermons', ['sermon_id'], ['id'],
        ondelete='CASCADE',
    )
    op.drop_column('slide_backgrounds', 'label')
