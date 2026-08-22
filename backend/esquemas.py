"""Lo que es de P3, y solo eso.

`KnowledgeItem`, `RiskScore`, `SimulationResult`, `Quest` y `Escenario` viven en
`cerebro/esquemas.py` y se devuelven tal cual. Redefinirlos aquí sería tener el
contrato en dos archivos, que es tenerlo en ninguno.
"""

from pydantic import BaseModel, Field

from cerebro.esquemas import KnowledgeItem, Quest, RiskScore


class Oficina(BaseModel):
    id: str
    nombre: str


class Miembro(BaseModel):
    """Una fila de `GET /oficina`: la persona de P3 cruzada con su riesgo de P2."""

    email: str
    nombre: str
    rol: str
    sprite: str
    avatar_config: dict = Field(default_factory=dict)
    score: int = 0
    items_criticos: list[str] = Field(default_factory=list)
    total_items: int = 0
    detalle: str = ""


class RespuestaOficina(BaseModel):
    oficina: Oficina
    miembros: list[Miembro]
    resiliencia_equipo: float


class RespuestaRiesgo(BaseModel):
    scores: list[RiskScore]
    resiliencia_equipo: float


class RespuestaDigest(BaseModel):
    quests: list[Quest]
    resiliencia_equipo: float
    puntos_disponibles: int
    puntos_ganados: int


class PeticionSimular(BaseModel):
    scenario_id: str
    objetivo_id: str | None = None


class PeticionQuest(BaseModel):
    estado: str = "completada"
    # Quién recibe el conocimiento. Si no viene, se deduce de la acción.
    respaldo_email: str | None = None


class RespuestaQuest(BaseModel):
    quest: Quest
    item: KnowledgeItem | None = None
    respaldo_email: str | None = None
    resiliencia_equipo: float
    delta: float


class RespuestaProcesar(BaseModel):
    eventos: int
    items: int
    personas: int
    quests: int
    resiliencia_equipo: float
    segundos: float
    con_claude: bool


class Salud(BaseModel):
    ok: bool = True
    hay_api_key: bool
    hay_supabase: bool = False
    fuente_datos: str
    items: int
    forzar_mock: bool


class PeticionAuth(BaseModel):
    email: str
    password: str
    nombre: str | None = None


class PeticionAvatar(BaseModel):
    """P4 manda las capas en el root; el contrato viejo las anida en avatar_config."""

    model_config = {"extra": "allow"}
    email: str | None = None
    avatar_config: dict | None = None


class PeticionConexion(BaseModel):
    tipo: str
    email: str | None = None
