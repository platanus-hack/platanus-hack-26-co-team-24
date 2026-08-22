# P2 — Cerebro IA

Módulo importable. P3 lo consume directamente; no expone HTTP.

## Instalación

```bash
uv venv --python 3.12
uv pip install anthropic pydantic
export ANTHROPIC_API_KEY=sk-...   # sin esto todo cae a datos mock
```

## Uso desde P3

```python
from cerebro import extraer, calcular_riesgo, simular, generar_digest, ESCENARIOS

raw_events = json.loads(Path("data/raw/mock_events.json").read_text())

items  = extraer(raw_events)                       # list[KnowledgeItem]
scores = calcular_riesgo(items, raw_events)        # list[RiskScore], ordenado desc
sim    = simular("renuncia", items, "ana@empresa.com")  # SimulationResult
quests = generar_digest(items, scores)             # list[Quest]
```

Todo son modelos Pydantic: `.model_dump()` para el JSON de la API.

### Flag mock

Cada función acepta `mock=True` y devuelve datos falsos que cumplen el contrato.
Es el plan B del demo (`GET /simular?mock=true` de P3). Además, si no hay
`ANTHROPIC_API_KEY` configurada, `extraer`, `simular` y `generar_digest` caen a
mock por su cuenta en vez de fallar.

`simular()` valida el escenario y el objetivo **antes** del fallback: un
`scenario_id` inválido levanta `ValueError` siempre, también en modo mock.

## Firmas

```python
extraer(raw_events, *, fusionar=True, mock=False) -> list[KnowledgeItem]
calcular_riesgo(items, raw_events=None, *, mock=False) -> list[RiskScore]
simular(scenario_id, items, objetivo_id=None, *, mock=False) -> SimulationResult
generar_digest(items, scores, *, limite=6, mock=False) -> list[Quest]
```

`raw_events` en `calcular_riesgo` es opcional: sin él el score sale solo del
conocimiento; con él se suma la señal del grafo de colaboración.

## Score de riesgo

```
cobertura(item) = min(1, nº respaldos / 2)         # 0 = nadie más lo sabe
peso(item)      = {acceso:3, proceso:2, regla_tacita:2, tarea:1}[tipo]
                  × (1 − 0.9 × cobertura)          # cubierto pesa el 10%
riesgo(persona) = Σ peso × (1 + 0.5 × intermediación_en_el_grafo)
score           = 100 × riesgo / max(riesgo del equipo, 6.0)
```

Un respaldo único deja el peso en ~55%: bus factor 2 sigue siendo frágil, no se
premia como si estuviera resuelto.

### Dos números, y no son intercambiables

| Campo | Qué es | Para quién |
|---|---|---|
| `RiskScore.score` | 0-100 **relativo al equipo** | P4: colores de la oficina |
| `RiskScore.riesgo_absoluto` | riesgo crudo, comparable entre semanas | comparaciones temporales |
| `resiliencia_equipo(items)` | 0-100 de cobertura del conocimiento | **P5: el puntaje del pitch** |

El `score` relativo **no puede medir progreso** — si todo el equipo mejora, el
máximo baja y los scores relativos se quedan igual o suben. El número que sube
cuando alguien completa una quest es `resiliencia_equipo()`. El piso de 6.0 en la
normalización (= un acceso sin ningún respaldo) evita que un equipo ya sano tenga
igual a alguien en rojo.

`RiskScore.detalle` trae la explicación en español, lista para el dashboard.
`RiskScore.items_criticos` son los ids que P4 pinta en rojo.

## Escenarios

Los 7 del catálogo están en `cerebro.ESCENARIOS`. `renuncia` y `robo_pc`
requieren `objetivo_id` (email); el resto no.

## Caché

Toda llamada al LLM se cachea en `.cache_cerebro/` por hash del prompt. La
extracción se corre una vez y queda fija; en el demo solo `simular()` va en vivo.
Para invalidar: borrar el directorio, o `CEREBRO_CACHE=0`.

Variables: `CEREBRO_MODELO` (default `claude-opus-5`), `CEREBRO_CACHE_DIR`,
`CEREBRO_CACHE`.

## Verificar

```bash
python test_cerebro.py    # 15 checks de unidad, sin red ni API key
```
