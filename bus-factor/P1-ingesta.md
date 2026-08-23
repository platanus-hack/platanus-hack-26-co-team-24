# 👷 P1 — Ingesta de datos
### Bus Factor HQ · Documento individual de trabajo

**Tu misión:** que todo lo que el equipo produce en Slack, GitHub y Drive/Meet entre al sistema convertido en un formato único. Eres la boca del sistema: si tú no entregas datos limpios, el cerebro no tiene qué pensar.

---

## 1. Tu contrato con el equipo

Entregas **`RawEvent[]`** — el formato único acordado en la Hora 0:

```json
{
  "id": "slack-C012-1692712345",
  "fuente": "slack | github | meet",
  "tipo": "mensaje | commit | pr | review | transcripcion",
  "autor_email": "ana@empresa.com",
  "participantes": ["david@empresa.com"],
  "timestamp": "2026-08-22T14:30:00Z",
  "contenido": "texto plano del evento",
  "metadata": { "canal": "#dev", "repo": "...", "url": "..." }
}
```

- **Quién te consume:** P2 (Cerebro IA). Nunca hablas con los frontends.
- **Cómo entregas:** un endpoint `GET /raw-events?fuente=&desde=` en un mini servicio propio, O archivos JSON en una carpeta compartida del monorepo (`/data/raw/`). Acuerda con P2 cuál de los dos en la Hora 0 — el archivo JSON es más simple y suficiente para hackathon.
- **Regla de oro:** el `autor_email` debe ser consistente entre fuentes (el mismo humano = el mismo email en Slack, GitHub y Meet). Arma un diccionario de mapeo `github_username → email` a mano; son 9 personas, no lo automatices.

## 2. Orden de trabajo

### Fase 0 (Hora 0-1): contratos
Participa en la definición de esquemas. Pelea por que `RawEvent` sea lo más plano posible.

### Fase 1 (Hora 1-3): MOCKS PRIMERO ⚡
Antes de tocar una sola API real, escribe **`/data/raw/mock_events.json`** con 40-60 eventos falsos pero realistas de las tres fuentes: mensajes tipo "recuerden que al jefe solo le gusta LATAM", commits, un fragmento de transcripción. Avísale a P2 apenas esté. **Con esto ya desbloqueaste a todo el equipo.**

### Fase 2 (Hora 3-8): Slack real
1. Crea la app en api.slack.com sobre el workspace de prueba, scopes: `channels:history`, `channels:read`, `users:read`, `users:read.email`.
2. Usa `conversations.list` → `conversations.history` por canal. Pagina con `cursor`.
3. Resuelve `user_id → email` con `users.info` (cachea el resultado, no llames por mensaje).
4. Normaliza a RawEvent y escribe `/data/raw/slack_events.json`.

### Fase 3 (Hora 6-10): GitHub real
1. Token personal clásico con scope `repo` sobre el repo de prueba.
2. Trae: commits (`GET /repos/{o}/{r}/commits`), PRs (`/pulls?state=all`) y reviews (`/pulls/{n}/reviews`).
3. En `contenido` pon título + body; en `metadata` los archivos tocados (`/commits/{sha}` → `files[].filename`) — es la señal más fuerte de "quién toca qué".
4. Mapea `github_username → email` con tu diccionario manual.

### Fase 4 (Hora 10-16): Drive/Meet
1. Service account o OAuth de prueba con scope `drive.readonly` sobre la carpeta de grabaciones.
2. `files.list` filtrando por la carpeta; las transcripciones automáticas de Meet son Google Docs → `files.export` como `text/plain`.
3. Trocea cada transcripción en bloques de ~1500 caracteres (un RawEvent por bloque, mismo `metadata.reunion_id`), para que P2 pueda vectorizarlos sin cortar ideas a la mitad.
4. **Si la API de Drive se pone difícil: descarga 3-5 transcripciones A MANO y ponlas como archivos.** Nadie en el jurado sabrá la diferencia y el pitch dice "conectado a Drive".

## 3. Qué tener en cuenta

- **Rate limits:** Slack ~1 req/seg en tier básico; GitHub 5000/hora con token. No hagas loops agresivos; con el volumen de 9 personas sobra.
- **No traigas TODO el historial:** últimos 30-60 días es suficiente y más rápido.
- **Privacidad del demo:** si siembran conversaciones reales del equipo, revisa que no haya nada sensible (contraseñas, temas personales).
- **Guarda crudo + normalizado:** si cambia el contrato, re-normalizas sin volver a pegarle a las APIs.
- **Idempotencia simple:** usa IDs deterministas (fuente + id nativo) para poder re-correr sin duplicar.

## 4. Qué probar (tu checklist)

- [ ] `mock_events.json` valida contra el esquema (usa un script de 10 líneas con `jsonschema` de Python)
- [ ] Todos los eventos tienen `autor_email` no vacío y consistente entre fuentes
- [ ] Slack: los mensajes de un canal conocido aparecen completos y en orden
- [ ] GitHub: un PR conocido aparece con su autor, reviewers y archivos
- [ ] Meet: una transcripción conocida quedó troceada sin cortar frases clave
- [ ] **Cita H2 (Hora 6-8) con P2:** correr su extractor sobre tus datos reales de Slack y verificar juntos que salen dueños y tareas coherentes

## 5. Prioridades si falta tiempo

1. 🥇 **Mocks completos y realistas** — sin esto el equipo muere
2. 🥈 **Slack real** — es la fuente más rica y más demoable
3. 🥉 **GitHub real**
4. 🏅 Meet con transcripciones descargadas a mano (100% aceptable)
5. ❌ Drive API completa — solo si sobra tiempo
6. ❌ Notion/Linear — NO. Van como roadmap en el pitch, no los toques.
