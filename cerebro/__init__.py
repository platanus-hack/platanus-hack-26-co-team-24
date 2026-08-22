"""P2 — Cerebro IA de Bus Factor HQ.

P3 importa exactamente esto:

    from cerebro import extraer, calcular_riesgo, simular, generar_digest

Todas las funciones aceptan `mock=True` y, si no hay ANTHROPIC_API_KEY, caen a
datos falsos por su cuenta. Nunca revientan por falta de credenciales.
"""

from .esquemas import (
    ESCENARIOS,
    ESCENARIOS_POR_ID,
    Escenario,
    KnowledgeItem,
    Quest,
    RawEvent,
    RiskScore,
    SimulationResult,
)
from .nucleo import calcular_riesgo, extraer, generar_digest, simular

__all__ = [
    "extraer",
    "calcular_riesgo",
    "simular",
    "generar_digest",
    "RawEvent",
    "KnowledgeItem",
    "RiskScore",
    "SimulationResult",
    "Quest",
    "Escenario",
    "ESCENARIOS",
    "ESCENARIOS_POR_ID",
]
