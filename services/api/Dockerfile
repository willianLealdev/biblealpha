FROM python:3.12-slim AS base

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1

WORKDIR /app

COPY pyproject.toml ./
# Instala só as dependências (o código entra na camada seguinte, para o cache do Docker funcionar)
RUN mkdir app && touch app/__init__.py && pip install . && pip uninstall -y biblealpha-api && rm -rf app

COPY alembic.ini ./
COPY alembic ./alembic
COPY app ./app
# Textos bíblicos com licença e hash conferidos (importação: python -m app.bible.importer blivre web rv1909)
COPY data ./data

RUN useradd --create-home --uid 1000 biblealpha
USER biblealpha

EXPOSE 8000

# Aplica as migrações, garante as traduções importadas (não reimporta se já estiverem) e sobe a API. --proxy-headers: IP real do usuário atrás do proxy do Easypanel.
CMD ["sh", "-c", "alembic upgrade head && python -m app.bible.importer blivre web rv1909 && uvicorn app.main:app --host 0.0.0.0 --port 8000 --proxy-headers --forwarded-allow-ips='*' --workers 2"]
