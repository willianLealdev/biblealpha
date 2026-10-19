"""Modelos de ministração: a estrutura inicial de cada tipo."""

import uuid

TEMPLATES: dict[str, dict[str, list[tuple[str, dict[str, str]]]]] = {
    # tipo -> lista de (papel, títulos por idioma)
    "expository": [
        ("intro", {"pt-BR": "Introdução", "en": "Introduction"}),
        ("other", {"pt-BR": "Contexto da passagem", "en": "Context of the passage"}),
        ("point", {"pt-BR": "1. Observação do texto", "en": "1. Observing the text"}),
        ("point", {"pt-BR": "2. Interpretação", "en": "2. Interpretation"}),
        ("application", {"pt-BR": "Aplicação", "en": "Application"}),
        ("conclusion", {"pt-BR": "Conclusão", "en": "Conclusion"}),
    ],
    "thematic": [
        ("intro", {"pt-BR": "Introdução", "en": "Introduction"}),
        ("point", {"pt-BR": "1. Primeiro ponto", "en": "1. First point"}),
        ("point", {"pt-BR": "2. Segundo ponto", "en": "2. Second point"}),
        ("point", {"pt-BR": "3. Terceiro ponto", "en": "3. Third point"}),
        ("application", {"pt-BR": "Aplicação", "en": "Application"}),
        ("conclusion", {"pt-BR": "Conclusão", "en": "Conclusion"}),
    ],
    "textual": [
        ("intro", {"pt-BR": "Introdução", "en": "Introduction"}),
        ("point", {"pt-BR": "1. Primeira divisão do texto", "en": "1. First division of the text"}),
        ("point", {"pt-BR": "2. Segunda divisão do texto", "en": "2. Second division of the text"}),
        ("application", {"pt-BR": "Aplicação", "en": "Application"}),
        ("conclusion", {"pt-BR": "Conclusão", "en": "Conclusion"}),
    ],
    "bible_study": [
        ("intro", {"pt-BR": "Objetivo do estudo", "en": "Study goal"}),
        ("other", {"pt-BR": "Leitura e contexto", "en": "Reading and context"}),
        ("point", {"pt-BR": "Perguntas de observação", "en": "Observation questions"}),
        ("point", {"pt-BR": "Interpretação", "en": "Interpretation"}),
        ("application", {"pt-BR": "Aplicação em grupo", "en": "Group application"}),
        ("conclusion", {"pt-BR": "Oração final", "en": "Closing prayer"}),
    ],
    "evangelistic": [
        (
            "intro",
            {"pt-BR": "Introdução (ponte com a realidade)", "en": "Introduction (bridge to everyday life)"},
        ),
        ("point", {"pt-BR": "O problema: o pecado", "en": "The problem: sin"}),
        ("point", {"pt-BR": "A solução: Cristo", "en": "The answer: Christ"}),
        ("point", {"pt-BR": "A resposta: fé e arrependimento", "en": "The response: faith and repentance"}),
        ("appeal", {"pt-BR": "Convite", "en": "Invitation"}),
    ],
    "devotional": [
        ("intro", {"pt-BR": "Leitura", "en": "Reading"}),
        ("point", {"pt-BR": "Reflexão", "en": "Reflection"}),
        ("application", {"pt-BR": "Aplicação", "en": "Application"}),
        ("conclusion", {"pt-BR": "Oração", "en": "Prayer"}),
    ],
    "small_group": [
        ("intro", {"pt-BR": "Quebra-gelo", "en": "Icebreaker"}),
        ("other", {"pt-BR": "Leitura", "en": "Reading"}),
        ("point", {"pt-BR": "Perguntas para discussão", "en": "Discussion questions"}),
        ("application", {"pt-BR": "Desafio da semana", "en": "Challenge for the week"}),
        ("conclusion", {"pt-BR": "Pedidos de oração", "en": "Prayer requests"}),
    ],
}


def blocks_for(kind: str, locale: str) -> list[dict]:
    lang = "pt-BR" if locale.startswith("pt") else "en"
    blocks: list[dict] = []
    for role, titles in TEMPLATES.get(kind, TEMPLATES["thematic"]):
        blocks.append({"id": uuid.uuid4().hex[:12], "type": "section", "role": role, "title": titles[lang]})
        blocks.append({"id": uuid.uuid4().hex[:12], "type": "text", "text": ""})
    return blocks
