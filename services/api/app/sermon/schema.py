"""Formato do documento de uma ministração (validado na gravação).

{"blocks": [
  {"id": "...", "type": "section", "role": "intro|point|application|conclusion|appeal|other", "title": "..."},
  {"id": "...", "type": "text", "text": "Markdown simples: **negrito**, *itálico*, ==destaque==, listas"},
  {"id": "...", "type": "scripture", "reference": "João 3:16", "translation": "BLIVRE",
   "verse_key_start": 43003016, "verse_key_end": 43003016, "verses": [{"chapter": 3, "verse": 16, "text": "..."}]},
  {"id": "...", "type": "note", "text": "Lembrete pessoal (aparece no modo completo, não no esboço)"}
]}
"""

from typing import Annotated, Literal

from pydantic import BaseModel, Field, StringConstraints

Id = Annotated[str, StringConstraints(min_length=1, max_length=40)]
Kind = Literal[
    "expository", "thematic", "textual", "bible_study", "evangelistic", "devotional", "small_group"
]
Role = Literal["intro", "point", "application", "conclusion", "appeal", "other"]


class SectionBlock(BaseModel):
    id: Id
    type: Literal["section"]
    role: Role = "point"
    title: Annotated[str, StringConstraints(max_length=300)] = ""


class TextBlock(BaseModel):
    id: Id
    type: Literal["text"]
    text: Annotated[str, StringConstraints(max_length=50_000)] = ""


class Verse(BaseModel):
    chapter: int
    verse: int
    text: Annotated[str, StringConstraints(max_length=2_000)]


class ScriptureBlock(BaseModel):
    id: Id
    type: Literal["scripture"]
    reference: Annotated[str, StringConstraints(max_length=120)]
    translation: Annotated[str, StringConstraints(max_length=20)]
    verse_key_start: int
    verse_key_end: int
    verses: Annotated[list[Verse], Field(max_length=200)]


class NoteBlock(BaseModel):
    id: Id
    type: Literal["note"]
    text: Annotated[str, StringConstraints(max_length=10_000)] = ""


Block = Annotated[SectionBlock | TextBlock | ScriptureBlock | NoteBlock, Field(discriminator="type")]


class Content(BaseModel):
    blocks: Annotated[list[Block], Field(max_length=500)] = []
