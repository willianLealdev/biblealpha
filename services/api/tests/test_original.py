from sqlalchemy import delete, insert

from app.bible import original
from app.db.session import get_sessionmaker
from app.models import CrossReference, LexiconEntry, OriginalWord

HEB = (
    "Eng (Heb) Ref & Type\tHebrew\tTransliteration\tTranslation\tdStrongs\tGrammar\n"
    "Gen.1.1#01=L\tבְּ/רֵאשִׁ֖ית\tbe./re.Shit\tin/ beginning\tH9003/{H7225G}\tHR/Ncfsa\t\t\tH7225G\n"
    "Gen.1.1#02=L\tבָּרָ֣א\tba.Ra'\the created\t{H1254A}\tHVqp3ms\t\t\tH1254A\n"
    "Gen.1.1#02=Q\tבָּרָ֣א\tba.Ra'\tduplicate\t{H1254A}\tHVqp3ms\n"
    "Mal.4.1(3.19)#01=L\tכִּֽי\tki\tfor\t{H3588A}\tHC\n"
)
GRK = (
    "Word & Type\tGreek\tEnglish translation\tdStrongs = Grammar\tDictionary form =  Gloss\teditions\t\t\tSpanish\n"
    "Jhn.1.1#01=NKO\tἘν (En)\tIn [the]\tG1722=PREP\tἐν=in\tNA28\t\t\tEn\n"
    "Jhn.1.1#05=NKO\tλόγος, (logos)\tWord,\tG3056=N-NSM\tλόγος=word\tNA28\t\t\tPalabra\n"
)
LEX = "G3056\tG3056 =\tG3056\tλόγος\tlogos\tG:N-M\tword\tthe <b>word</b><br>speech\n"
XREF = "From Verse\tTo Verse\tVotes\nJohn.3.16\tRom.5.8\t991\nJohn.3.16\t1John.4.9-1John.4.10\t704\nJohn.3.16\tGen.1.1\t-3\n"


def test_parsers_map_books_and_versification():
    words = original.parse_words(HEB, greek=False)
    assert [(w["verse_key"], w["position"], w["strong"]) for w in words] == [
        (1001001, 1, "H7225G"),
        (1001001, 2, "H1254A"),
        (39004001, 1, "H3588A"),  # numeração das traduções (Malaquias 4), não a hebraica (3:19)
    ]
    greek = original.parse_words(GRK, greek=True)
    assert (
        greek[1]["text"] == "λόγος," and greek[1]["translit"] == "logos" and greek[1]["gloss_es"] == "Palabra"
    )
    lex = original.parse_lexicon(LEX)
    assert lex[0]["strong"] == "G3056" and lex[0]["definition"] == "the word\nspeech"
    refs = original.parse_crossrefs(XREF)
    assert refs == [
        {"from_key": 43003016, "to_start": 45005008, "to_end": 45005008, "votes": 991},
        {"from_key": 43003016, "to_start": 62004009, "to_end": 62004010, "votes": 704},
    ]


async def test_original_lexicon_crossrefs_and_compare(client):
    async with get_sessionmaker()() as db:
        await db.execute(insert(OriginalWord), original.parse_words(GRK, greek=True))
        await db.execute(insert(LexiconEntry), original.parse_lexicon(LEX))
        await db.execute(insert(CrossReference), original.parse_crossrefs(XREF))
        await db.commit()
    try:
        o = (await client.get("/api/v1/bible/original/JHN/1?verse=1")).json()
        assert o["language"] == "greek" and [w["strong"] for w in o["verses"][0]["words"]] == [
            "G1722",
            "G3056",
        ]
        assert "STEPBible" in o["credit"]

        lx = (await client.get("/api/v1/bible/lexicon/G3056")).json()
        assert lx["lemma"] == "λόγος" and lx["occurrences"] == 1 and lx["verses"] == [43001001]
        # Outro idioma: a explicação é traduzida uma vez e guardada
        pt = (await client.get("/api/v1/bible/lexicon/G3056?locale=pt-BR")).json()
        assert pt["definition"] != lx["definition"]
        assert (await client.get("/api/v1/bible/lexicon/G9999")).status_code == 404

        xr = (await client.get("/api/v1/bible/crossrefs/43003016?translation=blivre")).json()
        assert [x["start"] for x in xr["items"]] == [45005008, 62004009]
        assert xr["items"][0]["text"].startswith("Mas Deus") and "OpenBible" in xr["credit"]

        cmp = (
            await client.get("/api/v1/bible/compare?start=43003016&translations=blivre,web,rv1909,nope")
        ).json()
        assert [x["abbreviation"] for x in cmp["items"]] == ["BLIVRE", "WEB", "RV1909"]
        assert cmp["items"][2]["verses"][0]["text"].startswith("Porque de tal manera")
    finally:
        async with get_sessionmaker()() as db:
            for model in (OriginalWord, LexiconEntry, CrossReference):
                await db.execute(delete(model))
            await db.commit()
