"""Contratos de datos de Bus Factor HQ.

Este módulo es EL CONTRATO entre P1 -> P2 -> P3. Cualquier cambio aquí se avisa
al equipo completo y se anota en el README (regla 1 del plan de implementación).

Nota sobre identificadores: `persona_id` es el email de la persona. P2 solo
conoce emails (es lo único consistente entre Slack, GitHub y Meet); P3 mapea
email -> user_id de Supabase.
"""

from typing import Literal

from pydantic import BaseModel, Field

Fuente = Literal["slack", "github", "meet", "notion"]
TipoConocimiento = Literal["tarea", "acceso", "regla_tacita", "proceso"]
TipoEscenario = Literal["persona", "infra", "fisica"]


# --- Entrada: lo que produce P1 -------------------------------------------------


class RawEvent(BaseModel):
    """Evento crudo normalizado por P1 (Slack, GitHub, Meet)."""

    id: str
    fuente: Fuente
    tipo: Literal["mensaje", "commit", "pr", "review", "transcripcion"]
    autor_email: str
    participantes: list[str] = Field(default_factory=list)
    timestamp: str
    contenido: str
    metadata: dict = Field(default_factory=dict)


# --- Salida de extraer() --------------------------------------------------------


class KnowledgeItem(BaseModel):
    """Una pieza de conocimiento organizacional atribuida a una persona.

    `respaldos` es el campo que define el bus factor: vacío = bus factor 1.
    """

    id: str
    tipo: TipoConocimiento
    descripcion: str
    dueño_principal: str
    respaldos: list[str] = Field(default_factory=list)
    fuente: Fuente
    evidencia: str
    evento_ids: list[str] = Field(default_factory=list)

    @property
    def es_critico(self) -> bool:
        return not self.respaldos


# --- Salida de calcular_riesgo() ------------------------------------------------


class RiskScore(BaseModel):
    persona_id: str  # email
    score: int = Field(ge=0, le=100)
    items_criticos: list[str] = Field(default_factory=list)  # ids de KnowledgeItem
    total_items: int = 0
    detalle: str = ""  # explicación legible del score, para el dashboard de P5


# --- Escenarios y simulación ----------------------------------------------------


class Escenario(BaseModel):
    id: str
    tipo: TipoEscenario
    nombre: str
    descripcion: str
    requiere_objetivo: bool = False  # True = necesita persona_id objetivo


class SimulationResult(BaseModel):
    scenario_id: str
    objetivo_id: str | None = None
    items_huerfanos: list[KnowledgeItem] = Field(default_factory=list)
    impacto: str = ""
    playbook_md: str = ""


# --- Digest semanal -------------------------------------------------------------


class Quest(BaseModel):
    id: str
    asignado_a: str  # email
    accion: str
    item_relacionado: str | None = None  # id de KnowledgeItem
    estado: Literal["pendiente", "completada"] = "pendiente"
    puntos: int = 10


# --- Catálogo de los 7 escenarios (sección 7 del documento maestro) -------------

ESCENARIOS: list[Escenario] = [
    Escenario(
        id="renuncia",
        tipo="persona",
        nombre="Renuncia / ausencia",
        descripcion="Un miembro clave deja el equipo o falta indefinidamente.",
        requiere_objetivo=True,
    ),
    Escenario(
        id="robo_pc",
        tipo="persona",
        nombre="Robo del computador",
        descripcion="Le roban el equipo a una persona: accesos comprometidos y credenciales a rotar.",
        requiere_objetivo=True,
    ),
    Escenario(
        id="caida_github",
        tipo="infra",
        nombre="Caída de GitHub",
        descripcion="GitHub queda inaccesible: procesos de desarrollo y despliegue bloqueados.",
    ),
    Escenario(
        id="caida_meet",
        tipo="infra",
        nombre="Caída de Meet",
        descripcion="Se cae la videoconferencia: reuniones críticas y canales de comunicación afectados.",
    ),
    Escenario(
        id="apagon",
        tipo="fisica",
        nombre="Apagón",
        descripcion="Corte de energía en la oficina: dependencia física y contingencia remota.",
    ),
    Escenario(
        id="evacuacion",
        tipo="fisica",
        nombre="La oficina se cae (incendio / evacuación)",
        descripcion="Evacuación total: plan de continuidad y operación 100% remota.",
    ),
    Escenario(
        id="ransomware",
        tipo="infra",
        nombre="Ransomware / internet caído",
        descripcion="Sistemas secuestrados: respaldos, accesos offline y protocolo de respuesta.",
    ),
]

ESCENARIOS_POR_ID = {e.id: e for e in ESCENARIOS}
