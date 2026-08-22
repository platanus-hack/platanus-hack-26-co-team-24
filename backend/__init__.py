"""P3 — API de Bus Factor HQ.

`cerebro` resuelve `data/raw` y su directorio de caché contra el CWD. El PR #2 lo
arregla pero sigue abierto, así que aquí no dependemos de desde dónde se lance
uvicorn: la caché se fija por variable de entorno antes de que `cerebro.llm` la
lea al importarse, y las rutas de datos se pasan explícitas en cada llamada.

Este `__init__` corre antes que cualquier submódulo del paquete, que es la única
garantía de orden que necesitamos.
"""

import os
from pathlib import Path

RAIZ = Path(__file__).resolve().parent.parent

os.environ.setdefault("CEREBRO_CACHE_DIR", str(RAIZ / ".cache_cerebro"))

DIR_EVENTOS = RAIZ / "data" / "raw"
ARCHIVO_ESTADO = RAIZ / "data" / "estado.json"

# Botón de pánico del demo: fuerza mock en todos los endpoints sin tocar la URL.
FORZAR_MOCK = os.getenv("BUSFACTOR_MOCK", "0") == "1"
