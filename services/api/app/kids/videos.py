"""BibleAlpha Kids: vídeos enviados pelo administrador.

O painel manda o arquivo em pedaços de 4 MB (cada envio cabe no limite do site e da API); o
servidor junta e confere o tamanho. Para tocar, responde por partes ("Range"), como o Safari
do iPhone exige, lendo do banco só os pedaços daquela parte.
"""

import re
from collections.abc import AsyncIterator

from fastapi import Request
from fastapi.responses import Response, StreamingResponse
from sqlalchemy import func, select

from app.core.errors import AppError
from app.models import KidsVideo, KidsVideoChunk

CHUNK_SIZE = 4 * 1024 * 1024
MAX_SIZE = 600 * 1024 * 1024
VIDEO_TYPES = {"video/mp4", "video/webm", "video/quicktime"}
POSTER_TYPES = {"image/jpeg", "image/png", "image/webp"}
MAX_POSTER = 4 * 1024 * 1024

_RANGE = re.compile(r"bytes=(\d*)-(\d*)$")


def chunk_count(video: KidsVideo) -> int:
    return -(-video.size // video.chunk_size)


async def received(db, video: KidsVideo) -> tuple[int, int]:
    """(pedaços recebidos, bytes recebidos)."""
    n, total = (
        await db.execute(
            select(func.count(), func.coalesce(func.sum(func.length(KidsVideoChunk.data)), 0)).where(
                KidsVideoChunk.video_id == video.id
            )
        )
    ).one()
    return int(n), int(total)


def _parse_range(header: str | None, size: int) -> tuple[int, int] | None:
    if not header:
        return None
    m = _RANGE.match(header.strip())
    if not m or (not m.group(1) and not m.group(2)):
        raise AppError(416, "range_not_satisfiable", "Invalid range")
    if m.group(1):
        start = int(m.group(1))
        end = int(m.group(2)) if m.group(2) else size - 1
    else:  # últimos N bytes
        start, end = max(0, size - int(m.group(2))), size - 1
    end = min(end, size - 1)
    if start > end or start >= size:
        raise AppError(416, "range_not_satisfiable", "Invalid range")
    return start, end


def stream(request: Request, video: KidsVideo) -> Response:
    """Arquivo inteiro ou só a parte pedida, lendo os pedaços sob demanda."""
    size, chunk = video.size, video.chunk_size
    byte_range = _parse_range(request.headers.get("range"), size)
    start, end = byte_range or (0, size - 1)
    video_id = video.id

    async def body() -> AsyncIterator[bytes]:
        from app.db.session import get_sessionmaker

        first, last = start // chunk, end // chunk
        async with get_sessionmaker()() as db:
            for n in range(first, last + 1):
                data = await db.scalar(
                    select(KidsVideoChunk.data).where(
                        KidsVideoChunk.video_id == video_id, KidsVideoChunk.n == n
                    )
                )
                if data is None:
                    return
                lo = start - n * chunk if n == first else 0
                hi = end - n * chunk + 1 if n == last else len(data)
                yield data[lo:hi]

    headers = {
        "Accept-Ranges": "bytes",
        "Content-Length": str(end - start + 1),
        "Cache-Control": "public, max-age=86400",
        "ETag": f'"{video_id}-{size}"',
    }
    if byte_range:
        headers["Content-Range"] = f"bytes {start}-{end}/{size}"
    return StreamingResponse(
        body(), status_code=206 if byte_range else 200, media_type=video.mime, headers=headers
    )
