"""Gera ícones e variações do logo BibleAlpha a partir da arte original.

Uso (na raiz do projeto):  py tools/brand/build.py
Requer: Pillow  (py -m pip install pillow)

A arte original (assets/brand/logo-original.webp) não é redesenhada: os ícones são
recortes e redimensionamentos dela. A versão para fundo branco mantém o selo original
intacto e só troca a cor do texto branco/prata para tinta escura.
"""
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter

ROOT = Path(__file__).resolve().parents[2]
SRC = ROOT / "assets/brand/logo-original.webp"
OUT = ROOT / "assets/brand"

# Medidas da arte original (1254x1254)
FRAME = (249, 99, 999, 803)          # moldura dourada do selo: x0, y0, x1, y1
TILE_CROP = (243, 60, 1005, 822)     # quadrado de 762 px: selo + raios acima (o texto começa em y≈830)
TEXT_BOX = (60, 826, 1194, 1120)     # "BibleAlpha" + tagline
SPLIT_X = 623                        # onde termina "Bible" (prata) e começa "Alpha" (dourado)
TAGLINE_Y = 1068                     # início da linha da tagline
BG = (4, 3, 2)                       # preto do fundo original
INK = (22, 18, 12)                   # tinta escura para o tema claro (#16120C)


def save(img: Image.Image, rel: str, size: int | None = None) -> Path:
    if size:
        img = img.resize((size, size), Image.LANCZOS)
    path = OUT / rel
    path.parent.mkdir(parents=True, exist_ok=True)
    img.save(path)
    return path


def padded(tile: Image.Image, fraction: float, canvas: int = 1024, bg=BG) -> Image.Image:
    """Centraliza o selo ocupando `fraction` do lado, sobre fundo preto (ou transparente)."""
    side = round(canvas * fraction)
    out = Image.new("RGBA", (canvas, canvas), bg + (255,) if bg else (0, 0, 0, 0))
    t = tile.resize((side, side), Image.LANCZOS).convert("RGBA")
    out.alpha_composite(t, ((canvas - side) // 2, (canvas - side) // 2))
    return out


def unmultiply_black(img: Image.Image) -> Image.Image:
    """Remove o fundo preto mantendo brilhos e degradês (alpha = luminosidade máxima)."""
    img = img.convert("RGB")
    out = Image.new("RGBA", img.size)
    src, dst = img.load(), out.load()
    for y in range(img.height):
        for x in range(img.width):
            r, g, b = src[x, y]
            a = max(r, g, b)
            if a <= 6:
                dst[x, y] = (0, 0, 0, 0)
                continue
            k = 255 / a
            dst[x, y] = (min(255, round(r * k)), min(255, round(g * k)), min(255, round(b * k)), a)
    return out


def feather_edges(img: Image.Image, fraction: float = 0.1) -> Image.Image:
    """Esmaece as bordas (o brilho da arte original vai até o limite do quadro)."""
    w, h = img.size
    m = round(min(w, h) * fraction)
    ramp = Image.new("L", (w, h), 0)
    ImageDraw.Draw(ramp).rectangle((m, m, w - m, h - m), fill=255)
    ramp = ramp.filter(ImageFilter.GaussianBlur(m / 2))
    out = img.copy()
    alpha = out.getchannel("A")
    out.putalpha(Image.composite(alpha, Image.new("L", (w, h), 0), ramp))
    return out


def recolor_for_light(crop: Image.Image, split_x: int, tagline_y: int) -> Image.Image:
    """Versão para fundo branco do texto: "Bible" e a tagline viram tinta escura,
    "Alpha" e os filetes mantêm o dourado original (um pouco mais profundo).
    O brilho difuso em volta das letras é descartado para não virar mancha no branco."""
    crop = crop.convert("RGB")
    out = Image.new("RGBA", crop.size, (0, 0, 0, 0))
    src, dst = crop.load(), out.load()
    for y in range(crop.height):
        for x in range(crop.width):
            r, g, b = src[x, y]
            lum = max(r, g, b)
            a = max(0.0, min(1.0, (lum - 70) / 70))
            if a == 0:
                continue
            sat = (lum - min(r, g, b)) / lum
            gold = sat >= 0.3 if y >= tagline_y else x >= split_x
            color = (round(r * 0.8), round(g * 0.74), round(b * 0.62)) if gold else INK
            dst[x, y] = color + (round(a * 255),)
    return out


def seal_mask(img: Image.Image, box) -> Image.Image:
    """Máscara do selo seguindo a borda dourada real (os cantos não são círculos perfeitos)."""
    x0, y0, x1, y1 = box
    px = img.load()
    bright = lambda x, y: max(px[x, y]) > 120
    rows, cols = {}, {}
    for y in range(y0, y1 + 1):
        xs = [x for x in range(x0 - 4, x1 + 4) if bright(x, y)]
        if xs:
            rows[y] = (xs[0], xs[-1])
    for x in range(x0, x1 + 1):
        ys = [y for y in range(y0 - 4, y1 + 4) if bright(x, y)]
        if ys:
            cols[x] = (ys[0], ys[-1])
    mask = Image.new("L", img.size, 0)
    m = mask.load()
    for y, (a, b) in rows.items():
        for x in range(a, b + 1):
            c = cols.get(x)
            if c and c[0] <= y <= c[1]:
                m[x, y] = 255
    return mask.filter(ImageFilter.GaussianBlur(0.8))


def main() -> None:
    original = Image.open(SRC).convert("RGB")
    W, H = original.size
    tile = original.crop(TILE_CROP)  # selo com moldura e um pouco do fundo preto

    # ---------- Ícone do app (Expo) ----------
    # Selo ocupa 86% para os cantos arredondados do iOS/Android não cortarem a moldura.
    icon = padded(tile, 0.86)
    save(icon.convert("RGB"), "app/icon.png")                       # iOS não aceita transparência
    save(padded(tile, 0.62, bg=None), "app/adaptive-foreground.png")  # Android: área segura de 66%
    save(padded(tile, 0.55), "app/splash-icon.png")

    # ---------- PWA / navegador ----------
    save(icon.convert("RGB"), "web/icon-512.png", 512)
    save(icon.convert("RGB"), "web/icon-192.png", 192)
    save(padded(tile, 0.72).convert("RGB"), "web/icon-maskable-512.png", 512)
    save(icon.convert("RGB"), "web/apple-touch-icon.png", 180)
    tight = original.crop(FRAME).resize((704, 704), Image.LANCZOS)  # favicon: só o selo, sem margem
    favs = [save(tight, f"web/favicon-{s}.png", s) for s in (16, 32, 48)]
    Image.open(favs[2]).save(OUT / "web/favicon.ico", sizes=[(16, 16), (32, 32), (48, 48)])

    # ---------- Logo completo ----------
    save(original, "logo/logo-on-dark.png")                          # idêntico ao original, PNG
    transparent = unmultiply_black(original)
    save(feather_edges(transparent), "logo/logo-on-dark-transparent.png")           # sobre qualquer fundo escuro

    # Fundo branco: selo original intacto (recortado pela moldura) + texto recolorido
    light = Image.new("RGBA", (W, H), (255, 255, 255, 255))
    seal = original.convert("RGBA")
    seal.putalpha(seal_mask(original, FRAME))
    light.alpha_composite(seal)
    text = recolor_for_light(original.crop(TEXT_BOX), SPLIT_X - TEXT_BOX[0], TAGLINE_Y - TEXT_BOX[1])
    light.alpha_composite(text, TEXT_BOX[:2])
    save(light.convert("RGB"), "logo/logo-on-light.png")

    # Só o texto (para cabeçalhos)
    save(transparent.crop(TEXT_BOX), "logo/wordmark-on-dark-transparent.png")
    save(text, "logo/wordmark-on-light-transparent.png")
    # Só o selo, com cantos transparentes (funciona sobre branco e preto)
    seal_only = seal.crop(FRAME)
    save(seal_only, "logo/seal.png")

    # ---------- Folha de conferência ----------
    sheet = Image.new("RGB", (2000, 1100), (255, 255, 255))
    sheet.paste(Image.new("RGB", (1000, 1100), BG), (0, 0))
    sheet.paste(original.resize((620, 620), Image.LANCZOS), (190, 20))
    sheet.paste(light.convert("RGB").resize((620, 620), Image.LANCZOS), (1190, 20))
    for i, s in enumerate((180, 96, 48, 32, 16)):
        ic = icon.convert("RGB").resize((s, s), Image.LANCZOS)
        x = [60, 280, 420, 510, 580][i]
        sheet.paste(ic, (x, 720 + (180 - s) // 2))
        sheet.paste(ic, (1000 + x, 720 + (180 - s) // 2))
    wd = transparent.crop(TEXT_BOX).resize((567, 147), Image.LANCZOS)
    sheet.paste(wd, (60, 930), wd)
    wl = text.resize((567, 147), Image.LANCZOS)
    sheet.paste(wl, (1060, 930), wl)
    sheet.save(OUT / "preview.png")
    print("Ativos gerados em", OUT)


if __name__ == "__main__":
    main()
