from functools import lru_cache
from typing import Literal

from pydantic import Field, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

_DEV_SECRET = "dev-only-secret-change-me-0123456789abcdef"  # noqa: S105


# Endereço oficial do BibleAlpha (site, PWA e API em /api)
PRODUCTION_URL = "https://biblealpha.com"


class Settings(BaseSettings):
    """Configuração lida de variáveis de ambiente (prefixo BA_). Ver .env.example."""

    model_config = SettingsConfigDict(env_prefix="BA_", env_file=".env", extra="ignore")

    env: Literal["development", "test", "staging", "production"] = "development"
    app_name: str = "BibleAlpha"
    # URL pública do app (usada nos links dos e-mails)
    app_url: str = "http://localhost:8081"
    # Origens permitidas para CORS (só necessário quando app e API ficam em origens diferentes)
    cors_origins: list[str] = Field(default_factory=lambda: ["http://localhost:8081"])

    database_url: str = "postgresql+asyncpg://biblealpha:biblealpha@localhost:5432/biblealpha"
    redis_url: str | None = "redis://localhost:6379/0"

    # Valor padrão só serve para desenvolvimento; staging/produção recusam iniciar com ele
    jwt_secret: str = _DEV_SECRET
    jwt_issuer: str = "biblealpha"
    access_token_ttl_minutes: int = 15
    refresh_token_ttl_days: int = 60
    email_token_ttl_hours: int = 24
    password_reset_ttl_minutes: int = 60

    # E-mail: "console" (escreve no log), "memory" (testes) ou "resend"
    email_backend: Literal["console", "memory", "resend"] = "console"
    email_from: str = "BibleAlpha <no-reply@biblealpha.com>"
    resend_api_key: str | None = None

    # IA: "auto" (Claude quando houver chave no painel ou em ANTHROPIC_API_KEY; sem chave, respostas
    # de teste só em desenvolvimento), "anthropic" ou "fake" (testes, respostas fixas)
    ai_provider: Literal["auto", "anthropic", "fake"] = "auto"

    # Importa sozinho todo o catálogo de Bíblias do eBible.org (~1.300, mais de mil idiomas) e
    # confere atualizações toda semana. Padrão: ligado em staging/produção.
    bible_auto_import: bool | None = None

    # Prepara o devocional do dia (e dos próximos 2) em cada idioma antes de o usuário abrir
    devotional_prewarm: bool | None = None

    @property
    def agenda_reminders_enabled(self) -> bool:
        return self.env != "test"

    @property
    def devotional_prewarm_enabled(self) -> bool:
        return self.devotional_prewarm if self.devotional_prewarm is not None else self.env != "test"

    @property
    def bible_auto_import_enabled(self) -> bool:
        if self.bible_auto_import is not None:
            return self.bible_auto_import
        return self.env in ("staging", "production")

    # Versões vigentes dos documentos legais; o cadastro registra o aceite de cada uma
    terms_version: str = "2026-10-20"
    privacy_version: str = "2026-10-20"

    # Cookie do refresh token no web (PWA). A API é servida em /api no mesmo domínio do app.
    refresh_cookie_name: str = "ba_refresh"
    refresh_cookie_path: str = "/api/v1/auth"

    @model_validator(mode="after")
    def _production_safety(self) -> "Settings":
        if self.env in ("staging", "production"):
            # Domínio oficial quando o endereço não foi definido nas variáveis do servidor
            if "localhost" in self.app_url:
                self.app_url = PRODUCTION_URL
            if all("localhost" in o for o in self.cors_origins):
                self.cors_origins = [PRODUCTION_URL, "https://www.biblealpha.com"]
            if self.jwt_secret == _DEV_SECRET or len(self.jwt_secret) < 32:
                raise ValueError("BA_JWT_SECRET must be set to a random value of at least 32 characters")
            # As chaves (Resend, Anthropic, OpenAI, Stripe) podem vir do painel do admin
            if self.email_backend != "resend":
                raise ValueError("BA_EMAIL_BACKEND=resend is required in staging/production")
            if self.ai_provider == "fake":
                raise ValueError("BA_AI_PROVIDER=fake is not allowed in staging/production")
        return self

    @property
    def cookie_secure(self) -> bool:
        return self.env in ("staging", "production")


@lru_cache
def get_settings() -> Settings:
    return Settings()
