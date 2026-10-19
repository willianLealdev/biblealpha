"""Exportação da ministração para PDF (arquivo de verdade, gerado no servidor).

Mesmo conteúdo do Word: título, detalhes, seções, textos bíblicos e notas. Fontes do app
(Literata para o texto, Inter para rótulos, Cormorant Garamond para títulos), com acentos.
"""

import re
from pathlib import Path

from fpdf import FPDF

from app.models import Sermon

FONTS = Path(__file__).parent / "fonts"
GOLD = (143, 100, 24)
GRAY = (107, 99, 85)
TEXT = (30, 26, 20)
_INLINE = re.compile(r"(\*\*[^*]+\*\*|==[^=]+==|\*[^*\n]+\*)")


class _Pdf(FPDF):
    def footer(self) -> None:
        self.set_y(-14)
        self.set_font("Inter", size=8)
        self.set_text_color(*GRAY)
        self.cell(0, 6, f"BibleAlpha  ·  {self.page_no()}", align="C")


def _markdown(text: str) -> str:
    """Negrito/itálico/destaque do editor para o markdown simples do fpdf2."""

    def sub(m: re.Match) -> str:
        token = m.group(0)
        if token.startswith("**"):
            return f"**{token[2:-2]}**"
        if token.startswith("=="):
            return f"**{token[2:-2]}**"
        return f"__{token[1:-1]}__"

    escaped = text.replace("__", "_ _")
    return _INLINE.sub(sub, escaped)


def build_pdf(sermon: Sermon, labels: dict[str, str]) -> bytes:
    pdf = _Pdf(format="A4")
    pdf.set_margins(20, 18, 20)
    pdf.set_auto_page_break(True, margin=20)
    pdf.add_font("Literata", "", str(FONTS / "Literata_400Regular.ttf"))
    pdf.add_font("Literata", "I", str(FONTS / "Literata_400Regular_Italic.ttf"))
    pdf.add_font("Literata", "B", str(FONTS / "Inter_600SemiBold.ttf"))
    pdf.add_font("Literata", "BI", str(FONTS / "Inter_600SemiBold.ttf"))
    pdf.add_font("Inter", "", str(FONTS / "Inter_400Regular.ttf"))
    pdf.add_font("Inter", "I", str(FONTS / "Inter_400Regular_Italic.ttf"))
    pdf.add_font("Inter", "B", str(FONTS / "Inter_600SemiBold.ttf"))
    pdf.add_font("Cormorant", "", str(FONTS / "CormorantGaramond_600SemiBold.ttf"))
    pdf.add_page()
    width = pdf.w - pdf.l_margin - pdf.r_margin

    pdf.set_font("Cormorant", size=26)
    pdf.set_text_color(*TEXT)
    pdf.multi_cell(width, 11, sermon.title or "", new_x="LMARGIN", new_y="NEXT")
    pdf.ln(2)

    meta = [
        (labels["main"], sermon.main_reference),
        (labels["theme"], sermon.theme),
        (labels["objective"], sermon.objective),
        (labels["audience"], sermon.audience),
        (labels["event"], sermon.event),
        (labels["date"], sermon.scheduled_for.strftime("%d/%m/%Y") if sermon.scheduled_for else None),
        (labels["duration"], f"{sermon.duration_minutes} min" if sermon.duration_minutes else None),
    ]
    pdf.set_font("Inter", size=10)
    for label, value in meta:
        if value:
            pdf.set_text_color(*GRAY)
            pdf.multi_cell(width, 5.5, f"**{label}:** {value}", markdown=True, new_x="LMARGIN", new_y="NEXT")
    pdf.ln(4)

    for block in sermon.content.get("blocks", []):
        kind = block.get("type")
        if kind == "section":
            pdf.ln(3)
            pdf.set_font("Cormorant", size=18)
            pdf.set_text_color(*GOLD)
            pdf.multi_cell(width, 8, block.get("title") or "", new_x="LMARGIN", new_y="NEXT")
            pdf.ln(1)
        elif kind == "text":
            pdf.set_font("Literata", size=11.5)
            pdf.set_text_color(*TEXT)
            for line in (block.get("text") or "").split("\n"):
                stripped = line.strip()
                if not stripped:
                    pdf.ln(2)
                    continue
                if stripped.startswith("#"):
                    pdf.set_font("Inter", "B", 12)
                    pdf.multi_cell(width, 6.5, stripped.lstrip("#").strip(), new_x="LMARGIN", new_y="NEXT")
                    pdf.set_font("Literata", size=11.5)
                    continue
                bullet = re.match(r"^([-*•]|\d+[.)])\s+(.*)$", stripped)
                if bullet:
                    mark = "•" if bullet.group(1) in "-*•" else bullet.group(1)
                    pdf.set_x(pdf.l_margin + 4)
                    pdf.multi_cell(
                        width - 4,
                        6.2,
                        f"{mark} {_markdown(bullet.group(2))}",
                        markdown=True,
                        new_x="LMARGIN",
                        new_y="NEXT",
                    )
                else:
                    pdf.multi_cell(
                        width, 6.2, _markdown(stripped), markdown=True, new_x="LMARGIN", new_y="NEXT"
                    )
            pdf.ln(1.5)
        elif kind == "scripture":
            pdf.ln(1)
            pdf.set_font("Inter", "B", 10.5)
            pdf.set_text_color(*GOLD)
            pdf.multi_cell(
                width,
                6,
                f"{block.get('reference')} ({block.get('translation')})",
                new_x="LMARGIN",
                new_y="NEXT",
            )
            verses = " ".join(f"{v['verse']} {v['text']}" for v in block.get("verses", []))
            top = pdf.get_y()
            pdf.set_font("Literata", "I", 11)
            pdf.set_text_color(*TEXT)
            pdf.set_x(pdf.l_margin + 6)
            pdf.multi_cell(width - 6, 6, verses, new_x="LMARGIN", new_y="NEXT")
            # Barra dourada à esquerda do texto bíblico (na mesma página)
            if pdf.get_y() > top:
                pdf.set_draw_color(*GOLD)
                pdf.set_line_width(0.8)
                pdf.line(pdf.l_margin + 1.5, top + 1, pdf.l_margin + 1.5, pdf.get_y() - 1)
            pdf.ln(2)
        elif kind == "note":
            pdf.set_font("Inter", "I", 10)
            pdf.set_text_color(*GRAY)
            pdf.multi_cell(
                width, 5.5, f"{labels['note']}: {block.get('text', '')}", new_x="LMARGIN", new_y="NEXT"
            )
            pdf.ln(1.5)

    return bytes(pdf.output())
