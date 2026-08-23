"""Cliente mínimo de Supabase: PostgREST + Auth, por HTTP.

No usamos `supabase-py`: su import se cuelga en este entorno. httpx con
timeout de 10 s. Si no hay credenciales, las funciones no-op y el resto
sigue en disco.
"""

from __future__ import annotations

import logging
import os

import httpx

log = logging.getLogger("api")

TIMEOUT = 10.0
_aviso = False


def _url() -> str:
    return (os.getenv("SUPABASE_URL") or "").rstrip("/")


def hay_bd() -> bool:
    if os.getenv("BUSFACTOR_SIN_BD", "0") == "1":
        return False
    return bool(_url() and os.getenv("SUPABASE_SERVICE_ROLE_KEY"))


def _clave_servicio() -> str:
    return os.environ["SUPABASE_SERVICE_ROLE_KEY"]


def _headers(clave: str) -> dict:
    return {
        "apikey": clave,
        "Authorization": f"Bearer {clave}",
        "Content-Type": "application/json",
        "Prefer": "return=representation",
    }


def rest(metodo: str, tabla: str, *, params: dict | None = None, json=None, extra_headers: dict | None = None) -> list | dict:
    if not hay_bd():
        raise RuntimeError("sin supabase")
    cab = _headers(_clave_servicio())
    if extra_headers:
        cab.update(extra_headers)
    r = httpx.request(
        metodo,
        f"{_url()}/rest/v1/{tabla}",
        headers=cab,
        params=params,
        json=json,
        timeout=TIMEOUT,
    )
    r.raise_for_status()
    if not r.content:
        return []
    return r.json()


def auth_admin(metodo: str, ruta: str, json=None) -> dict:
    r = httpx.request(
        metodo,
        f"{_url()}/auth/v1{ruta}",
        headers=_headers(_clave_servicio()),
        json=json,
        timeout=TIMEOUT,
    )
    r.raise_for_status()
    return r.json() if r.content else {}


def auth_publico(metodo: str, ruta: str, json=None, token: str | None = None, params: dict | None = None) -> dict:
    clave = os.getenv("SUPABASE_ANON_KEY") or _clave_servicio()
    cab = _headers(clave)
    if token:
        cab["Authorization"] = f"Bearer {token}"
    r = httpx.request(
        metodo,
        f"{_url()}/auth/v1{ruta}",
        headers=cab,
        json=json,
        params=params,
        timeout=TIMEOUT,
    )
    r.raise_for_status()
    return r.json() if r.content else {}


def upsert(tabla: str, filas, conflicto: str) -> list | dict:
    """POST + merge-duplicates. `conflicto` es la columna unique/pk (email, id, …)."""
    return rest(
        "POST",
        tabla,
        json=filas,
        params={"on_conflict": conflicto},
        extra_headers={"Prefer": "resolution=merge-duplicates,return=minimal"},
    )


def aviso_si_falta() -> None:
    global _aviso
    if not hay_bd() and not _aviso:
        log.info("sin SUPABASE_*: persistencia en disco, auth desactivada")
        _aviso = True
