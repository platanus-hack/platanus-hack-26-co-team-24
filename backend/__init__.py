"""P3 — API de Bus Factor HQ.

Este `__init__` corre antes que cualquier submódulo: carga el `.env` y fija la
caché de P2. El PR #2 ya resolvió las rutas de `cerebro` contra la raíz del repo;
el parche de abajo es redundante y se queda como cinturón por si alguien corre
una copia vieja del módulo.
"""

from pathlib import Path

RAIZ = Path(__file__).resolve().parent.parent

try:
    from dotenv import load_dotenv

    load_dotenv(RAIZ / ".env")
except ImportError:
    pass

import os

os.environ.setdefault("CEREBRO_CACHE_DIR", str(RAIZ / ".cache_cerebro"))

DIR_EVENTOS = RAIZ / "data" / "raw"
ARCHIVO_ESTADO = RAIZ / "data" / "estado.json"

from cerebro import nucleo as _nucleo  # noqa: E402

_nucleo.DIR_EVENTOS = DIR_EVENTOS
_nucleo.FIXTURE_P2 = DIR_EVENTOS / "fixture_p2.json"

# Botón de pánico del demo: fuerza mock en todos los endpoints sin tocar la URL.
FORZAR_MOCK = os.getenv("BUSFACTOR_MOCK", "0") == "1"
