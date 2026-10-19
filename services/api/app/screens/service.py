"""Telão da igreja: sessões de tela pareadas pelo QR code e fundo dos slides criado pela IA.

A IA só cria o visual (cores, letra e imagem de fundo). O texto mostrado é sempre o que o pregador
escreveu ou o versículo, enviado por ele durante a pregação.
"""

import base64
import logging
import re
import secrets as pysecrets
from datetime import UTC, datetime, timedelta

import httpx
from sqlalchemy import delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.ai import service as ai_service
from app.ai.provider import Completion, ProviderError, Usage, get_provider
from app.core import security
from app.core.errors import AppError
from app.models import ScreenSession, Sermon, SlideBackground, User
from app.services import secrets
from app.services.plans import get_plan
from app.services.settings import get_setting

log = logging.getLogger("biblealpha.screens")

# Sem letras/números parecidos (O/0, I/1) para digitar o código sem erro
_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
CODE_LENGTH = 6
WAITING_TTL = timedelta(minutes=30)
PAIRED_TTL = timedelta(hours=12)

DEFAULT_STYLE = {
    "text_color": "#FFFFFF",
    "accent_color": "#E8B23A",
    "overlay": 0.45,
    "font": "serif",
    "gradient": ["#1B1408", "#0A0806"],
}

DESIGN_SYSTEM = (
    "You design the look of worship projection slides for a church. You receive the title, theme and main "
    "Bible passage of a sermon. Choose a calm, reverent visual identity that fits the theme: colors with strong "
    "contrast for large text read from far away, a font family (serif or sans), how dark the overlay over the "
    "background must be, a two-color gradient used when there is no image, and a prompt (in English) for a "
    "background image. The image must have NO text, NO letters, NO logos, NO faces in close-up and a calm "
    "uncluttered center where large text will be placed. Prefer nature, light, sky, landscapes of the biblical "
    "lands, soft abstract light or textures. Never write sermon content."
)
DESIGN_SCHEMA = {
    "type": "object",
    "properties": {
        "image_prompt": {"type": "string"},
        "text_color": {"type": "string"},
        "accent_color": {"type": "string"},
        "overlay": {"type": "number"},
        "font": {"type": "string", "enum": ["serif", "sans"]},
        "gradient": {"type": "array", "items": {"type": "string"}},
    },
    "required": ["image_prompt", "text_color", "accent_color", "overlay", "font", "gradient"],
    "additionalProperties": False,
}
IMAGE_STYLE = (
    "Wide background image for church worship projection slides. Cinematic, soft light, gentle depth of field, "
    "calm empty center area for large overlaid text, slightly dark. Absolutely no text, letters, words, logos "
    "or watermarks. No close-up faces. Scene: "
)
_HEX = re.compile(r"^#[0-9A-Fa-f]{6}$")


def _now() -> datetime:
    return datetime.now(UTC)


def new_code() -> str:
    return "".join(pysecrets.choice(_ALPHABET) for _ in range(CODE_LENGTH))


def normalize_code(raw: str) -> str:
    """Aceita o código digitado (com espaços/minúsculas) ou o link inteiro lido do QR code."""
    m = re.search(r"[?&]code=([A-Za-z0-9]+)", raw)
    code = (m.group(1) if m else raw).upper()
    return re.sub(r"[^A-Z0-9]", "", code)[:CODE_LENGTH]


async def create(db: AsyncSession) -> tuple[ScreenSession, str]:
    await db.execute(delete(ScreenSession).where(ScreenSession.expires_at < _now()))
    token = security.new_opaque_token()
    for _ in range(10):
        code = new_code()
        if not await db.scalar(select(ScreenSession.id).where(ScreenSession.code == code)):
            break
    s = ScreenSession(code=code, token_hash=security.hash_token(token), expires_at=_now() + WAITING_TTL)
    db.add(s)
    await db.commit()
    return s, token


async def for_display(db: AsyncSession, screen_id, token: str | None) -> ScreenSession:
    s = await db.get(ScreenSession, screen_id)
    if s is None or not token or not pysecrets.compare_digest(s.token_hash, security.hash_token(token)):
        raise AppError(404, "screen_not_found", "Screen not found")
    return s


async def owned(db: AsyncSession, screen_id, user: User) -> ScreenSession:
    s = await db.get(ScreenSession, screen_id)
    if s is None or s.user_id != user.id or s.ended_at is not None or s.expires_at < _now():
        raise AppError(404, "screen_not_found", "Screen not found")
    return s


async def find_open(db: AsyncSession, raw_code: str) -> ScreenSession | None:
    code = normalize_code(raw_code)
    s = await db.scalar(select(ScreenSession).where(ScreenSession.code == code))
    if s is None or s.ended_at is not None or s.expires_at < _now():
        return None
    return s


async def pair(db: AsyncSession, user: User, raw_code: str, sermon: Sermon | None = None) -> ScreenSession:
    """Conecta a tela ao aparelho do pregador. A conexão vale para qualquer ministração dele."""
    s = await find_open(db, raw_code)
    if s is None:
        raise AppError(404, "screen_not_found", "Screen not found")
    # Uma tela conectada não pode ser tomada por outra pessoa
    if s.user_id is not None and s.user_id != user.id:
        raise AppError(409, "screen_taken", "This screen is already connected")
    s.user_id = user.id
    if sermon is not None:
        s.sermon_id = sermon.id
    s.paired_at = s.paired_at or _now()
    s.expires_at = _now() + PAIRED_TTL
    s.slide = None
    s.version += 1
    await db.commit()
    return s


async def use_sermon(db: AsyncSession, s: ScreenSession, sermon: Sermon) -> ScreenSession:
    """O pregador abriu outra ministração: a tela passa a usar o fundo dela (o texto some até ele escolher)."""
    if s.sermon_id != sermon.id:
        s.sermon_id = sermon.id
        s.slide = None
        s.version += 1
    s.expires_at = _now() + PAIRED_TTL
    await db.commit()
    return s


async def show(db: AsyncSession, s: ScreenSession, slide: dict | None) -> ScreenSession:
    s.slide = slide
    s.version += 1
    s.expires_at = _now() + PAIRED_TTL
    await db.commit()
    return s


async def latest_background(db: AsyncSession, sermon_id) -> SlideBackground | None:
    if sermon_id is None:
        return None
    return await db.scalar(
        select(SlideBackground)
        .where(SlideBackground.sermon_id == sermon_id)
        .order_by(SlideBackground.created_at.desc())
        .limit(1)
    )


def background_out(bg: SlideBackground | None) -> dict:
    if bg is None:
        return {"id": None, "image": False, "style": DEFAULT_STYLE}
    return {"id": str(bg.id), "image": bg.data is not None, "style": {**DEFAULT_STYLE, **bg.style}}


async def allowance(db: AsyncSession, user: User) -> dict:
    if "admin" in user.role_names:
        return {"can_generate": True, "remaining": None}
    quotas = await get_setting(db, "slides.quotas")
    month = _now().replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    used = await db.scalar(
        select(func.count())
        .select_from(SlideBackground)
        .where(SlideBackground.user_id == user.id, SlideBackground.created_at >= month)
    )
    limit = int(quotas["pro_monthly"] if await get_plan(db, user.id) == "pro" else quotas["free_monthly"])
    left = limit - int(used or 0)
    return {"can_generate": left > 0, "remaining": max(0, left)}


def _clean_style(data: dict) -> dict:
    style = dict(DEFAULT_STYLE)
    for key in ("text_color", "accent_color"):
        if isinstance(data.get(key), str) and _HEX.match(data[key]):
            style[key] = data[key]
    try:
        style["overlay"] = min(0.8, max(0.15, float(data.get("overlay", style["overlay"]))))
    except (TypeError, ValueError):
        pass
    if data.get("font") in ("serif", "sans"):
        style["font"] = data["font"]
    grad = [c for c in data.get("gradient") or [] if isinstance(c, str) and _HEX.match(c)]
    if len(grad) >= 2:
        style["gradient"] = grad[:2]
    return style


async def generate_background(db: AsyncSession, user: User, sermon: Sermon) -> SlideBackground:
    """Cria o visual dos slides desta ministração (cores + imagem de fundo, quando há chave da OpenAI)."""
    if not (await allowance(db, user))["can_generate"]:
        raise AppError(429, "slides_quota", "Monthly limit of slide backgrounds reached")

    cfg = (await get_setting(db, "ai.models"))["slide_design"]
    provider = get_provider(cfg["model"])
    prompt = (
        f"<title>{sermon.title}</title>\n<theme>{sermon.theme or ''}</theme>\n"
        f"<main_passage>{sermon.main_reference or ''}</main_passage>"
    )
    plan = await get_plan(db, user.id)
    try:
        data, completion = await provider.complete_json(
            model=cfg["model"],
            system=DESIGN_SYSTEM,
            prompt=prompt,
            schema=DESIGN_SCHEMA,
            effort=cfg["effort"],
            max_tokens=int(cfg["max_tokens"]),
        )
        await ai_service.record_usage(
            db,
            user_id=user.id,
            plan=plan,
            feature="slide_design",
            provider=provider.name,
            completion=completion,
            status="ok",
        )
    except ProviderError as e:
        log.error("design dos slides falhou: %s", e)
        raise AppError(503, "ai_unavailable", "Could not create the slide design now") from None

    style = _clean_style(data if isinstance(data, dict) else {})
    image_prompt = str(data.get("image_prompt") or "")[:1500] if isinstance(data, dict) else ""
    bg = SlideBackground(user_id=user.id, sermon_id=sermon.id, style=style, prompt=image_prompt)
    image = await _image(db, user, plan, image_prompt) if image_prompt else None
    if image:
        bg.data, bg.mime, bg.model = image
    db.add(bg)
    await db.commit()
    await db.refresh(bg)
    return bg


async def _image(db: AsyncSession, user: User, plan: str, prompt: str) -> tuple[bytes, str, str] | None:
    key = secrets.get("openai_api_key")
    if not key:
        return None
    cfg = await get_setting(db, "visual.images")
    body = {
        "model": cfg["model"],
        "prompt": IMAGE_STYLE + prompt,
        "size": cfg["size"],
        "quality": cfg["quality"],
        "n": 1,
        "output_format": "webp",
        "output_compression": 80,
    }
    try:
        async with httpx.AsyncClient(timeout=240) as client:
            r = await client.post(
                "https://api.openai.com/v1/images/generations",
                headers={"Authorization": f"Bearer {key}"},
                json=body,
            )
            r.raise_for_status()
            data = r.json()
            raw = base64.b64decode(data["data"][0]["b64_json"])
    except (httpx.HTTPError, KeyError, IndexError, ValueError) as e:
        log.error("fundo dos slides falhou: %s", str(e)[:200])
        return None
    usage = data.get("usage") or {}
    await ai_service.record_usage(
        db,
        user_id=user.id,
        plan=plan,
        feature="slide_image",
        provider="openai",
        completion=Completion(
            model=cfg["model"],
            usage=Usage(
                input_tokens=int(usage.get("input_tokens") or 0),
                output_tokens=int(usage.get("output_tokens") or 0),
            ),
        ),
        status="ok",
    )
    return raw, "image/webp", cfg["model"]
