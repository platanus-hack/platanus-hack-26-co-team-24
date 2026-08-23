# P1: ingestion de datos

P1 convierte Slack, GitHub y transcripciones de Meet al `RawEvent[]` que consume `cerebro` en P2. El paquete `ingestion` usa solo la biblioteca estándar de Python 3.11 o superior. La suite completa del repositorio también importa P2 y por eso requiere las dependencias del `pyproject.toml`, incluidas Pydantic y Anthropic.

## Configuración local

```bash
cp .env.example .env
```

El CLI carga `.env` automáticamente y respeta primero cualquier variable ya exportada en el shell. La guía completa para obtener credenciales, probar cada proveedor y validar P1 con P2 está en [`integration-testing.md`](integration-testing.md).

## Contrato

Cada evento tiene `id`, `fuente`, `tipo`, `autor_email`, `participantes`, `timestamp`, `contenido` y `metadata`. Los IDs dependen del ID nativo de la fuente, así que repetir una descarga no duplica eventos. `save_events()` ordena y elimina IDs repetidos.

Validar los 46 eventos de demostración:

```bash
python -m ingestion validate data/raw/mock_events.json
```

## Slack

La app necesita `channels:history`, `channels:read`, `users:read` y `users:read.email`. El conector procesa solo canales donde el bot es miembro, pagina mensajes y respuestas de threads, resuelve cada usuario una sola vez, guarda progreso por canal y reintenta HTTP 429 respetando `Retry-After`.

```bash
export SLACK_BOT_TOKEN=xoxb-...
python -m ingestion slack --since 1754006400
```

Escribe eventos normalizados en `data/raw/slack_events.json` y respuestas crudas de la API en `data/source_raw/slack_api.json`. Los eventos quedan donde P2 los descubre automáticamente; las respuestas crudas se mantienen fuera de `data/raw/` para que P2 no intente validarlas como `RawEvent`.

`fetch_slack_events` también se usa desde el backend: `POST /conexiones/slack/sincronizar` le pasa el token que cada usuario autorizó por OAuth en vez de `SLACK_BOT_TOKEN`, y escribe a `data/raw/ingesta-{oficina}.json`. El conector no cambia — solo cambia de dónde sale el token. Los pasos para crear la app de Slack están en [`backend/README.md`](../backend/README.md) (sección "Conectar Slack").

## GitHub

Copia el mapa de ejemplo y usa los emails acordados por el equipo. Los usuarios que no estén en el mapa se omiten para no atribuir conocimiento a la persona equivocada.

```bash
cp config/github_users.example.json config/github_users.json
export GITHUB_TOKEN=github_pat_...
python -m ingestion github --repo owner/repo --users config/github_users.json --since 2026-07-01T00:00:00Z
```

El conector trae commits, PRs y reviews. También consulta los archivos tocados y los guarda en `metadata.archivos`.

## Drive y Meet

Con un access token OAuth que incluya `drive.readonly`:

```bash
export GOOGLE_DRIVE_TOKEN=...
python -m ingestion drive \
  --folder-id ID_DE_LA_CARPETA \
  --author-email ana@empresa.com \
  --participant david@empresa.com
```

Drive lista los Google Docs de la carpeta y los exporta como `text/plain`. Cada transcripción se divide cerca de 1500 caracteres sin cortar frases cuando es posible.

Si OAuth bloquea el demo, descarga las transcripciones como `.txt`:

```bash
python -m ingestion meet-local transcripciones/reunion-1.txt \
  --author-email ana@empresa.com \
  --participant david@empresa.com \
  --timestamp 2026-08-22T14:30:00Z \
  --output data/raw/meet_events.json
```

## Pruebas

```bash
python -m unittest discover -v
```

No guardes tokens en el repositorio. Revisa los datos reales antes del demo para quitar contraseñas, asuntos personales o información sensible.
