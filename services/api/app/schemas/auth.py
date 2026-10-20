import uuid
from datetime import datetime
from typing import Annotated, Literal

from pydantic import BaseModel, EmailStr, Field, StringConstraints, field_validator

from app.core.locales import LOCALE_PATTERN
from app.models import ReadingMode, Theme

Password = Annotated[str, StringConstraints(min_length=8, max_length=128)]
Locale = Annotated[str, StringConstraints(pattern=LOCALE_PATTERN, max_length=10)]
Client = Literal["web", "native"]
# País (ISO 3166-1 alfa-2), escolhido no cadastro
Country = Annotated[str, StringConstraints(pattern=r"^[A-Z]{2}$")]


def _normalize_email(value: str) -> str:
    return value.strip().lower()


def _check_strength(value: str) -> str:
    if value.isdigit() or value.isalpha():
        raise ValueError("password must mix letters with numbers or symbols")
    return value


class RegisterIn(BaseModel):
    name: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=120)]
    email: EmailStr
    password: Password
    locale: Locale = "pt-BR"
    country: Country | None = None
    accept_terms: bool = Field(description="Aceite dos Termos de Uso e da Política de Privacidade vigentes")

    _email = field_validator("email")(_normalize_email)
    _strong = field_validator("password")(_check_strength)


class LoginIn(BaseModel):
    email: EmailStr
    password: Annotated[str, StringConstraints(min_length=1, max_length=128)]
    client: Client = "native"
    # "Confiar neste dispositivo" (só vale nos apps; no site a sessão acaba ao fechar o navegador)
    trust_device: bool = False
    device_name: Annotated[str, StringConstraints(strip_whitespace=True, max_length=80)] | None = None

    _email = field_validator("email")(_normalize_email)


class RefreshIn(BaseModel):
    # No web o token vem do cookie httpOnly; no app nativo, do corpo
    refresh_token: str | None = None


class EmailIn(BaseModel):
    email: EmailStr

    _email = field_validator("email")(_normalize_email)


class TokenIn(BaseModel):
    token: Annotated[str, StringConstraints(min_length=10, max_length=200)]


class ResetPasswordIn(TokenIn):
    password: Password

    _strong = field_validator("password")(_check_strength)


class ChangePasswordIn(BaseModel):
    current_password: Annotated[str, StringConstraints(min_length=1, max_length=128)]
    new_password: Password

    _strong = field_validator("new_password")(_check_strength)


class DeleteAccountIn(BaseModel):
    password: Annotated[str, StringConstraints(min_length=1, max_length=128)]


class TokenOut(BaseModel):
    access_token: str
    token_type: Literal["bearer"] = "bearer"  # noqa: S105
    expires_in: int
    # Ausente no web (vai no cookie httpOnly)
    refresh_token: str | None = None


class PreferencesOut(BaseModel):
    theme: Theme
    font_scale: float
    line_height: float
    reading_mode: ReadingMode
    onboarding_completed: bool

    model_config = {"from_attributes": True}


class PreferencesIn(BaseModel):
    theme: Theme | None = None
    font_scale: Annotated[float, Field(ge=0.8, le=2.0)] | None = None
    line_height: Annotated[float, Field(ge=1.2, le=2.4)] | None = None
    reading_mode: ReadingMode | None = None
    onboarding_completed: bool | None = None


class UserOut(BaseModel):
    id: uuid.UUID
    email: str
    name: str | None
    locale: str
    country: str | None = None
    email_verified: bool
    roles: list[str]
    plan: str = "free"
    created_at: datetime
    preferences: PreferencesOut


class UserUpdateIn(BaseModel):
    name: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=120)] | None = None
    locale: Locale | None = None
    country: Country | None = None


class SessionOut(BaseModel):
    id: uuid.UUID
    client: str
    user_agent: str | None
    ip: str | None
    trusted: bool = False
    device_name: str | None = None
    created_at: datetime
    last_used_at: datetime
    current: bool
