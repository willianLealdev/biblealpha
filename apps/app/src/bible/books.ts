// Gerado por tools/sync_books.py a partir de services/api/app/bible/data/books.json. Não edite à mão.

export type BookNames = { name: string; abbr: string; aliases: string[] };
export type Book = {
  id: number;
  code: string;
  testament: 'OT' | 'NT';
  chapters: number;
  pt: BookNames;
  en: BookNames;
  es: BookNames;
};

export const BOOKS: Book[] = [
  {
    "id": 1,
    "code": "GEN",
    "testament": "OT",
    "chapters": 50,
    "pt": {
      "name": "Gênesis",
      "abbr": "Gn",
      "aliases": [
        "gen",
        "gênesis",
        "genesis"
      ]
    },
    "en": {
      "name": "Genesis",
      "abbr": "Gen",
      "aliases": [
        "gn",
        "ge"
      ]
    },
    "es": {
      "name": "Génesis",
      "abbr": "Gn",
      "aliases": [
        "gén",
        "gen",
        "génesis",
        "genesis"
      ]
    }
  },
  {
    "id": 2,
    "code": "EXO",
    "testament": "OT",
    "chapters": 40,
    "pt": {
      "name": "Êxodo",
      "abbr": "Ex",
      "aliases": [
        "êx",
        "exo",
        "exodo",
        "êxodo"
      ]
    },
    "en": {
      "name": "Exodus",
      "abbr": "Exod",
      "aliases": [
        "ex",
        "exo"
      ]
    },
    "es": {
      "name": "Éxodo",
      "abbr": "Éx",
      "aliases": [
        "ex",
        "éxo",
        "exo",
        "exodo"
      ]
    }
  },
  {
    "id": 3,
    "code": "LEV",
    "testament": "OT",
    "chapters": 27,
    "pt": {
      "name": "Levítico",
      "abbr": "Lv",
      "aliases": [
        "lev",
        "levitico"
      ]
    },
    "en": {
      "name": "Leviticus",
      "abbr": "Lev",
      "aliases": [
        "lv",
        "le"
      ]
    },
    "es": {
      "name": "Levítico",
      "abbr": "Lv",
      "aliases": [
        "lev",
        "levitico"
      ]
    }
  },
  {
    "id": 4,
    "code": "NUM",
    "testament": "OT",
    "chapters": 36,
    "pt": {
      "name": "Números",
      "abbr": "Nm",
      "aliases": [
        "num",
        "numeros"
      ]
    },
    "en": {
      "name": "Numbers",
      "abbr": "Num",
      "aliases": [
        "nm",
        "nu"
      ]
    },
    "es": {
      "name": "Números",
      "abbr": "Nm",
      "aliases": [
        "núm",
        "num",
        "numeros"
      ]
    }
  },
  {
    "id": 5,
    "code": "DEU",
    "testament": "OT",
    "chapters": 34,
    "pt": {
      "name": "Deuteronômio",
      "abbr": "Dt",
      "aliases": [
        "deut",
        "deuteronomio"
      ]
    },
    "en": {
      "name": "Deuteronomy",
      "abbr": "Deut",
      "aliases": [
        "dt",
        "de"
      ]
    },
    "es": {
      "name": "Deuteronomio",
      "abbr": "Dt",
      "aliases": [
        "deut"
      ]
    }
  },
  {
    "id": 6,
    "code": "JOS",
    "testament": "OT",
    "chapters": 24,
    "pt": {
      "name": "Josué",
      "abbr": "Js",
      "aliases": [
        "jos",
        "josue"
      ]
    },
    "en": {
      "name": "Joshua",
      "abbr": "Josh",
      "aliases": [
        "jsh"
      ]
    },
    "es": {
      "name": "Josué",
      "abbr": "Jos",
      "aliases": [
        "josue"
      ]
    }
  },
  {
    "id": 7,
    "code": "JDG",
    "testament": "OT",
    "chapters": 21,
    "pt": {
      "name": "Juízes",
      "abbr": "Jz",
      "aliases": [
        "jui",
        "juizes"
      ]
    },
    "en": {
      "name": "Judges",
      "abbr": "Judg",
      "aliases": [
        "jdg",
        "jg"
      ]
    },
    "es": {
      "name": "Jueces",
      "abbr": "Jue",
      "aliases": [
        "jue",
        "jc"
      ]
    }
  },
  {
    "id": 8,
    "code": "RUT",
    "testament": "OT",
    "chapters": 4,
    "pt": {
      "name": "Rute",
      "abbr": "Rt",
      "aliases": [
        "rute"
      ]
    },
    "en": {
      "name": "Ruth",
      "abbr": "Ruth",
      "aliases": [
        "ru",
        "rth"
      ]
    },
    "es": {
      "name": "Rut",
      "abbr": "Rt",
      "aliases": [
        "rut"
      ]
    }
  },
  {
    "id": 9,
    "code": "1SA",
    "testament": "OT",
    "chapters": 31,
    "pt": {
      "name": "1 Samuel",
      "abbr": "1Sm",
      "aliases": [
        "1sam",
        "1s",
        "i samuel",
        "1 sm"
      ]
    },
    "en": {
      "name": "1 Samuel",
      "abbr": "1Sam",
      "aliases": [
        "1sa",
        "1 sam",
        "i samuel"
      ]
    },
    "es": {
      "name": "1 Samuel",
      "abbr": "1 S",
      "aliases": [
        "1sam",
        "1sa"
      ]
    }
  },
  {
    "id": 10,
    "code": "2SA",
    "testament": "OT",
    "chapters": 24,
    "pt": {
      "name": "2 Samuel",
      "abbr": "2Sm",
      "aliases": [
        "2sam",
        "2s",
        "ii samuel",
        "2 sm"
      ]
    },
    "en": {
      "name": "2 Samuel",
      "abbr": "2Sam",
      "aliases": [
        "2sa",
        "2 sam",
        "ii samuel"
      ]
    },
    "es": {
      "name": "2 Samuel",
      "abbr": "2 S",
      "aliases": [
        "2sam",
        "2sa"
      ]
    }
  },
  {
    "id": 11,
    "code": "1KI",
    "testament": "OT",
    "chapters": 22,
    "pt": {
      "name": "1 Reis",
      "abbr": "1Rs",
      "aliases": [
        "1re",
        "i reis",
        "1 rs"
      ]
    },
    "en": {
      "name": "1 Kings",
      "abbr": "1Kgs",
      "aliases": [
        "1ki",
        "1kgs",
        "1 kings",
        "i kings"
      ]
    },
    "es": {
      "name": "1 Reyes",
      "abbr": "1 R",
      "aliases": [
        "1re",
        "1rey",
        "1reyes"
      ]
    }
  },
  {
    "id": 12,
    "code": "2KI",
    "testament": "OT",
    "chapters": 25,
    "pt": {
      "name": "2 Reis",
      "abbr": "2Rs",
      "aliases": [
        "2re",
        "ii reis",
        "2 rs"
      ]
    },
    "en": {
      "name": "2 Kings",
      "abbr": "2Kgs",
      "aliases": [
        "2ki",
        "2kgs",
        "2 kings",
        "ii kings"
      ]
    },
    "es": {
      "name": "2 Reyes",
      "abbr": "2 R",
      "aliases": [
        "2re",
        "2rey",
        "2reyes"
      ]
    }
  },
  {
    "id": 13,
    "code": "1CH",
    "testament": "OT",
    "chapters": 29,
    "pt": {
      "name": "1 Crônicas",
      "abbr": "1Cr",
      "aliases": [
        "1cron",
        "i cronicas",
        "1 cr"
      ]
    },
    "en": {
      "name": "1 Chronicles",
      "abbr": "1Chr",
      "aliases": [
        "1ch",
        "1chron",
        "i chronicles"
      ]
    },
    "es": {
      "name": "1 Crónicas",
      "abbr": "1 Cr",
      "aliases": [
        "1cró",
        "1cro",
        "1cronicas",
        "1 cronicas"
      ]
    }
  },
  {
    "id": 14,
    "code": "2CH",
    "testament": "OT",
    "chapters": 36,
    "pt": {
      "name": "2 Crônicas",
      "abbr": "2Cr",
      "aliases": [
        "2cron",
        "ii cronicas",
        "2 cr"
      ]
    },
    "en": {
      "name": "2 Chronicles",
      "abbr": "2Chr",
      "aliases": [
        "2ch",
        "2chron",
        "ii chronicles"
      ]
    },
    "es": {
      "name": "2 Crónicas",
      "abbr": "2 Cr",
      "aliases": [
        "2cró",
        "2cro",
        "2cronicas",
        "2 cronicas"
      ]
    }
  },
  {
    "id": 15,
    "code": "EZR",
    "testament": "OT",
    "chapters": 10,
    "pt": {
      "name": "Esdras",
      "abbr": "Ed",
      "aliases": [
        "esd"
      ]
    },
    "en": {
      "name": "Ezra",
      "abbr": "Ezra",
      "aliases": [
        "ezr"
      ]
    },
    "es": {
      "name": "Esdras",
      "abbr": "Esd",
      "aliases": [
        "esd"
      ]
    }
  },
  {
    "id": 16,
    "code": "NEH",
    "testament": "OT",
    "chapters": 13,
    "pt": {
      "name": "Neemias",
      "abbr": "Ne",
      "aliases": [
        "nee"
      ]
    },
    "en": {
      "name": "Nehemiah",
      "abbr": "Neh",
      "aliases": [
        "ne"
      ]
    },
    "es": {
      "name": "Nehemías",
      "abbr": "Neh",
      "aliases": [
        "neh",
        "nehemias"
      ]
    }
  },
  {
    "id": 17,
    "code": "EST",
    "testament": "OT",
    "chapters": 10,
    "pt": {
      "name": "Ester",
      "abbr": "Et",
      "aliases": [
        "est"
      ]
    },
    "en": {
      "name": "Esther",
      "abbr": "Esth",
      "aliases": [
        "est",
        "es"
      ]
    },
    "es": {
      "name": "Ester",
      "abbr": "Est",
      "aliases": [
        "est"
      ]
    }
  },
  {
    "id": 18,
    "code": "JOB",
    "testament": "OT",
    "chapters": 42,
    "pt": {
      "name": "Jó",
      "abbr": "Jó",
      "aliases": []
    },
    "en": {
      "name": "Job",
      "abbr": "Job",
      "aliases": [
        "jb"
      ]
    },
    "es": {
      "name": "Job",
      "abbr": "Job",
      "aliases": [
        "jb"
      ]
    }
  },
  {
    "id": 19,
    "code": "PSA",
    "testament": "OT",
    "chapters": 150,
    "pt": {
      "name": "Salmos",
      "abbr": "Sl",
      "aliases": [
        "sal",
        "salmo",
        "sl"
      ]
    },
    "en": {
      "name": "Psalms",
      "abbr": "Ps",
      "aliases": [
        "psa",
        "psalm",
        "pss"
      ]
    },
    "es": {
      "name": "Salmos",
      "abbr": "Sal",
      "aliases": [
        "sal",
        "salmo"
      ]
    }
  },
  {
    "id": 20,
    "code": "PRO",
    "testament": "OT",
    "chapters": 31,
    "pt": {
      "name": "Provérbios",
      "abbr": "Pv",
      "aliases": [
        "prov",
        "pr",
        "proverbios"
      ]
    },
    "en": {
      "name": "Proverbs",
      "abbr": "Prov",
      "aliases": [
        "pro",
        "prv"
      ]
    },
    "es": {
      "name": "Proverbios",
      "abbr": "Pr",
      "aliases": [
        "prov"
      ]
    }
  },
  {
    "id": 21,
    "code": "ECC",
    "testament": "OT",
    "chapters": 12,
    "pt": {
      "name": "Eclesiastes",
      "abbr": "Ec",
      "aliases": [
        "ecl"
      ]
    },
    "en": {
      "name": "Ecclesiastes",
      "abbr": "Eccl",
      "aliases": [
        "ecc",
        "qoh"
      ]
    },
    "es": {
      "name": "Eclesiastés",
      "abbr": "Ec",
      "aliases": [
        "ecl",
        "eclesiastes"
      ]
    }
  },
  {
    "id": 22,
    "code": "SNG",
    "testament": "OT",
    "chapters": 8,
    "pt": {
      "name": "Cânticos",
      "abbr": "Ct",
      "aliases": [
        "cantares",
        "cânticos dos cânticos",
        "canticos",
        "cant",
        "cantico dos canticos"
      ]
    },
    "en": {
      "name": "Song of Songs",
      "abbr": "Song",
      "aliases": [
        "sos",
        "song of solomon",
        "sng",
        "canticles"
      ]
    },
    "es": {
      "name": "Cantares",
      "abbr": "Cnt",
      "aliases": [
        "cant",
        "cantar de los cantares"
      ]
    }
  },
  {
    "id": 23,
    "code": "ISA",
    "testament": "OT",
    "chapters": 66,
    "pt": {
      "name": "Isaías",
      "abbr": "Is",
      "aliases": [
        "isa",
        "isaias"
      ]
    },
    "en": {
      "name": "Isaiah",
      "abbr": "Isa",
      "aliases": [
        "is"
      ]
    },
    "es": {
      "name": "Isaías",
      "abbr": "Is",
      "aliases": [
        "isa",
        "isaias"
      ]
    }
  },
  {
    "id": 24,
    "code": "JER",
    "testament": "OT",
    "chapters": 52,
    "pt": {
      "name": "Jeremias",
      "abbr": "Jr",
      "aliases": [
        "jer"
      ]
    },
    "en": {
      "name": "Jeremiah",
      "abbr": "Jer",
      "aliases": [
        "je"
      ]
    },
    "es": {
      "name": "Jeremías",
      "abbr": "Jer",
      "aliases": [
        "jer",
        "jeremias"
      ]
    }
  },
  {
    "id": 25,
    "code": "LAM",
    "testament": "OT",
    "chapters": 5,
    "pt": {
      "name": "Lamentações",
      "abbr": "Lm",
      "aliases": [
        "lam",
        "lamentacoes"
      ]
    },
    "en": {
      "name": "Lamentations",
      "abbr": "Lam",
      "aliases": [
        "la"
      ]
    },
    "es": {
      "name": "Lamentaciones",
      "abbr": "Lm",
      "aliases": [
        "lam"
      ]
    }
  },
  {
    "id": 26,
    "code": "EZK",
    "testament": "OT",
    "chapters": 48,
    "pt": {
      "name": "Ezequiel",
      "abbr": "Ez",
      "aliases": [
        "eze",
        "ezeq"
      ]
    },
    "en": {
      "name": "Ezekiel",
      "abbr": "Ezek",
      "aliases": [
        "ezk",
        "eze"
      ]
    },
    "es": {
      "name": "Ezequiel",
      "abbr": "Ez",
      "aliases": [
        "eze"
      ]
    }
  },
  {
    "id": 27,
    "code": "DAN",
    "testament": "OT",
    "chapters": 12,
    "pt": {
      "name": "Daniel",
      "abbr": "Dn",
      "aliases": [
        "dan"
      ]
    },
    "en": {
      "name": "Daniel",
      "abbr": "Dan",
      "aliases": [
        "dn",
        "da"
      ]
    },
    "es": {
      "name": "Daniel",
      "abbr": "Dn",
      "aliases": [
        "dan"
      ]
    }
  },
  {
    "id": 28,
    "code": "HOS",
    "testament": "OT",
    "chapters": 14,
    "pt": {
      "name": "Oseias",
      "abbr": "Os",
      "aliases": [
        "oséias",
        "ose"
      ]
    },
    "en": {
      "name": "Hosea",
      "abbr": "Hos",
      "aliases": [
        "ho"
      ]
    },
    "es": {
      "name": "Oseas",
      "abbr": "Os",
      "aliases": [
        "os"
      ]
    }
  },
  {
    "id": 29,
    "code": "JOL",
    "testament": "OT",
    "chapters": 3,
    "pt": {
      "name": "Joel",
      "abbr": "Jl",
      "aliases": [
        "joe"
      ]
    },
    "en": {
      "name": "Joel",
      "abbr": "Joel",
      "aliases": [
        "jl"
      ]
    },
    "es": {
      "name": "Joel",
      "abbr": "Jl",
      "aliases": [
        "joel"
      ]
    }
  },
  {
    "id": 30,
    "code": "AMO",
    "testament": "OT",
    "chapters": 9,
    "pt": {
      "name": "Amós",
      "abbr": "Am",
      "aliases": [
        "amo",
        "amos"
      ]
    },
    "en": {
      "name": "Amos",
      "abbr": "Amos",
      "aliases": [
        "am"
      ]
    },
    "es": {
      "name": "Amós",
      "abbr": "Am",
      "aliases": [
        "amos"
      ]
    }
  },
  {
    "id": 31,
    "code": "OBA",
    "testament": "OT",
    "chapters": 1,
    "pt": {
      "name": "Obadias",
      "abbr": "Ob",
      "aliases": [
        "oba",
        "abdias"
      ]
    },
    "en": {
      "name": "Obadiah",
      "abbr": "Obad",
      "aliases": [
        "ob"
      ]
    },
    "es": {
      "name": "Abdías",
      "abbr": "Abd",
      "aliases": [
        "abd",
        "abdias"
      ]
    }
  },
  {
    "id": 32,
    "code": "JON",
    "testament": "OT",
    "chapters": 4,
    "pt": {
      "name": "Jonas",
      "abbr": "Jn",
      "aliases": [
        "jon"
      ]
    },
    "en": {
      "name": "Jonah",
      "abbr": "Jonah",
      "aliases": [
        "jnh"
      ]
    },
    "es": {
      "name": "Jonás",
      "abbr": "Jon",
      "aliases": [
        "jonas"
      ]
    }
  },
  {
    "id": 33,
    "code": "MIC",
    "testament": "OT",
    "chapters": 7,
    "pt": {
      "name": "Miqueias",
      "abbr": "Mq",
      "aliases": [
        "miquéias",
        "miq"
      ]
    },
    "en": {
      "name": "Micah",
      "abbr": "Mic",
      "aliases": [
        "mi"
      ]
    },
    "es": {
      "name": "Miqueas",
      "abbr": "Mi",
      "aliases": [
        "miq"
      ]
    }
  },
  {
    "id": 34,
    "code": "NAM",
    "testament": "OT",
    "chapters": 3,
    "pt": {
      "name": "Naum",
      "abbr": "Na",
      "aliases": [
        "nau"
      ]
    },
    "en": {
      "name": "Nahum",
      "abbr": "Nah",
      "aliases": [
        "na"
      ]
    },
    "es": {
      "name": "Nahúm",
      "abbr": "Nah",
      "aliases": [
        "nah",
        "nahum"
      ]
    }
  },
  {
    "id": 35,
    "code": "HAB",
    "testament": "OT",
    "chapters": 3,
    "pt": {
      "name": "Habacuque",
      "abbr": "Hc",
      "aliases": [
        "hab"
      ]
    },
    "en": {
      "name": "Habakkuk",
      "abbr": "Hab",
      "aliases": [
        "hb"
      ]
    },
    "es": {
      "name": "Habacuc",
      "abbr": "Hab",
      "aliases": [
        "hab"
      ]
    }
  },
  {
    "id": 36,
    "code": "ZEP",
    "testament": "OT",
    "chapters": 3,
    "pt": {
      "name": "Sofonias",
      "abbr": "Sf",
      "aliases": [
        "sof"
      ]
    },
    "en": {
      "name": "Zephaniah",
      "abbr": "Zeph",
      "aliases": [
        "zep",
        "zp"
      ]
    },
    "es": {
      "name": "Sofonías",
      "abbr": "Sof",
      "aliases": [
        "sof",
        "sofonias"
      ]
    }
  },
  {
    "id": 37,
    "code": "HAG",
    "testament": "OT",
    "chapters": 2,
    "pt": {
      "name": "Ageu",
      "abbr": "Ag",
      "aliases": [
        "age"
      ]
    },
    "en": {
      "name": "Haggai",
      "abbr": "Hag",
      "aliases": [
        "hg"
      ]
    },
    "es": {
      "name": "Hageo",
      "abbr": "Hag",
      "aliases": [
        "hag"
      ]
    }
  },
  {
    "id": 38,
    "code": "ZEC",
    "testament": "OT",
    "chapters": 14,
    "pt": {
      "name": "Zacarias",
      "abbr": "Zc",
      "aliases": [
        "zac"
      ]
    },
    "en": {
      "name": "Zechariah",
      "abbr": "Zech",
      "aliases": [
        "zec",
        "zc"
      ]
    },
    "es": {
      "name": "Zacarías",
      "abbr": "Zac",
      "aliases": [
        "zac",
        "zacarias"
      ]
    }
  },
  {
    "id": 39,
    "code": "MAL",
    "testament": "OT",
    "chapters": 4,
    "pt": {
      "name": "Malaquias",
      "abbr": "Ml",
      "aliases": [
        "mal"
      ]
    },
    "en": {
      "name": "Malachi",
      "abbr": "Mal",
      "aliases": [
        "ml"
      ]
    },
    "es": {
      "name": "Malaquías",
      "abbr": "Mal",
      "aliases": [
        "mal",
        "malaquias"
      ]
    }
  },
  {
    "id": 40,
    "code": "MAT",
    "testament": "NT",
    "chapters": 28,
    "pt": {
      "name": "Mateus",
      "abbr": "Mt",
      "aliases": [
        "mat"
      ]
    },
    "en": {
      "name": "Matthew",
      "abbr": "Matt",
      "aliases": [
        "mt",
        "mat"
      ]
    },
    "es": {
      "name": "Mateo",
      "abbr": "Mt",
      "aliases": [
        "mat"
      ]
    }
  },
  {
    "id": 41,
    "code": "MRK",
    "testament": "NT",
    "chapters": 16,
    "pt": {
      "name": "Marcos",
      "abbr": "Mc",
      "aliases": [
        "mar",
        "mr"
      ]
    },
    "en": {
      "name": "Mark",
      "abbr": "Mark",
      "aliases": [
        "mk",
        "mrk"
      ]
    },
    "es": {
      "name": "Marcos",
      "abbr": "Mr",
      "aliases": [
        "mc",
        "mar"
      ]
    }
  },
  {
    "id": 42,
    "code": "LUK",
    "testament": "NT",
    "chapters": 24,
    "pt": {
      "name": "Lucas",
      "abbr": "Lc",
      "aliases": [
        "luc"
      ]
    },
    "en": {
      "name": "Luke",
      "abbr": "Luke",
      "aliases": [
        "lk",
        "luk"
      ]
    },
    "es": {
      "name": "Lucas",
      "abbr": "Lc",
      "aliases": [
        "luc"
      ]
    }
  },
  {
    "id": 43,
    "code": "JHN",
    "testament": "NT",
    "chapters": 21,
    "pt": {
      "name": "João",
      "abbr": "Jo",
      "aliases": [
        "joão",
        "joa"
      ]
    },
    "en": {
      "name": "John",
      "abbr": "John",
      "aliases": [
        "jn",
        "jhn"
      ]
    },
    "es": {
      "name": "Juan",
      "abbr": "Jn",
      "aliases": [
        "jua"
      ]
    }
  },
  {
    "id": 44,
    "code": "ACT",
    "testament": "NT",
    "chapters": 28,
    "pt": {
      "name": "Atos",
      "abbr": "At",
      "aliases": [
        "atos dos apóstolos",
        "atos dos apostolos"
      ]
    },
    "en": {
      "name": "Acts",
      "abbr": "Acts",
      "aliases": [
        "ac",
        "act"
      ]
    },
    "es": {
      "name": "Hechos",
      "abbr": "Hch",
      "aliases": [
        "hech",
        "hechos de los apóstoles"
      ]
    }
  },
  {
    "id": 45,
    "code": "ROM",
    "testament": "NT",
    "chapters": 16,
    "pt": {
      "name": "Romanos",
      "abbr": "Rm",
      "aliases": [
        "rom"
      ]
    },
    "en": {
      "name": "Romans",
      "abbr": "Rom",
      "aliases": [
        "ro",
        "rm"
      ]
    },
    "es": {
      "name": "Romanos",
      "abbr": "Ro",
      "aliases": [
        "rom",
        "rm"
      ]
    }
  },
  {
    "id": 46,
    "code": "1CO",
    "testament": "NT",
    "chapters": 16,
    "pt": {
      "name": "1 Coríntios",
      "abbr": "1Co",
      "aliases": [
        "1cor",
        "i corintios",
        "1 co"
      ]
    },
    "en": {
      "name": "1 Corinthians",
      "abbr": "1Cor",
      "aliases": [
        "1co",
        "i corinthians"
      ]
    },
    "es": {
      "name": "1 Corintios",
      "abbr": "1 Co",
      "aliases": [
        "1cor"
      ]
    }
  },
  {
    "id": 47,
    "code": "2CO",
    "testament": "NT",
    "chapters": 13,
    "pt": {
      "name": "2 Coríntios",
      "abbr": "2Co",
      "aliases": [
        "2cor",
        "ii corintios",
        "2 co"
      ]
    },
    "en": {
      "name": "2 Corinthians",
      "abbr": "2Cor",
      "aliases": [
        "2co",
        "ii corinthians"
      ]
    },
    "es": {
      "name": "2 Corintios",
      "abbr": "2 Co",
      "aliases": [
        "2cor"
      ]
    }
  },
  {
    "id": 48,
    "code": "GAL",
    "testament": "NT",
    "chapters": 6,
    "pt": {
      "name": "Gálatas",
      "abbr": "Gl",
      "aliases": [
        "gal",
        "galatas"
      ]
    },
    "en": {
      "name": "Galatians",
      "abbr": "Gal",
      "aliases": [
        "ga"
      ]
    },
    "es": {
      "name": "Gálatas",
      "abbr": "Gá",
      "aliases": [
        "gal",
        "galatas"
      ]
    }
  },
  {
    "id": 49,
    "code": "EPH",
    "testament": "NT",
    "chapters": 6,
    "pt": {
      "name": "Efésios",
      "abbr": "Ef",
      "aliases": [
        "efe",
        "efesios"
      ]
    },
    "en": {
      "name": "Ephesians",
      "abbr": "Eph",
      "aliases": [
        "ep"
      ]
    },
    "es": {
      "name": "Efesios",
      "abbr": "Ef",
      "aliases": [
        "efe"
      ]
    }
  },
  {
    "id": 50,
    "code": "PHP",
    "testament": "NT",
    "chapters": 4,
    "pt": {
      "name": "Filipenses",
      "abbr": "Fp",
      "aliases": [
        "fil",
        "flp"
      ]
    },
    "en": {
      "name": "Philippians",
      "abbr": "Phil",
      "aliases": [
        "php",
        "pp"
      ]
    },
    "es": {
      "name": "Filipenses",
      "abbr": "Fil",
      "aliases": [
        "flp"
      ]
    }
  },
  {
    "id": 51,
    "code": "COL",
    "testament": "NT",
    "chapters": 4,
    "pt": {
      "name": "Colossenses",
      "abbr": "Cl",
      "aliases": [
        "col"
      ]
    },
    "en": {
      "name": "Colossians",
      "abbr": "Col",
      "aliases": [
        "co"
      ]
    },
    "es": {
      "name": "Colosenses",
      "abbr": "Col",
      "aliases": [
        "col"
      ]
    }
  },
  {
    "id": 52,
    "code": "1TH",
    "testament": "NT",
    "chapters": 5,
    "pt": {
      "name": "1 Tessalonicenses",
      "abbr": "1Ts",
      "aliases": [
        "1tes",
        "i tessalonicenses"
      ]
    },
    "en": {
      "name": "1 Thessalonians",
      "abbr": "1Thess",
      "aliases": [
        "1th",
        "i thessalonians"
      ]
    },
    "es": {
      "name": "1 Tesalonicenses",
      "abbr": "1 Ts",
      "aliases": [
        "1tes"
      ]
    }
  },
  {
    "id": 53,
    "code": "2TH",
    "testament": "NT",
    "chapters": 3,
    "pt": {
      "name": "2 Tessalonicenses",
      "abbr": "2Ts",
      "aliases": [
        "2tes",
        "ii tessalonicenses"
      ]
    },
    "en": {
      "name": "2 Thessalonians",
      "abbr": "2Thess",
      "aliases": [
        "2th",
        "ii thessalonians"
      ]
    },
    "es": {
      "name": "2 Tesalonicenses",
      "abbr": "2 Ts",
      "aliases": [
        "2tes"
      ]
    }
  },
  {
    "id": 54,
    "code": "1TI",
    "testament": "NT",
    "chapters": 6,
    "pt": {
      "name": "1 Timóteo",
      "abbr": "1Tm",
      "aliases": [
        "1tim",
        "i timoteo"
      ]
    },
    "en": {
      "name": "1 Timothy",
      "abbr": "1Tim",
      "aliases": [
        "1ti",
        "i timothy"
      ]
    },
    "es": {
      "name": "1 Timoteo",
      "abbr": "1 Ti",
      "aliases": [
        "1tim"
      ]
    }
  },
  {
    "id": 55,
    "code": "2TI",
    "testament": "NT",
    "chapters": 4,
    "pt": {
      "name": "2 Timóteo",
      "abbr": "2Tm",
      "aliases": [
        "2tim",
        "ii timoteo"
      ]
    },
    "en": {
      "name": "2 Timothy",
      "abbr": "2Tim",
      "aliases": [
        "2ti",
        "ii timothy"
      ]
    },
    "es": {
      "name": "2 Timoteo",
      "abbr": "2 Ti",
      "aliases": [
        "2tim"
      ]
    }
  },
  {
    "id": 56,
    "code": "TIT",
    "testament": "NT",
    "chapters": 3,
    "pt": {
      "name": "Tito",
      "abbr": "Tt",
      "aliases": [
        "tit"
      ]
    },
    "en": {
      "name": "Titus",
      "abbr": "Titus",
      "aliases": [
        "ti"
      ]
    },
    "es": {
      "name": "Tito",
      "abbr": "Tit",
      "aliases": [
        "tit"
      ]
    }
  },
  {
    "id": 57,
    "code": "PHM",
    "testament": "NT",
    "chapters": 1,
    "pt": {
      "name": "Filemom",
      "abbr": "Fm",
      "aliases": [
        "filemon",
        "flm"
      ]
    },
    "en": {
      "name": "Philemon",
      "abbr": "Phlm",
      "aliases": [
        "phm",
        "pm"
      ]
    },
    "es": {
      "name": "Filemón",
      "abbr": "Flm",
      "aliases": [
        "filemon"
      ]
    }
  },
  {
    "id": 58,
    "code": "HEB",
    "testament": "NT",
    "chapters": 13,
    "pt": {
      "name": "Hebreus",
      "abbr": "Hb",
      "aliases": [
        "heb"
      ]
    },
    "en": {
      "name": "Hebrews",
      "abbr": "Heb",
      "aliases": [
        "he"
      ]
    },
    "es": {
      "name": "Hebreos",
      "abbr": "He",
      "aliases": [
        "heb"
      ]
    }
  },
  {
    "id": 59,
    "code": "JAS",
    "testament": "NT",
    "chapters": 5,
    "pt": {
      "name": "Tiago",
      "abbr": "Tg",
      "aliases": [
        "tia"
      ]
    },
    "en": {
      "name": "James",
      "abbr": "Jas",
      "aliases": [
        "jm",
        "jas"
      ]
    },
    "es": {
      "name": "Santiago",
      "abbr": "Stg",
      "aliases": [
        "sant"
      ]
    }
  },
  {
    "id": 60,
    "code": "1PE",
    "testament": "NT",
    "chapters": 5,
    "pt": {
      "name": "1 Pedro",
      "abbr": "1Pe",
      "aliases": [
        "1ped",
        "i pedro",
        "1 pe"
      ]
    },
    "en": {
      "name": "1 Peter",
      "abbr": "1Pet",
      "aliases": [
        "1pe",
        "1pt",
        "i peter"
      ]
    },
    "es": {
      "name": "1 Pedro",
      "abbr": "1 P",
      "aliases": [
        "1pe",
        "1ped"
      ]
    }
  },
  {
    "id": 61,
    "code": "2PE",
    "testament": "NT",
    "chapters": 3,
    "pt": {
      "name": "2 Pedro",
      "abbr": "2Pe",
      "aliases": [
        "2ped",
        "ii pedro",
        "2 pe"
      ]
    },
    "en": {
      "name": "2 Peter",
      "abbr": "2Pet",
      "aliases": [
        "2pe",
        "2pt",
        "ii peter"
      ]
    },
    "es": {
      "name": "2 Pedro",
      "abbr": "2 P",
      "aliases": [
        "2pe",
        "2ped"
      ]
    }
  },
  {
    "id": 62,
    "code": "1JN",
    "testament": "NT",
    "chapters": 5,
    "pt": {
      "name": "1 João",
      "abbr": "1Jo",
      "aliases": [
        "1joao",
        "i joao",
        "1 jo"
      ]
    },
    "en": {
      "name": "1 John",
      "abbr": "1John",
      "aliases": [
        "1jn",
        "1jo",
        "i john"
      ]
    },
    "es": {
      "name": "1 Juan",
      "abbr": "1 Jn",
      "aliases": [
        "1jua"
      ]
    }
  },
  {
    "id": 63,
    "code": "2JN",
    "testament": "NT",
    "chapters": 1,
    "pt": {
      "name": "2 João",
      "abbr": "2Jo",
      "aliases": [
        "2joao",
        "ii joao",
        "2 jo"
      ]
    },
    "en": {
      "name": "2 John",
      "abbr": "2John",
      "aliases": [
        "2jn",
        "2jo",
        "ii john"
      ]
    },
    "es": {
      "name": "2 Juan",
      "abbr": "2 Jn",
      "aliases": [
        "2jua"
      ]
    }
  },
  {
    "id": 64,
    "code": "3JN",
    "testament": "NT",
    "chapters": 1,
    "pt": {
      "name": "3 João",
      "abbr": "3Jo",
      "aliases": [
        "3joao",
        "iii joao",
        "3 jo"
      ]
    },
    "en": {
      "name": "3 John",
      "abbr": "3John",
      "aliases": [
        "3jn",
        "3jo",
        "iii john"
      ]
    },
    "es": {
      "name": "3 Juan",
      "abbr": "3 Jn",
      "aliases": [
        "3jua"
      ]
    }
  },
  {
    "id": 65,
    "code": "JUD",
    "testament": "NT",
    "chapters": 1,
    "pt": {
      "name": "Judas",
      "abbr": "Jd",
      "aliases": [
        "jud"
      ]
    },
    "en": {
      "name": "Jude",
      "abbr": "Jude",
      "aliases": [
        "jd",
        "jud"
      ]
    },
    "es": {
      "name": "Judas",
      "abbr": "Jud",
      "aliases": [
        "jud"
      ]
    }
  },
  {
    "id": 66,
    "code": "REV",
    "testament": "NT",
    "chapters": 22,
    "pt": {
      "name": "Apocalipse",
      "abbr": "Ap",
      "aliases": [
        "apoc",
        "apo",
        "revelação",
        "revelacao"
      ]
    },
    "en": {
      "name": "Revelation",
      "abbr": "Rev",
      "aliases": [
        "re",
        "rv",
        "apocalypse",
        "revelations"
      ]
    },
    "es": {
      "name": "Apocalipsis",
      "abbr": "Ap",
      "aliases": [
        "apoc"
      ]
    }
  }
];
