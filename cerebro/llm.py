"""Envoltura mínima sobre la API de Claude, con caché en disco.

Dos funciones: `parse_json` (salida validada contra un modelo Pydantic) y
`texto` (Markdown libre, para el playbook). Ambas cachean por hash del prompt,
así que re-correr la extracción durante el hackathon es gratis e instantáneo.

Regla del demo: la extracción se corre UNA vez y queda cacheada; solo `simular()`
se ejecuta en vivo frente al jurado.
"""

from __future__ import annotations

import hashlib
import json
import os
from pathlib import Path
from typing import TypeVar

from pydantic import BaseModel

from .esquemas import RAIZ

# `backend/` ya carga el .env, pero `python -m cerebro` y los scripts sueltos no
# pasaban por ahí: ponías la clave en el archivo y el cerebro seguía diciendo que
# no había. python-dotenv viene con el extra [api]; sin él esto no hace nada y
# manda la variable de entorno, que es lo que usa Render.
try:
    from dotenv import load_dotenv

    load_dotenv(RAIZ / ".env")
except ImportError:  # pragma: no cover
    pass

MODELO = os.getenv("CEREBRO_MODELO", "claude-opus-5")
# En Railway/Render el disco es efímero: la caché no sobrevive un reinicio y la
# primera llamada tras cada deploy va en frío. Los KnowledgeItem viven en
# Supabase (P3 los persiste), así que lo único que se re-paga es el playbook.
CACHE_DIR = Path(os.getenv("CEREBRO_CACHE_DIR", str(RAIZ / ".cache_cerebro")))
CACHE_ACTIVA = os.getenv("CEREBRO_CACHE", "1") != "0"

T = TypeVar("T", bound=BaseModel)

_cliente = None


def hay_api_key() -> bool:
    """True si podemos hablar con Claude. Si no, el cerebro cae a datos mock."""
    return bool(os.getenv("ANTHROPIC_API_KEY") or os.getenv("ANTHROPIC_AUTH_TOKEN"))


def _get_cliente():
    global _cliente
    if _cliente is None:
        import anthropic

        _cliente = anthropic.Anthropic()
    return _cliente


def _clave(*partes: str) -> str:
    h = hashlib.sha256()
    for p in partes:
        h.update(p.encode("utf-8"))
        h.update(b"\x00")
    return h.hexdigest()[:32]


def _leer_cache(clave: str) -> str | None:
    if not CACHE_ACTIVA:
        return None
    archivo = CACHE_DIR / f"{clave}.json"
    return archivo.read_text(encoding="utf-8") if archivo.exists() else None


def _escribir_cache(clave: str, valor: str) -> None:
    if not CACHE_ACTIVA:
        return
    CACHE_DIR.mkdir(parents=True, exist_ok=True)
    (CACHE_DIR / f"{clave}.json").write_text(valor, encoding="utf-8")


def parse_json(
    system: str,
    prompt: str,
    modelo_salida: type[T],
    *,
    max_tokens: int = 16000,
    timeout: float | None = None,
) -> T:
    """Pide a Claude una respuesta que cumpla `modelo_salida` y la devuelve validada.

    Usa structured outputs (`messages.parse`), no parseo manual de texto: la API
    garantiza el JSON, así que no hay que limpiar fences ``` ni reintentar.

    `timeout` en segundos, para las llamadas que corren en vivo. Sin él vale el
    default del cliente, que son diez minutos: aceptable offline, letal en el demo.
    """
    clave = _clave(MODELO, system, prompt, modelo_salida.__name__, str(modelo_salida.model_json_schema()))
    if (crudo := _leer_cache(clave)) is not None:
        return modelo_salida.model_validate_json(crudo)

    cliente = _get_cliente()
    if timeout is not None:
        cliente = cliente.with_options(timeout=timeout)
    respuesta = cliente.messages.parse(
        model=MODELO,
        max_tokens=max_tokens,
        system=system,
        messages=[{"role": "user", "content": prompt}],
        output_format=modelo_salida,
    )
    resultado = respuesta.parsed_output
    _escribir_cache(clave, resultado.model_dump_json())
    return resultado


def texto(system: str, prompt: str, *, max_tokens: int = 8000, timeout: float | None = None) -> str:
    """Respuesta en texto libre (Markdown). Para el playbook de empalme.

    `timeout` en segundos: en el demo en vivo vale más un playbook degradado a
    tiempo que uno perfecto que llega tarde.
    """
    clave = _clave(MODELO, system, prompt, "texto", str(max_tokens))
    if (crudo := _leer_cache(clave)) is not None:
        return json.loads(crudo)

    cliente = _get_cliente()
    if timeout is not None:
        cliente = cliente.with_options(timeout=timeout)
    respuesta = cliente.messages.create(
        model=MODELO,
        max_tokens=max_tokens,
        system=system,
        messages=[{"role": "user", "content": prompt}],
    )
    salida = "".join(b.text for b in respuesta.content if b.type == "text")
    _escribir_cache(clave, json.dumps(salida))
    return salida
