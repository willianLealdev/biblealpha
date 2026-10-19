"""telão da igreja (QR code), fundos dos slides criados pela IA e agenda do pregador

Revision ID: 0011
Revises: 0010
Create Date: 2026-10-19 20:00:00
"""
from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = '0011'
down_revision: str | None = '0010'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def _timestamps() -> list[sa.Column]:
    return [
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    ]


def upgrade() -> None:
    op.create_table(
        'screen_sessions',
        sa.Column('id', sa.Uuid(), nullable=False),
        sa.Column('code', sa.String(length=8), nullable=False),
        sa.Column('token_hash', sa.String(length=64), nullable=False),
        sa.Column('user_id', sa.Uuid(), nullable=True),
        sa.Column('sermon_id', sa.Uuid(), nullable=True),
        sa.Column('slide', postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column('version', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('paired_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('ended_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('expires_at', sa.DateTime(timezone=True), nullable=False),
        *_timestamps(),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], name=op.f('fk_screen_sessions_user_id_users'), ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['sermon_id'], ['sermons.id'], name=op.f('fk_screen_sessions_sermon_id_sermons'), ondelete='SET NULL'),
        sa.PrimaryKeyConstraint('id', name=op.f('pk_screen_sessions')),
        sa.UniqueConstraint('code', name=op.f('uq_screen_sessions_code')),
    )
    op.create_index(op.f('ix_screen_sessions_user_id'), 'screen_sessions', ['user_id'])

    op.create_table(
        'slide_backgrounds',
        sa.Column('id', sa.Uuid(), nullable=False),
        sa.Column('user_id', sa.Uuid(), nullable=False),
        sa.Column('sermon_id', sa.Uuid(), nullable=False),
        sa.Column('style', postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column('prompt', sa.Text(), nullable=False, server_default=''),
        sa.Column('mime', sa.String(length=40), nullable=True),
        sa.Column('data', sa.LargeBinary(), nullable=True),
        sa.Column('model', sa.String(length=60), nullable=True),
        *_timestamps(),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], name=op.f('fk_slide_backgrounds_user_id_users'), ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['sermon_id'], ['sermons.id'], name=op.f('fk_slide_backgrounds_sermon_id_sermons'), ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id', name=op.f('pk_slide_backgrounds')),
    )
    op.create_index('ix_slide_backgrounds_sermon', 'slide_backgrounds', ['sermon_id', 'created_at'])

    op.create_table(
        'preaching_events',
        sa.Column('id', sa.Uuid(), nullable=False),
        sa.Column('user_id', sa.Uuid(), nullable=False),
        sa.Column('local_date', sa.Date(), nullable=False),
        sa.Column('local_time', sa.Time(), nullable=False),
        sa.Column('timezone', sa.String(length=64), nullable=True),
        sa.Column('utc_offset_minutes', sa.SmallInteger(), nullable=False, server_default='0'),
        sa.Column('starts_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('church_name', sa.String(length=160), nullable=False),
        sa.Column('country', sa.String(length=2), nullable=True),
        sa.Column('postal_code', sa.String(length=20), nullable=True),
        sa.Column('street', sa.String(length=200), nullable=True),
        sa.Column('number', sa.String(length=20), nullable=True),
        sa.Column('complement', sa.String(length=120), nullable=True),
        sa.Column('district', sa.String(length=120), nullable=True),
        sa.Column('city', sa.String(length=120), nullable=True),
        sa.Column('region', sa.String(length=120), nullable=True),
        sa.Column('sermon_id', sa.Uuid(), nullable=True),
        sa.Column('notes', sa.Text(), nullable=False, server_default=''),
        sa.Column('reminder_sent_at', sa.DateTime(timezone=True), nullable=True),
        *_timestamps(),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], name=op.f('fk_preaching_events_user_id_users'), ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['sermon_id'], ['sermons.id'], name=op.f('fk_preaching_events_sermon_id_sermons'), ondelete='SET NULL'),
        sa.PrimaryKeyConstraint('id', name=op.f('pk_preaching_events')),
    )
    op.create_index(op.f('ix_preaching_events_user_id'), 'preaching_events', ['user_id'])
    op.create_index('ix_preaching_events_reminder', 'preaching_events', ['reminder_sent_at', 'starts_at'])


def downgrade() -> None:
    op.drop_table('preaching_events')
    op.drop_table('slide_backgrounds')
    op.drop_table('screen_sessions')
