"""Imagem de versículo para redes sociais (feed 4:5 ou story 9:16).

Feita no servidor com Pillow para sair igual no site, no iPhone e no Android. Fontes livres (OFL) em
`fonts/`. Não guarda nada: a imagem é montada e devolvida na hora."""

import io
import math
from functools import lru_cache
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter, ImageFont, ImageOps

FONTS = Path(__file__).parent / "fonts"
W = 1080
SIZES = {"feed": (W, 1350), "story": (W, 1920)}

# Fundos prontos: degradê de duas cores (texto sempre claro)
PRESETS: dict[str, tuple[str, str]] = {
    "gold": ("#1a1206", "#6b4a12"),
    "ocean": ("#0f2027", "#2c5364"),
    "aurora": ("#2f0743", "#41295a"),
    "forest": ("#0b3d2e", "#1e6b52"),
    "wine": ("#3a0d14", "#8e2430"),
    "sky": ("#1e3c72", "#2a5298"),
    "graphite": ("#141414", "#3a3a3a"),
    "sunset": ("#5f2c82", "#c0392b"),
}
GOLD = (233, 196, 106)


@lru_cache(maxsize=32)
def _font(name: str, size: int) -> ImageFont.FreeTypeFont:
    return ImageFont.truetype(str(FONTS / name), size)


def _hex(c: str) -> tuple[int, int, int]:
    c = c.lstrip("#")
    return int(c[0:2], 16), int(c[2:4], 16), int(c[4:6], 16)


def _gradient(size: tuple[int, int], a: str, b: str) -> Image.Image:
    """Degradê na diagonal com um brilho suave no alto."""
    w, h = size
    ca, cb = _hex(a), _hex(b)
    # Degradê pequeno e ampliado: rápido e sem faixas visíveis
    small = Image.new("RGB", (64, 64))
    px = small.load()
    for y in range(64):
        for x in range(64):
            t = (x + y) / 126
            px[x, y] = tuple(round(ca[i] + (cb[i] - ca[i]) * t) for i in range(3))
    img = small.resize(size, Image.Resampling.BICUBIC)
    glow = Image.new("L", size, 0)
    ImageDraw.Draw(glow).ellipse((w * 0.1, -h * 0.25, w * 0.9, h * 0.35), fill=70)
    glow = glow.filter(ImageFilter.GaussianBlur(160))
    return Image.composite(Image.new("RGB", size, (255, 236, 190)), img, glow)


def _photo(raw: bytes, size: tuple[int, int]) -> Image.Image:
    """Foto ocupando tudo (corte central) com escurecimento para o texto aparecer."""
    img = ImageOps.exif_transpose(Image.open(io.BytesIO(raw))).convert("RGB")
    img = ImageOps.fit(img, size, Image.Resampling.LANCZOS)
    shade = Image.new("L", size, 0)
    d = ImageDraw.Draw(shade)
    h = size[1]
    for y in range(h):
        # Mais escuro no meio (onde fica o texto) e embaixo (referência e marca)
        mid = 1 - abs(y - h * 0.5) / (h * 0.5)
        d.line([(0, y), (size[0], y)], fill=round(95 + 70 * mid + 40 * max(0, (y - h * 0.75) / (h * 0.25))))
    return Image.composite(Image.new("RGB", size, (0, 0, 0)), img, shade)


def _wrap(draw: ImageDraw.ImageDraw, text: str, font: ImageFont.FreeTypeFont, width: int) -> list[str]:
    lines: list[str] = []
    for paragraph in text.split("\n"):
        line = ""
        for word in paragraph.split():
            test = f"{line} {word}".strip()
            if draw.textlength(test, font=font) <= width or not line:
                line = test
            else:
                lines.append(line)
                line = word
        lines.append(line)
    return lines


def render(
    text: str, reference: str, fmt: str, *, preset: str | None = None, photo: bytes | None = None
) -> bytes:
    size = SIZES[fmt]
    w, h = size
    if photo is not None:
        img = _photo(photo, size)
    else:
        a, b = PRESETS.get(preset or "gold", PRESETS["gold"])
        img = _gradient(size, a, b)
    draw = ImageDraw.Draw(img)

    quote = f"“{text.strip()}”"
    box_w = w - 2 * 110
    box_h = h * (0.52 if fmt == "feed" else 0.5)
    size_px = 84
    while True:
        font = _font("CormorantGaramond_600SemiBold_Italic.ttf", size_px)
        lines = _wrap(draw, quote, font, box_w)
        line_h = math.ceil(size_px * 1.28)
        if len(lines) * line_h <= box_h or size_px <= 34:
            break
        size_px -= 4

    ref_font = _font("Inter_600SemiBold.ttf", 40)
    brand_font = _font("Inter_500Medium.ttf", 28)
    block = len(lines) * line_h + 40 + 50
    y = (h - block) / 2 - (30 if fmt == "story" else 10)
    # Sombra desfocada atrás do texto, para ler bem em qualquer foto
    shadow = Image.new("L", size, 0)
    sd = ImageDraw.Draw(shadow)
    sy = y
    for line in lines:
        lw = draw.textlength(line, font=font)
        sd.text(((w - lw) / 2 + 2, sy + 4), line, font=font, fill=200)
        sy += line_h
    img.paste((0, 0, 0), (0, 0), shadow.filter(ImageFilter.GaussianBlur(8)))
    for line in lines:
        lw = draw.textlength(line, font=font)
        draw.text(((w - lw) / 2, y), line, font=font, fill=(255, 255, 255))
        y += line_h
    y += 40
    draw.line([(w / 2 - 50, y - 18), (w / 2 + 50, y - 18)], fill=GOLD, width=3)
    rw = draw.textlength(reference, font=ref_font)
    draw.text(((w - rw) / 2, y), reference, font=ref_font, fill=GOLD)

    brand = "BibleAlpha · biblealpha.com"
    bw = draw.textlength(brand, font=brand_font)
    bottom = h - (120 if fmt == "story" else 80)
    draw.text(((w - bw) / 2, bottom), brand, font=brand_font, fill=(225, 225, 225))

    out = io.BytesIO()
    img.save(out, "JPEG", quality=90, optimize=True)
    return out.getvalue()
