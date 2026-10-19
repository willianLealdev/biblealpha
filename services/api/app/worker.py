"""Worker Celery para tarefas assíncronas (importação de corpus, embeddings, e-mails, exportações).

celery -A app.worker worker --loglevel=info
"""

from celery import Celery

from app.core.config import get_settings

settings = get_settings()
celery_app = Celery("biblealpha", broker=settings.redis_url, backend=settings.redis_url)
celery_app.conf.update(task_acks_late=True, worker_prefetch_multiplier=1, timezone="UTC")


@celery_app.task(name="system.ping")
def ping() -> str:
    """Usada no healthcheck do worker."""
    return "pong"
