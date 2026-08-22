"""Registro, login y el usuario del token.

Auth es de Supabase; `public.users` es nuestra fila de oficina (nombre, rol,
avatar). El front nunca habla con Supabase: solo con estas rutas.
"""

from __future__ import annotations

import logging

import httpx
from fastapi import Header, HTTPException

from . import bd
from .personas import PERSONAS, nombre_de

log = logging.getLogger("api")


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


def registrar(email: str, password: str, nombre: str) -> dict:
    if not bd.hay_bd():
        raise HTTPException(503, "Auth no configurada: faltan las credenciales de Supabase.")
    try:
        creado = bd.auth_admin(
            "POST",
            "/admin/users",
            json={"email": email, "password": password, "email_confirm": True},
        )
    except httpx.HTTPStatusError as e:
        cuerpo = e.response.text.lower()
        if e.response.status_code in (422, 400) and ("already" in cuerpo or "registered" in cuerpo or "exists" in cuerpo):
            raise HTTPException(409, f"{email} ya tiene cuenta.") from e
        raise HTTPException(400, f"No se pudo registrar: {e.response.text}") from e

    uid = creado.get("id")
    fila = _fila_usuario(email, {"nombre": nombre})
    try:
        _upsert_usuario(fila)
    except Exception as e:
        log.warning("usuario auth creado, fila public.users falló: %s", e)
    PERSONAS.setdefault(email, {})
    PERSONAS[email].update(
        {"nombre": nombre, "rol": fila["rol"], "sprite": fila["sprite"], "avatar_config": fila["avatar_config"]}
    )
    return entrar(email, password)


def entrar(email: str, password: str) -> dict:
    if not bd.hay_bd():
        raise HTTPException(503, "Auth no configurada.")
    try:
        sesion = bd.auth_publico(
            "POST",
            "/token",
            json={"email": email, "password": password},
            params={"grant_type": "password"},
        )
    except httpx.HTTPStatusError as e:
        raise HTTPException(401, "Email o contraseña incorrectos.") from e
    token = sesion.get("access_token")
    user = sesion.get("user") or {}
    if not token:
        raise HTTPException(401, "Supabase no devolvió token. ¿Confirm email sigue encendido?")
    return {
        "token": token,
        "user": {
            "id": user.get("id"),
            "email": email,
            "nombre": PERSONAS.get(email, {}).get("nombre") or nombre_de(email),
        },
    }


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
    return {"id": user.get("id"), "email": email}


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
                bd.rest("POST", "connections", json={"user_id": user_id, "tipo": tipo, "estado": "activa"})
        except Exception as e:
            log.warning("conexion simulada no persistió: %s", e)
    persona = PERSONAS.get(email)
    return {
        "tipo": tipo,
        "estado": "activa",
        "email": email,
        "user_id": user_id,
        "nombre": (persona or {}).get("nombre") or nombre_de(email),
        "nota": "Simulado: no hay OAuth. P1 conecta las fuentes reales del demo.",
    }
