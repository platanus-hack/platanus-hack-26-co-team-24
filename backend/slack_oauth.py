"""OAuth de Slack: que cada usuario conecte su propio workspace.

Por qué un `state` firmado y no una tabla de states pendientes: el callback lo
abre el navegador del usuario desde Slack, sin `Authorization`, así que el
`state` tiene que probar dos cosas a la vez — que el flujo lo empezamos
nosotros (CSRF) y de quién es la sesión. Un HMAC sobre `email|epoch` hace las
dos sin una tabla que después haya que limpiar.

El token que devuelve Slack se guarda en `connections.access_token` y **no sale
nunca de este módulo**: ninguna función pública lo retorna y ningún log lo
imprime. Lo que sí es consultable es el estado de la conexión.
"""

from __future__ import annotations

import base64
import hashlib
import hmac
import logging
import os
import time
from datetime import datetime, timezone
from urllib.parse import urlencode

import httpx
from fastapi import HTTPException

from . import bd
from .personas import OFICINA

log = logging.getLogger("api")

AUTORIZAR = "https://slack.com/oauth/v2/authorize"
CANJEAR = "https://slack.com/api/oauth.v2.access"

# Lo mínimo para leer canales públicos y resolver emails. Pedir más scopes de
# los que el conector usa es hacer que el usuario apruebe permisos muertos.
SCOPES = "channels:history,channels:read,users:read,users:read.email"

VIGENCIA_STATE = 600  # 10 min: lo que tarda una persona en aprobar la app


def credenciales() -> tuple[str, str, str]:
    """Las tres variables de la app de Slack, o un 503 que dice cuál falta.

    Sin esto el endpoint reventaría con un KeyError adentro de httpx y el
    frontend vería un 500 sin pista de qué configurar.
    """
    valores = {
        "SLACK_CLIENT_ID": os.getenv("SLACK_CLIENT_ID", ""),
        "SLACK_CLIENT_SECRET": os.getenv("SLACK_CLIENT_SECRET", ""),
        "SLACK_REDIRECT_URI": os.getenv("SLACK_REDIRECT_URI", ""),
    }
    faltantes = [nombre for nombre, valor in valores.items() if not valor]
    if faltantes:
        raise HTTPException(
            503,
            "OAuth de Slack sin configurar: falta " + ", ".join(faltantes)
            + ". Ver backend/README.md → 'Conectar Slack'.",
        )
    return valores["SLACK_CLIENT_ID"], valores["SLACK_CLIENT_SECRET"], valores["SLACK_REDIRECT_URI"]


# --- state firmado ---------------------------------------------------------------


def _b64(crudo: bytes) -> str:
    return base64.urlsafe_b64encode(crudo).decode().rstrip("=")


def _desb64(texto: str) -> bytes:
    return base64.urlsafe_b64decode(texto + "=" * (-len(texto) % 4))


def _firma(cuerpo: str, secreto: str) -> str:
    return _b64(hmac.new(secreto.encode(), cuerpo.encode(), hashlib.sha256).digest())


def firmar_state(email: str) -> str:
    """El secreto de firma es el client secret de Slack: ya es un secreto del
    servidor y rota junto con la app, así que no añade una variable más que
    alguien pueda olvidar en Render."""
    _, secreto, _ = credenciales()
    cuerpo = _b64(f"{email}|{int(time.time())}".encode())
    return f"{cuerpo}.{_firma(cuerpo, secreto)}"


def email_del_state(state: str) -> str:
    """Devuelve de quién es el flujo, o 400 si el state no es nuestro o venció."""
    _, secreto, _ = credenciales()
    cuerpo, _, firma = (state or "").partition(".")
    if not cuerpo or not firma or not hmac.compare_digest(firma, _firma(cuerpo, secreto)):
        raise HTTPException(400, "state inválido: no lo emitimos nosotros.")
    try:
        email, _, emitido = _desb64(cuerpo).decode().rpartition("|")
        edad = time.time() - int(emitido)
    except (ValueError, UnicodeDecodeError) as e:
        raise HTTPException(400, "state ilegible.") from e
    if edad > VIGENCIA_STATE or edad < -60:
        raise HTTPException(400, "state vencido: vuelve a empezar la conexión.")
    if not email:
        raise HTTPException(400, "state sin usuario.")
    return email


def url_de_autorizacion(email: str) -> str:
    cliente, _, redirect = credenciales()
    params = {
        "client_id": cliente,
        "scope": SCOPES,
        "redirect_uri": redirect,
        "state": firmar_state(email),
    }
    return f"{AUTORIZAR}?{urlencode(params)}"


# --- canje y persistencia --------------------------------------------------------


def canjear_codigo(code: str) -> dict:
    """`oauth.v2.access`. Devuelve el crudo de Slack; el caller no lo publica."""
    cliente, secreto, redirect = credenciales()
    try:
        r = httpx.post(
            CANJEAR,
            data={"client_id": cliente, "client_secret": secreto, "code": code, "redirect_uri": redirect},
            timeout=bd.TIMEOUT,
        )
        r.raise_for_status()
        datos = r.json()
    except httpx.HTTPError as e:
        raise HTTPException(502, f"Slack no respondió al canje: {type(e).__name__}") from e
    if not datos.get("ok"):
        # `datos` trae el error de Slack pero también podría traer el token en
        # un flujo parcial: se propaga solo el código de error.
        raise HTTPException(400, f"Slack rechazó el código: {datos.get('error', 'desconocido')}")
    return datos


def _fila_usuario(email: str) -> dict:
    """id y oficina del usuario. Sin fila en `public.users` no hay dónde colgar
    la conexión, y decirlo claro ahorra depurar un upsert que falla por FK."""
    if not bd.hay_bd():
        raise HTTPException(503, "Sin credenciales de Supabase: no hay dónde guardar la conexión.")
    filas = bd.rest("GET", "users", params={"email": f"eq.{email}", "select": "id,office_id"})
    if not filas:
        raise HTTPException(404, f"{email} no tiene fila de usuario. Regístrate antes de conectar Slack.")
    return filas[0]


def guardar_conexion(email: str, respuesta_slack: dict) -> dict:
    """Guarda el token contra el usuario y devuelve **solo** metadatos."""
    fila = _fila_usuario(email)
    equipo = respuesta_slack.get("team") or {}
    bd.upsert(
        "connections",
        {
            "user_id": fila["id"],
            "tipo": "slack",
            "estado": "activa",
            "access_token": respuesta_slack.get("access_token"),
            "team_id": equipo.get("id"),
            "team_nombre": equipo.get("name"),
            "scopes": respuesta_slack.get("scope"),
            "actualizado_en": datetime.now(timezone.utc).isoformat(),
        },
        "user_id,tipo",
    )
    log.info("slack conectado para %s (team %s)", email, equipo.get("id"))
    return {"tipo": "slack", "estado": "activa", "email": email, "team_id": equipo.get("id"), "team_nombre": equipo.get("name")}


def _token_de(email: str) -> str:
    """El único lector del token. Privado a propósito: nada fuera de este
    módulo debería tener una referencia a la credencial."""
    fila = _fila_usuario(email)
    filas = bd.rest(
        "GET",
        "connections",
        params={"user_id": f"eq.{fila['id']}", "tipo": "eq.slack", "select": "access_token"},
    )
    token = (filas[0] if filas else {}).get("access_token")
    if not token:
        raise HTTPException(409, "Slack no está conectado para este usuario. Empieza por /conexiones/slack/iniciar.")
    return token


def estado_de(email: str) -> dict | None:
    """Lo que sí se puede consultar: si hay conexión y contra qué workspace.

    `None` cuando no hay ninguna. Devolver una fila con `estado: "sin conexión"`
    sería peor que no devolver nada: el frontend lista lo que le llega como
    fuente conectada, y diría que Slack está listo cuando no lo está.
    """
    if not bd.hay_bd() or not email:
        return None
    try:
        fila = _fila_usuario(email)
    except HTTPException:
        return None
    filas = bd.rest(
        "GET",
        "connections",
        params={"user_id": f"eq.{fila['id']}", "tipo": "eq.slack", "select": "estado,team_id,team_nombre,scopes,actualizado_en"},
    )
    if not filas:
        return None
    conexion = filas[0]
    return {
        "tipo": "slack",
        "estado": conexion.get("estado") or "activa",
        "team_id": conexion.get("team_id"),
        "team_nombre": conexion.get("team_nombre"),
        "scopes": conexion.get("scopes"),
        "actualizado_en": conexion.get("actualizado_en"),
    }


# --- sincronización --------------------------------------------------------------


def descargar_eventos(email: str, desde: str | None = None) -> list[dict]:
    """Corre el conector de P1 con el token del usuario y devuelve RawEvent crudos.

    El cliente HTTP y el conector son los mismos que usa `python -m ingestion
    slack`; aquí solo cambia de dónde sale el token.
    """
    from ingestion.http import HttpClient
    from ingestion.slack import fetch_slack_events

    cliente = HttpClient("https://slack.com/api", _token_de(email), min_interval=1.0)
    try:
        # ponytail: síncrono dentro del request. Un workspace grande puede pasarse
        # del timeout del proxy; si eso pasa, mover a un job en background.
        eventos = fetch_slack_events(lambda metodo, **params: cliente.get(f"/{metodo}", **params), since=desde)
    except RuntimeError as e:
        # `e` viene del conector y nunca incluye el token (va en el header).
        raise HTTPException(502, f"Slack falló durante la sincronización: {e}") from e
    return [evento.to_dict() for evento in eventos]


def oficina_de(email: str) -> str:
    """La oficina a la que pertenecen los eventos de este usuario."""
    try:
        return _fila_usuario(email).get("office_id") or OFICINA["id"]
    except HTTPException:
        return OFICINA["id"]
