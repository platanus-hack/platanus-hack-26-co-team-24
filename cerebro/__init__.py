"""P2 — Cerebro IA de Bus Factor HQ.

P3 importa exactamente esto:

    from cerebro import extraer, calcular_riesgo, simular, generar_digest

Todas las funciones aceptan `mock=True` y, si no hay ANTHROPIC_API_KEY, caen a
datos falsos por su cuenta. Nunca revientan por falta de credenciales.
"""

from .esquemas import (
    ESCENARIOS,
    BusFactor,
    ESCENARIOS_POR_ID,
    Escenario,
    KnowledgeItem,
    Quest,
    RawEvent,
    RiskScore,
    SimulationResult,
)
from .nucleo import (bus_factor, calcular_riesgo, cargar_eventos, extraer, generar_digest,
                     resiliencia_equipo, simular)

__all__ = [
    "extraer",
    "cargar_eventos",
    "calcular_riesgo",
    "bus_factor",
    "simular",
    "generar_digest",
    "resiliencia_equipo",
    "RawEvent",
    "KnowledgeItem",
    "RiskScore",
    "BusFactor",
    "SimulationResult",
    "Quest",
    "Escenario",
    "ESCENARIOS",
    "ESCENARIOS_POR_ID",
]
