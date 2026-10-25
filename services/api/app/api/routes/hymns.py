"""Harpa Cristã (hinário das Assembleias de Deus): lista, busca e letra de cada hino."""

from fastapi import APIRouter, Query, Response

from app.core.errors import AppError
from app.hymns import service

router = APIRouter(prefix="/hymns", tags=["hymns"])
CACHE = {"Cache-Control": "public, max-age=86400"}


@router.get("")
async def list_hymns(response: Response, q: str = Query("", max_length=100)) -> dict:
    response.headers.update(CACHE)
    items = service.search(q) if q.strip() else [service.summary(h) for h in service.hymns()]
    return {"total": len(service.hymns()), "hymns": items}


@router.get("/{n}")
async def get_hymn(n: int, response: Response) -> dict:
    hymn = service.get(n)
    if hymn is None:
        raise AppError(404, "hymn_not_found", "Hymn not found")
    response.headers.update(CACHE)
    return {**hymn, "prev": n - 1 if n > 1 else None, "next": n + 1 if n < len(service.hymns()) else None}
