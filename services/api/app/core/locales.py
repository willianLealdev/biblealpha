"""Idiomas do app. Português, inglês e espanhol vêm prontos; outros idiomas podem ser
adicionados pelo painel (textos da interface e Bíblias), e o conteúdo gerado pela IA sai
no idioma do usuário."""

BUILTIN = ("pt-BR", "en", "es")

NAMES = {
    "pt-BR": "Brazilian Portuguese",
    "pt": "Portuguese",
    "en": "English",
    "es": "Spanish",
    "fr": "French",
    "de": "German",
    "it": "Italian",
    "nl": "Dutch",
    "ru": "Russian",
    "zh": "Chinese",
    "ko": "Korean",
    "ja": "Japanese",
    "ar": "Arabic",
    "hi": "Hindi",
    "id": "Indonesian",
    "tl": "Tagalog",
    "sw": "Swahili",
    "uk": "Ukrainian",
    "pl": "Polish",
    "ro": "Romanian",
    "tr": "Turkish",
    "vi": "Vietnamese",
}

LOCALE_PATTERN = r"^[a-z]{2,3}(-[A-Z]{2})?$"


def content_lang(locale: str) -> str:
    """Idioma dos textos fixos do servidor (e-mails, temas, categorias): pt-BR, es ou en."""
    lang = (locale or "").lower()
    if lang.startswith("pt"):
        return "pt-BR"
    if lang.startswith("es"):
        return "es"
    return "en"


def language_name(locale: str) -> str:
    """Nome em inglês para pedir à IA a resposta no idioma do usuário."""
    return NAMES.get(locale) or NAMES.get((locale or "").split("-")[0]) or f"the language with code {locale}"
