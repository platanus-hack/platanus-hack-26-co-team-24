# Bus Factor HQ

**Simulador arcade de emergencias organizacionales.**

> *"¿Qué pasa si mañana tu CTO no llega? Nosotros ya lo simulamos… y tu empresa sobrevivió."*

---

## El problema

Todo equipo tiene un **bus factor de 1** en algo: una sola persona que sabe comprar los vuelos del jefe, que es admin del CRM, que sabe hacer el rollback cuando el despliegue falla.

El día que esa persona falta —renuncia, se enferma, le roban el equipo— la operación entra en pánico: empalmes de semanas, conocimiento perdido, clientes esperando.

Y ese conocimiento **no vive en la documentación**. Vive en hilos de Slack, en reuniones de Meet que nadie vuelve a ver, y en la cabeza de la gente. Documentar a mano no funciona: nadie tiene tiempo y la documentación nace desactualizada.

## Qué hace Bus Factor HQ

Se conecta a las herramientas donde ya trabaja tu equipo —Slack, GitHub y las grabaciones de Meet en Drive— y construye solo el mapa de **quién sabe qué**: tareas, accesos, procesos y, sobre todo, el conocimiento tácito. Esas reglas no escritas del tipo *"al jefe solo le gusta viajar en LATAM"* que ninguna wiki captura y que son lo primero que se pierde.

Con ese mapa puedes hacer dos cosas:

**1. Simular la emergencia antes de que ocurra.** Eliges un escenario en la consola arcade —renuncia, robo del computador, caída de GitHub, apagón, evacuación, ransomware— y sobre una oficina pixel art ves qué se rompe. En segundos el sistema devuelve las tareas huérfanas, el impacto y un **documento de empalme** completo: qué hacía esa persona, cómo lo hacía, qué reglas tácitas hay que respetar, quién debería asumir cada cosa y qué hacer en las primeras 48 horas.

**2. Prevenir con misiones.** Cada viernes el sistema reparte *quests* de descentralización concretas: *"David: comparte el acceso del servidor con Samuel y documéntalo"*. Completarlas sube el puntaje de resiliencia del equipo. Prevenir se vuelve un juego.

## Cómo funciona

```
Slack · GitHub · Meet  →  Extracción con IA  →  Mapa de conocimiento
                                                      ↓
                     Puntaje de riesgo  ←  Grafo de colaboración
                                                      ↓
                            Simulación  →  Playbook de empalme + quests
```

**Extracción.** Cada mensaje, commit, review y transcripción pasa por Claude, que extrae elementos de conocimiento con su dueño, sus respaldos y una cita textual como evidencia. Todo con salida estructurada y verificación posterior: si el modelo atribuye algo a alguien que no aparece en los datos, ese elemento se descarta.

**Riesgo.** El score de cada persona pesa lo que sabe según su tipo (un acceso pesa más que una tarea) y lo descuenta por cobertura: lo que dos personas saben casi no cuenta. Un respaldo único sigue pesando, porque bus factor 2 también es frágil.

**Grafo de colaboración.** La misma idea que se usa para valorar futbolistas por su red de pases. Cada mensaje, review o reunión es un "pase", y la *intermediación* mide por cuántos caminos de información pasa cada persona. Alguien puede tener poco conocimiento exclusivo y aun así ser insustituible por su posición en la red — y es también quien mejor puede recibir el traspaso cuando no hay respaldo.

## Qué lo hace distinto

Las herramientas existentes atacan pedazos del problema. Las wikis dependen de que alguien documente, y nadie lo hace. Las herramientas de offboarding actúan cuando ya es tarde. El análisis de bus factor sobre repositorios —`truckfactor`, `code-maat`, `hercules`— solo mira el `git log`, e ignora el 80% del conocimiento que no es código: ningún `git log` sabe quién es el único admin del CRM.

Tres diferencias:

- **Conocimiento tácito, no solo tareas.** Capturamos las reglas no escritas desde conversaciones y reuniones reales.
- **Simulación proactiva.** No esperamos la emergencia: la ensayamos. Es un simulacro de incendio para el conocimiento organizacional.
- **Gamificación real.** La prevención es aburrida y por eso nadie la hace. La interfaz arcade no es decoración: es la estrategia de adopción.

## Stack

| Capa | Tecnología |
|---|---|
| IA | Claude API — extracción estructurada, playbooks y quests |
| Backend | Python + FastAPI |
| Base de datos y auth | Supabase (PostgreSQL + pgvector + Auth) |
| Juego | React + Phaser.js, sprites pixel art |
| Dashboard | React + Tailwind CSS |
| Ingesta | Slack API, GitHub API, Google Drive API |

Sin modelos entrenados a la medida: extracción de entidades, grafo de conocimiento y prompts estructurados sobre datos reales.

---

*Track: Emergencias · Platanus Hack 26 Bogotá · team-24*
