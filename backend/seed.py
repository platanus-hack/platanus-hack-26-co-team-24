"""Borra y repuebla la oficina demo. Se corre veinte veces entre ensayos.

    python -m backend.seed
"""

from __future__ import annotations

import logging

from . import bd
from . import estado as st
from .personas import PERSONAS

log = logging.getLogger("api")


def sembrar_usuarios() -> int:
    """Los 9 de la historia, con su avatar por defecto. Idempotente."""
    if not bd.hay_bd():
        return 0
    filas = [
        {
            "email": email,
            "nombre": p["nombre"],
            "rol": p["rol"],
            "sprite": p["sprite"],
            "avatar_config": p["avatar_config"],
            "office_id": "of-demo",
        }
        for email, p in PERSONAS.items()
    ]
    bd.upsert("users", filas, "email")
    return len(filas)


def sembrar() -> dict:
    """Estado demo perfecto: 9 usuarios + cadena de P2 persistida."""
    n = sembrar_usuarios()
    procesado = st.procesar()
    return {"usuarios": n, **procesado}


def main() -> int:
    logging.basicConfig(level=logging.INFO, format="%(message)s")
    if not bd.hay_bd():
        print("sin SUPABASE_*: no hay a dónde sembrar. Revisa el .env")
        return 1
    print(sembrar())
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
