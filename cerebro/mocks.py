"""Datos falsos que cumplen el contrato.

Doble propósito:
1. Fase 1 — desbloquean a P3 antes de que la extracción real exista.
2. Plan B del demo — si en vivo se cae la API, `simular(..., mock=True)` sigue
   contando la misma historia.

Los emails coinciden con los de `data/raw/mock_events.json`.
"""

from .esquemas import KnowledgeItem, Quest, RiskScore, SimulationResult

EQUIPO = [
    "ana@empresa.com",
    "david@empresa.com",
    "brayan@empresa.com",
    "jorge@empresa.com",
    "andres@empresa.com",
    "samuel@empresa.com",
    "laura@empresa.com",
    "camilo@empresa.com",
    "valentina@empresa.com",
]

ITEMS: list[KnowledgeItem] = [
    KnowledgeItem(
        id="ki-001",
        tipo="tarea",
        descripcion="Comprar y gestionar los tiquetes aéreos de la gerencia",
        dueño_principal="ana@empresa.com",
        respaldos=[],
        fuente="slack",
        evidencia="Ya quedó reservado el vuelo del jefe para Santiago",
    ),
    KnowledgeItem(
        id="ki-002",
        tipo="regla_tacita",
        descripcion="Al jefe solo se le reserva en LATAM, nunca en otra aerolínea",
        dueño_principal="ana@empresa.com",
        respaldos=[],
        fuente="slack",
        evidencia="ojo: al jefe solo le gusta viajar en LATAM, no le compren en otra",
    ),
    KnowledgeItem(
        id="ki-003",
        tipo="acceso",
        descripcion="Administración del CRM (usuario admin y creación de cuentas)",
        dueño_principal="ana@empresa.com",
        respaldos=[],
        fuente="slack",
        evidencia="El único admin del CRM soy yo, así que cualquier alta me la piden por acá",
    ),
    KnowledgeItem(
        id="ki-004",
        tipo="acceso",
        descripcion="Acceso SSH al servidor de producción",
        dueño_principal="david@empresa.com",
        respaldos=["samuel@empresa.com"],
        fuente="slack",
        evidencia="la llave del servidor la tenemos David y yo",
    ),
    KnowledgeItem(
        id="ki-005",
        tipo="proceso",
        descripcion="Despliegue a producción: build, migraciones y rollback",
        dueño_principal="david@empresa.com",
        respaldos=[],
        fuente="github",
        evidencia="deploy: corro las migraciones primero y después el build, si falla hago rollback a mano",
    ),
    KnowledgeItem(
        id="ki-006",
        tipo="proceso",
        descripcion="Conciliación mensual de facturación con el proveedor de pagos",
        dueño_principal="laura@empresa.com",
        respaldos=["camilo@empresa.com"],
        fuente="meet",
        evidencia="la conciliación la hacemos Camilo y yo el último viernes del mes",
    ),
    KnowledgeItem(
        id="ki-007",
        tipo="tarea",
        descripcion="Mantenimiento del pipeline de datos de reportes semanales",
        dueño_principal="jorge@empresa.com",
        respaldos=[],
        fuente="github",
        evidencia="el pipeline de reportes lo armé yo, si se cae avísenme",
    ),
    KnowledgeItem(
        id="ki-008",
        tipo="acceso",
        descripcion="Cuenta de administración del workspace de Google (Drive y Meet)",
        dueño_principal="brayan@empresa.com",
        respaldos=["valentina@empresa.com"],
        fuente="slack",
        evidencia="el admin de Google Workspace lo maneja Brayan",
    ),
    KnowledgeItem(
        id="ki-009",
        tipo="regla_tacita",
        descripcion="Los PR no se mergean sin revisión de alguien de plataforma",
        dueño_principal="andres@empresa.com",
        respaldos=["david@empresa.com", "samuel@empresa.com"],
        fuente="github",
        evidencia="regla de la casa: nada entra a main sin review de plataforma",
    ),
    KnowledgeItem(
        id="ki-010",
        tipo="proceso",
        descripcion="Atención del canal de soporte de clientes en horario extendido",
        dueño_principal="valentina@empresa.com",
        respaldos=[],
        fuente="slack",
        evidencia="yo cubro soporte hasta las 8pm, después ya no queda nadie",
    ),
]

SCORES: list[RiskScore] = [
    RiskScore(
        persona_id="ana@empresa.com",
        score=100,
        items_criticos=["ki-001", "ki-002", "ki-003"],
        total_items=3,
        detalle="3 elementos sin respaldo, incluidos un acceso y una regla tácita. Bus factor 1.",
    ),
    RiskScore(
        persona_id="david@empresa.com",
        score=62,
        items_criticos=["ki-005"],
        total_items=2,
        detalle="El proceso de despliegue no tiene respaldo documentado.",
    ),
    RiskScore(
        persona_id="valentina@empresa.com",
        score=38,
        items_criticos=["ki-010"],
        total_items=1,
        detalle="Única persona cubriendo soporte en horario extendido.",
    ),
    RiskScore(
        persona_id="jorge@empresa.com",
        score=25,
        items_criticos=["ki-007"],
        total_items=1,
        detalle="El pipeline de reportes depende de una sola persona.",
    ),
    RiskScore(
        persona_id="brayan@empresa.com",
        score=19,
        items_criticos=[],
        total_items=1,
        detalle="Su acceso crítico ya tiene respaldo.",
    ),
    RiskScore(
        persona_id="laura@empresa.com",
        score=12,
        items_criticos=[],
        total_items=1,
        detalle="Proceso compartido con un respaldo activo.",
    ),
    RiskScore(
        persona_id="andres@empresa.com",
        score=12,
        items_criticos=[],
        total_items=1,
        detalle="Regla tácita conocida por dos personas más.",
    ),
    RiskScore(persona_id="samuel@empresa.com", score=0, items_criticos=[], total_items=0, detalle="Sin elementos propios."),
    RiskScore(persona_id="camilo@empresa.com", score=0, items_criticos=[], total_items=0, detalle="Sin elementos propios."),
]

PLAYBOOK_MD = """# Playbook de empalme — Ana Sofía Suárez (ana@empresa.com)

**Escenario simulado:** renuncia / ausencia indefinida
**Impacto:** 3 elementos de conocimiento quedan sin dueño, 2 de ellos bloquean operación en menos de 48 horas.

## 1. Qué hacía Ana

| Elemento | Tipo | Respaldo actual |
|---|---|---|
| Compra y gestión de tiquetes aéreos de la gerencia | tarea | ninguno |
| Administración del CRM (admin y alta de usuarios) | acceso | ninguno |
| "Al jefe solo se le reserva en LATAM" | regla tácita | ninguno |

## 2. Reglas tácitas que nadie más conoce

- **Aerolínea:** el jefe solo viaja en LATAM. No es una preferencia menor: dos
  reservas anteriores se cancelaron por comprar en otra aerolínea.
- Los usuarios nuevos del CRM se piden por mensaje directo a Ana, no hay
  formulario ni ticket.

## 3. Quién asume qué

- **Tiquetes → Valentina.** Es quien más ha participado en los hilos de viajes.
  Requiere el acceso al portal corporativo de la agencia.
- **CRM → Camilo.** Ya administra el proveedor de pagos; el patrón de trabajo es
  el mismo. Requiere que se le cree un segundo usuario admin **antes** de que Ana
  salga.

## 4. Primeras 48 horas

1. Crear un segundo usuario administrador en el CRM y verificar que puede dar de
   alta a alguien. **Sin esto no hay altas de clientes.**
2. Transferir el acceso al portal de la agencia de viajes y dejar por escrito la
   regla de LATAM en el canal de operaciones.
3. Sesión de 30 minutos Ana → Valentina + Camilo, grabada en Meet.
4. Revisar si hay reservas en curso a nombre de Ana que requieran cambio de
   titular.

## 5. Riesgo residual

Aun ejecutando lo anterior, el conocimiento sobre el historial de proveedores de
viaje se pierde. Recomendación: documentar el proveedor y las condiciones
negociadas antes de la salida.
"""

SIMULACION = SimulationResult(
    scenario_id="renuncia",
    objetivo_id="ana@empresa.com",
    items_huerfanos=[i for i in ITEMS if i.dueño_principal == "ana@empresa.com"],
    impacto="3 elementos huérfanos: 1 acceso, 1 tarea y 1 regla tácita. Sin respaldos. Operación de altas de clientes en riesgo en menos de 48 horas.",
    playbook_md=PLAYBOOK_MD,
)

QUESTS: list[Quest] = [
    Quest(
        id="q-001",
        asignado_a="ana@empresa.com",
        accion="Crea un segundo usuario administrador del CRM para Camilo y verifica con él que puede dar de alta a un cliente.",
        item_relacionado="ki-003",
        puntos=30,
    ),
    Quest(
        id="q-002",
        asignado_a="ana@empresa.com",
        accion="Escribe en el canal de operaciones las reglas de reserva de la gerencia, empezando por la de LATAM.",
        item_relacionado="ki-002",
        puntos=20,
    ),
    Quest(
        id="q-003",
        asignado_a="david@empresa.com",
        accion="Documenta en el README del repo el paso a paso del despliegue y el rollback, y haz que Samuel lo ejecute una vez.",
        item_relacionado="ki-005",
        puntos=25,
    ),
    Quest(
        id="q-004",
        asignado_a="valentina@empresa.com",
        accion="Entrena a una persona más en el turno de soporte extendido y deja el guion de respuestas en Notion.",
        item_relacionado="ki-010",
        puntos=20,
    ),
    Quest(
        id="q-005",
        asignado_a="jorge@empresa.com",
        accion="Comparte con Brayan el acceso y el diagrama del pipeline de reportes semanales.",
        item_relacionado="ki-007",
        puntos=15,
    ),
]
