"""Importação em lote de todo o catálogo redistribuível do eBible.org (mais de mil idiomas).

    python -m app.bible.bulk                 # importa tudo o que ainda não está no banco
    python -m app.bible.bulk --update        # também reimporta as que o eBible.org atualizou
    python -m app.bible.bulk --limit 20      # só as 20 primeiras (teste)
    python -m app.bible.bulk --dry-run       # baixa e confere os arquivos, sem gravar

Também roda pelo painel (Bíblias → Importar todo o catálogo). Uma tradução por vez, com uma
pausa entre os downloads, para não sobrecarregar o eBible.org. Se o processo parar, rodar de
novo continua de onde parou (as já importadas são puladas). O texto bíblico vem sempre do
arquivo publicado: nada é traduzido ou alterado.
"""

import argparse
import asyncio
import io
import json
import logging
import zipfile
from datetime import UTC, datetime, timedelta

from sqlalchemy import select

from app.bible import ebible
from app.bible.importer import DATA_DIR, ImportError_
from app.db.session import dispose_engine, get_sessionmaker
from app.models import BibleTranslation
from app.services.settings import get_setting, set_setting

log = logging.getLogger(__name__)

STATUS_KEY = "bible.bulk"
PAUSE_SECONDS = 1.0
_task: asyncio.Task | None = None


def _vendored_ids() -> set[str]:
    """Traduções que já vêm com o servidor (BLIVRE, WEB, RV1909)."""
    ids = set()
    for manifest in DATA_DIR.glob("*/manifest.json"):
        eid = json.loads(manifest.read_text(encoding="utf-8")).get("notes", {}).get("ebible_id")
        if eid:
            ids.add(eid)
    return ids


def _order(items: list[dict]) -> list[dict]:
    # Primeiro as Bíblias completas, depois as que têm mais livros; domínio público na frente
    return sorted(items, key=lambda x: (-(x["ot_books"] + x["nt_books"]), not x["public_domain"], x["id"]))


async def _save_status(status: dict) -> None:
    async with get_sessionmaker()() as db:
        await set_setting(db, STATUS_KEY, status)
        await db.commit()


async def get_status() -> dict:
    async with get_sessionmaker()() as db:
        return await get_setting(db, STATUS_KEY)


async def run(*, update: bool = False, limit: int | None = None, dry_run: bool = False) -> dict:
    catalog = _order(await ebible.catalog(refresh=True))
    async with get_sessionmaker()() as db:
        rows = (await db.scalars(select(BibleTranslation))).all()
    have = {(r.notes or {}).get("ebible_id"): (r.notes or {}).get("ebible_updated") for r in rows}
    code_of = {(r.notes or {}).get("ebible_id"): r.code for r in rows}
    vendored = _vendored_ids()
    have.update(dict.fromkeys(vendored - set(have)))
    codes = {r.code for r in rows}

    # As que vêm com o servidor não são reimportadas daqui (têm hash conferido no manifesto)
    todo = [
        x
        for x in catalog
        if x["id"] not in vendored
        and (x["id"] not in have or (update and have[x["id"]] not in (None, x["updated"])))
    ]
    if limit:
        todo = todo[:limit]
    status = {
        "running": True,
        "started_at": datetime.now(UTC).isoformat(),
        "finished_at": None,
        "total": len(todo),
        "done": 0,
        "imported": 0,
        "failed": [],
        "current": None,
        "dry_run": dry_run,
    }
    await _save_status(status)

    for item in todo:
        status["current"] = item["id"]
        try:
            if dry_run:
                raw = await ebible._get(ebible.ZIP_URL.format(id=item["id"]))
                archive = zipfile.ZipFile(io.BytesIO(raw))
                name = next(n for n in archive.namelist() if n.endswith("_vpl.txt"))
                ebible.parse_vpl(archive.read(name))
            else:
                replace = item["id"] in code_of
                code = code_of.get(item["id"]) or ebible.clean_code(item["id"])
                n = 2
                # Código já usado por outra tradução (ex.: ids que só diferem em maiúsculas)
                while not replace and code in codes:
                    code = ebible.clean_code(f"{item['id'][:17]}{n}")
                    n += 1
                async with get_sessionmaker()() as db:
                    t = await ebible.import_from_ebible(db, item["id"], code=code, replace=replace)
                codes.add(t.code)
            status["imported"] += 1
        except (ImportError_, StopIteration, zipfile.BadZipFile) as e:
            status["failed"].append({"id": item["id"], "error": str(e)[:200]})
        except Exception as e:  # rede, banco: registra e segue para a próxima
            log.exception("Falha ao importar %s", item["id"])
            status["failed"].append({"id": item["id"], "error": f"{type(e).__name__}: {str(e)[:180]}"})
        status["done"] += 1
        if status["done"] % 5 == 0 or status["done"] == len(todo):
            await _save_status(status)
        await asyncio.sleep(PAUSE_SECONDS)

    status.update(running=False, current=None, finished_at=datetime.now(UTC).isoformat())
    await _save_status(status)
    return status


AUTO_LOCK = 734_120_001  # trava do PostgreSQL: só um processo da API importa por vez
AUTO_EVERY = timedelta(days=7)


async def auto_loop() -> None:
    """Produção: ao subir, importa todo o catálogo sozinho; depois confere atualizações por semana.

    Com vários processos da API, só o que pegar a trava do banco faz o trabalho."""
    from sqlalchemy import text

    from app.db.session import get_engine

    await asyncio.sleep(30)  # deixa a API subir primeiro
    async with get_engine().connect() as conn:
        if not await conn.scalar(text("SELECT pg_try_advisory_lock(:k)"), {"k": AUTO_LOCK}):
            return
        while True:
            try:
                # Hebraico, grego, léxico e referências cruzadas (uma vez, alguns minutos)
                from app.bible import original

                await original.ensure_imported()
            except Exception:
                log.exception("Importação dos originais falhou; nova tentativa mais tarde")
            try:
                status = await get_status()
                finished = status.get("finished_at")
                last = datetime.fromisoformat(finished) if finished else None
                never_completed = (
                    not finished or status.get("dry_run") or status.get("done", 0) < status.get("total", 0)
                )
                if never_completed or datetime.now(UTC) - last >= AUTO_EVERY:
                    log.info("Importação automática do catálogo do eBible.org: começando")
                    await run(update=not never_completed)
            except Exception:  # catálogo fora do ar etc.: tenta de novo mais tarde
                log.exception("Importação automática falhou; nova tentativa em 6 horas")
            await asyncio.sleep(6 * 3600)


def start_background(**kwargs) -> bool:
    """Inicia no processo atual da API (botão do painel). False se já estiver rodando aqui."""
    global _task
    if _task and not _task.done():
        return False
    _task = asyncio.create_task(run(**kwargs))
    return True


def running_here() -> bool:
    return bool(_task and not _task.done())


async def _main(args: argparse.Namespace) -> None:
    try:
        status = await run(update=args.update, limit=args.limit, dry_run=args.dry_run)
        print(f"{status['imported']} de {status['total']} importadas; {len(status['failed'])} falharam")
        for f in status["failed"]:
            print(f"  {f['id']}: {f['error']}")
    finally:
        await dispose_engine()


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--update", action="store_true")
    parser.add_argument("--limit", type=int)
    parser.add_argument("--dry-run", action="store_true")
    logging.basicConfig(level=logging.INFO)
    asyncio.run(_main(parser.parse_args()))


if __name__ == "__main__":
    main()
