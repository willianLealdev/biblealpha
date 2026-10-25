"""Capas da página Aprender (estilo Netflix): uma cena para cada livro da Bíblia e uma para cada plano.

As cenas são instruções para o ilustrador (IA de imagem). Nunca mostrar o rosto de Jesus."""

from app.devotional.catalog import plans

COVER_STYLE = (
    "Cinematic epic biblical painting, dramatic warm lighting, rich colors, film poster composition with "
    "the main subject in the upper two thirds and darker space at the bottom, historically plausible ancient "
    "Near East clothing and landscapes, no text, no letters, no watermark. Never show the face of Jesus; "
    "show him from behind, far away or as light. Scene: "
)

BOOK_SCENES: dict[str, str] = {
    "GEN": "an old man under a stormy sky beside a great wooden ark, the first rainbow breaking through",
    "EXO": "Moses with a staff raising his arms as the Red Sea parts into towering walls of water",
    "LEV": "fire falling on a stone altar before the tabernacle, priests in white linen",
    "NUM": "the tribes of Israel camped in the desert around the tabernacle under a pillar of cloud",
    "DEU": "an aged Moses on a mountain looking over the promised land at sunset",
    "JOS": "the walls of Jericho collapsing while priests blow ram's horns",
    "JDG": "a lone warrior with a torch and a trumpet at night before an enemy camp",
    "RUT": "a young woman gleaning golden wheat in a field at sunset",
    "1SA": "a shepherd boy with a sling facing a giant armored warrior",
    "2SA": "King David dancing before the ark of the covenant entering Jerusalem",
    "1KI": "a king on a throne of ivory in a golden temple, fire on Mount Carmel in the distance",
    "2KI": "a prophet watching a chariot of fire with horses of fire rising into a whirlwind",
    "1CH": "Levite musicians with harps and cymbals before the ark",
    "2CH": "the glory cloud filling Solomon's temple as priests kneel",
    "EZR": "exiles returning to rebuild the temple foundations, a scribe reading a scroll",
    "NEH": "builders on the walls of Jerusalem holding tools and swords",
    "EST": "a Jewish queen in royal robes approaching a Persian king's throne",
    "JOB": "a man sitting in ashes looking up at a whirlwind in a vast desert sky",
    "PSA": "a shepherd playing a harp on a hillside under the stars",
    "PRO": "an old wise king reading a scroll by lamplight",
    "ECC": "a lone figure on a hill watching the sun set over an ancient city",
    "SNG": "a vineyard in bloom with a garden and doves at dawn",
    "ISA": "a prophet in the temple seeing seraphim of light and smoke",
    "JER": "a weeping prophet among the ruins of Jerusalem holding a scroll",
    "LAM": "a desolate ruined city at dusk with smoke rising",
    "EZK": "a valley of dry bones coming to life under a stormy sky",
    "DAN": "a man praying calmly in a den surrounded by lions",
    "HOS": "a faithful husband walking toward a woman at a city gate at dawn",
    "JOL": "a swarm of locusts over fields and then rain falling on green hills",
    "AMO": "a shepherd prophet holding a plumb line beside a city wall",
    "OBA": "the rock city of Edom carved in red cliffs under dark clouds",
    "JON": "a great fish in a stormy sea beneath a tossing ship",
    "MIC": "a small village of Bethlehem on a hillside under a bright star",
    "NAM": "the fall of a mighty walled city by a flooding river",
    "HAB": "a prophet on a watchtower writing on tablets at dawn",
    "ZEP": "a dark day of storm over Jerusalem with light breaking at the horizon",
    "HAG": "workers rebuilding the temple with stones and timber",
    "ZEC": "a humble king riding a donkey toward Jerusalem's gate, seen from behind",
    "MAL": "the sun rising with healing light over a field and a refiner's fire",
    "MAT": "a crowd on a hillside listening to a teacher seen from behind, Sea of Galilee below",
    "MRK": "a boat on a stormy sea at night with waves calming around it",
    "LUK": "a manger in a stable at night with shepherds and a radiant light",
    "JHN": "an empty tomb with the stone rolled away and morning light",
    "ACT": "tongues of fire over a group of disciples in an upper room",
    "ROM": "an apostle in chains writing a letter by lamplight in Rome",
    "1CO": "a busy Greek port city with columns and a small house church",
    "2CO": "a clay jar glowing with light on a wooden table",
    "GAL": "broken chains on the ground and a path leading into sunlight",
    "EPH": "a soldier's armor laid out with a shield and sword of light",
    "PHP": "an apostle smiling in a prison cell with sunlight through the bars",
    "COL": "a cosmic view of stars and earth with a cross of light",
    "1TH": "believers looking up at a dawn sky with clouds and a trumpet of light",
    "2TH": "a calm watchman on a city wall at night holding a lamp",
    "1TI": "an older mentor handing a scroll to a young pastor",
    "2TI": "an aged apostle in a dungeon writing his last letter",
    "TIT": "the island of Crete with a small church gathering by the sea",
    "PHM": "a freed servant returning to a house with a letter in hand",
    "HEB": "a high priest entering a sanctuary behind a torn veil of light",
    "JAS": "hands planting seeds and helping a poor traveler on a road",
    "1PE": "a fiery furnace of trial with gold being refined",
    "2PE": "a mountain at sunrise with a shining cloud of glory",
    "1JN": "a candle of light pushing back darkness in an ancient room",
    "2JN": "an elder writing a short letter to a family",
    "3JN": "travelers welcomed into a home with bread and lamps",
    "JUD": "a lighthouse on rocks in a dark storm guiding ships",
    "REV": "a heavenly city of gold descending from the sky with a river of life",
}


def cover_prompt(key: str) -> str | None:
    kind, _, ref = key.partition(":")
    if kind == "book" and ref in BOOK_SCENES:
        return COVER_STYLE + BOOK_SCENES[ref]
    if kind == "plan" and ref in plans():
        p = plans()[ref]
        theme = (
            f"{p.title.get('en') or p.title['pt-BR']} — {p.description.get('en') or p.description['pt-BR']}"
        )
        return COVER_STYLE + (
            "ONE single iconic scene (never a collage, grid or montage of several scenes) that captures "
            f"the heart of this Bible reading plan, with one clear focal point: {theme}"
        )
    return None


def all_keys() -> list[str]:
    return [f"book:{c}" for c in BOOK_SCENES] + [f"plan:{c}" for c in plans()]
