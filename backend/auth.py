"""Login con Google y el usuario del token.

Auth es de Supabase; `public.users` es nuestra fila de oficina (nombre, rol,
avatar). El front nunca habla con Supabase: solo con estas rutas.

Terminado el hackathon la API dejó de ser pública: solo entra quien viene de
Google con un correo del dominio, y `guardia` lo exige en TODA ruta que no esté
en `RUTAS_PUBLICAS`. Ese es el único punto de corte; no hay endpoint que se
proteja por su cuenta.
"""

from __future__ import annotations

import logging
import os
from urllib.parse import quote

import httpx
from fastapi import Header, HTTPException, Request

from . import bd
from .personas import PERSONAS, nombre_de

log = logging.getLogger("api")

# Quién puede entrar. Configurable por si se abre a otro dominio, pero el
# default es el que importa: nadie de fuera de la casa.
DOMINIO = (os.getenv("DOMINIO_PERMITIDO") or "inerxia.co").lower().lstrip("@")

# Lo único que se sirve sin token:
#   - `/salud` y los docs no tienen datos del equipo.
#   - `/auth/google` es la puerta: pedirle token sería un círculo.
#   - el callback de Slack llega desde Slack, sin Bearer; su `state` va firmado
#     con HMAC y eso es lo que prueba de quién es el flujo.
RUTAS_PUBLICAS = frozenset(
    {"/salud", "/docs", "/redoc", "/openapi.json", "/auth/google", "/conexiones/slack/callback"}
)


def frontend_base() -> str:
    """La URL del front, con esquema.

    Render inyecta `fromService: property: host` sin esquema, y una redirección
    a `host/entrar` sería relativa: el usuario aterrizaría en la API.
    """
    base = os.getenv("FRONTEND_URL", "http://localhost:5173").rstrip("/")
    if not base.startswith(("http://", "https://")):
        base = f"https://{base}"
    return base


def url_login_google() -> str:
    """A dónde mandar el navegador para entrar.

    Supabase hace todo el OAuth y devuelve al front con el token en el
    fragmento (`#access_token=…`). El dominio NO se valida aquí: el `hd` de
    Google es una sugerencia que el usuario puede ignorar. Se valida en
    `usuario_del_token`, contra el email que Supabase confirma.
    """
    base = (os.getenv("SUPABASE_URL") or "").rstrip("/")
    if not base:
        raise HTTPException(503, "Auth no configurada: falta SUPABASE_URL.")
    destino = quote(f"{frontend_base()}/entrar", safe="")
    return f"{base}/auth/v1/authorize?provider=google&redirect_to={destino}&hd={DOMINIO}"


def _fila_usuario(email: str, extra: dict | None = None) -> dict:
    persona = {**PERSONAS.get(email, {}), **(extra or {})}
    return {
        "email": email,
        "nombre": persona.get("nombre") or nombre_de(email),
        "rol": persona.get("rol", "Equipo"),
        "sprite": persona.get("sprite", "lpc-00"),
        "avatar_config": persona.get("avatar_config") or {},
        "office_id": "of-demo",
    }


def _upsert_usuario(fila: dict) -> None:
    bd.upsert("users", fila, "email")


def usuario_del_token(authorization: str | None = Header(None)) -> dict:
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(401, "Falta Authorization: Bearer <token>.")
    token = authorization.split(" ", 1)[1].strip()
    if not bd.hay_bd():
        raise HTTPException(503, "Auth no configurada.")
    try:
        user = bd.auth_publico("GET", "/user", token=token)
    except httpx.HTTPStatusError as e:
        raise HTTPException(401, "Token inválido o vencido.") from e
    email = user.get("email")
    if not email:
        raise HTTPException(401, "El token no trae email.")
    if not email.lower().endswith(f"@{DOMINIO}"):
        raise HTTPException(403, f"Esta instancia es solo para cuentas @{DOMINIO}.")
    return {"id": user.get("id"), "email": email}


def guardia(request: Request, authorization: str | None = Header(None)) -> None:
    """Dependencia global de la app: sin token del dominio no se sirve nada.

    Va en el constructor de FastAPI y no endpoint por endpoint a propósito: así
    una ruta nueva nace cerrada, y abrirla exige nombrarla en `RUTAS_PUBLICAS`.
    """
    if request.url.path in RUTAS_PUBLICAS:
        return
    usuario_del_token(authorization)


def guardar_avatar(email: str, avatar_config: dict) -> dict:
    """El formato lo define P4; nosotros solo lo guardamos."""
    persona = PERSONAS.setdefault(
        email, {"nombre": nombre_de(email), "rol": "Equipo", "sprite": "lpc-00", "avatar_config": {}}
    )
    persona["avatar_config"] = avatar_config
    if bd.hay_bd():
        try:
            _upsert_usuario({**_fila_usuario(email), "avatar_config": avatar_config})
        except Exception as e:
            log.warning("no se pudo persistir avatar de %s: %s", email, e)
    return {"ok": True, "email": email, "avatar_config": avatar_config}


def marcar_conexion(email: str, tipo: str) -> dict:
    if tipo not in ("slack", "drive"):
        raise HTTPException(422, "tipo debe ser slack o drive")
    user_id = None
    if bd.hay_bd():
        try:
            filas = bd.rest("GET", "users", params={"email": f"eq.{email}", "select": "id"})
            if filas:
                user_id = filas[0]["id"]
                # upsert y no insert: `connections` es única por (user_id, tipo)
                # desde que guarda tokens, y repetir la llamada no puede reventar.
                # El payload no menciona `access_token`, así que un merge no
                # pisa el token de una conexión real de Slack.
                bd.upsert("connections", {"user_id": user_id, "tipo": tipo, "estado": "activa"}, "user_id,tipo")
        except Exception as e:
            log.warning("conexion simulada no persistió: %s", e)
    persona = PERSONAS.get(email)
    return {
        "tipo": tipo,
        "estado": "activa",
        "email": email,
        "user_id": user_id,
        "nombre": (persona or {}).get("nombre") or nombre_de(email),
        "nota": "Marca de estado, sin token. Para Slack de verdad: GET /conexiones/slack/iniciar.",
    }
