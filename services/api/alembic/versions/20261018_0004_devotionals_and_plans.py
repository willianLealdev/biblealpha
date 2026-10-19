"""devotionals and plans

Revision ID: 0004
Revises: 0003
Create Date: 2026-10-18 17:21:05.250422
"""
from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = '0004'
down_revision: str | None = '0003'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table('daily_devotionals',
    sa.Column('day', sa.Date(), nullable=False),
    sa.Column('locale', sa.String(length=10), nullable=False),
    sa.Column('theme', sa.String(length=30), nullable=False),
    sa.Column('translation_code', sa.String(length=20), nullable=False),
    sa.Column('verse_key_start', sa.Integer(), nullable=False),
    sa.Column('verse_key_end', sa.Integer(), nullable=False),
    sa.Column('content', postgresql.JSONB(astext_type=sa.Text()), nullable=False),
    sa.Column('model', sa.String(length=80), nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.Column('id', sa.Uuid(), nullable=False),
    sa.PrimaryKeyConstraint('id', name=op.f('pk_daily_devotionals')),
    sa.UniqueConstraint('day', 'locale', name=op.f('uq_daily_devotionals_day'))
    )
    op.create_table('notification_preferences',
    sa.Column('user_id', sa.Uuid(), nullable=False),
    sa.Column('devotional_time', sa.String(length=5), nullable=True),
    sa.Column('plan_reminders', sa.Boolean(), nullable=False),
    sa.Column('timezone', sa.String(length=60), nullable=False),
    sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.ForeignKeyConstraint(['user_id'], ['users.id'], name=op.f('fk_notification_preferences_user_id_users'), ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('user_id', name=op.f('pk_notification_preferences'))
    )
    op.create_table('plan_enrollments',
    sa.Column('user_id', sa.Uuid(), nullable=False),
    sa.Column('plan_code', sa.String(length=40), nullable=False),
    sa.Column('start_date', sa.Date(), nullable=False),
    sa.Column('status', sa.String(length=12), nullable=False),
    sa.Column('paused_on', sa.Date(), nullable=True),
    sa.Column('id', sa.Uuid(), nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.ForeignKeyConstraint(['user_id'], ['users.id'], name=op.f('fk_plan_enrollments_user_id_users'), ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id', name=op.f('pk_plan_enrollments'))
    )
    op.create_index(op.f('ix_plan_enrollments_user_id'), 'plan_enrollments', ['user_id'], unique=False)
    op.create_table('user_devotionals',
    sa.Column('user_id', sa.Uuid(), nullable=False),
    sa.Column('kind', sa.String(length=10), nullable=False),
    sa.Column('daily_id', sa.Uuid(), nullable=True),
    sa.Column('theme', sa.String(length=30), nullable=True),
    sa.Column('translation_code', sa.String(length=20), nullable=True),
    sa.Column('verse_key_start', sa.Integer(), nullable=True),
    sa.Column('verse_key_end', sa.Integer(), nullable=True),
    sa.Column('content', postgresql.JSONB(astext_type=sa.Text()), nullable=False),
    sa.Column('note', sa.Text(), nullable=False),
    sa.Column('favorite', sa.Boolean(), nullable=False),
    sa.Column('completed_on', sa.Date(), nullable=True),
    sa.Column('id', sa.Uuid(), nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.ForeignKeyConstraint(['daily_id'], ['daily_devotionals.id'], name=op.f('fk_user_devotionals_daily_id_daily_devotionals'), ondelete='SET NULL'),
    sa.ForeignKeyConstraint(['user_id'], ['users.id'], name=op.f('fk_user_devotionals_user_id_users'), ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id', name=op.f('pk_user_devotionals'))
    )
    op.create_index('ix_user_devotionals_completed', 'user_devotionals', ['user_id', 'completed_on'], unique=False)
    op.create_index(op.f('ix_user_devotionals_user_id'), 'user_devotionals', ['user_id'], unique=False)
    op.create_index('uq_user_devotionals_daily', 'user_devotionals', ['user_id', 'daily_id'], unique=True)
    op.create_table('plan_days_done',
    sa.Column('enrollment_id', sa.Uuid(), nullable=False),
    sa.Column('day', sa.SmallInteger(), nullable=False),
    sa.Column('done_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.ForeignKeyConstraint(['enrollment_id'], ['plan_enrollments.id'], name=op.f('fk_plan_days_done_enrollment_id_plan_enrollments'), ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('enrollment_id', 'day', name=op.f('pk_plan_days_done'))
    )


def downgrade() -> None:
    op.drop_table('plan_days_done')
    op.drop_index('uq_user_devotionals_daily', table_name='user_devotionals')
    op.drop_index(op.f('ix_user_devotionals_user_id'), table_name='user_devotionals')
    op.drop_index('ix_user_devotionals_completed', table_name='user_devotionals')
    op.drop_table('user_devotionals')
    op.drop_index(op.f('ix_plan_enrollments_user_id'), table_name='plan_enrollments')
    op.drop_table('plan_enrollments')
    op.drop_table('notification_preferences')
    op.drop_table('daily_devotionals')
