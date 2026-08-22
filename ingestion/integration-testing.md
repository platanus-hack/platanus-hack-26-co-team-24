# Testing the ingestion integrations

This guide covers live tests for Slack, GitHub, and Google Drive/Meet, followed by an isolated P1-to-P2 verification.

## 1. Local setup

From the repository root:

```bash
uv venv --python 3.11
uv pip install "anthropic>=1.0" "pydantic>=2.0"
cp .env.example .env
```

The ingestion CLI loads `.env` automatically. Values already exported in the shell override values from `.env`.

Never commit `.env`, OAuth client secrets, refresh tokens, or raw source data. `.env` and live source outputs are ignored by Git.

Before testing live APIs, run the offline suite:

```bash
.venv/bin/python -m unittest discover -v
```

## 2. Shared identity rule

P2 joins activity from different sources by email. The same person must therefore use the same email in:

- the Slack profile returned by `users.info`;
- `config/github_users.json`;
- `--author-email` and `--participant` for Meet transcripts.

Unknown GitHub usernames are skipped instead of being assigned a guessed identity.

## 3. Slack

### Credentials

Create a Slack app at <https://api.slack.com/apps>, add these Bot Token Scopes under **OAuth & Permissions**, and install the app in the test workspace:

```text
channels:history
channels:read
users:read
users:read.email
```

Copy the Bot User OAuth Token, which starts with `xoxb-`, into `.env`:

```dotenv
SLACK_BOT_TOKEN=xoxb-replace-me
```

Invite the bot to every public channel used in the test. `channels:history` only exposes messages in channels available to the app.

Official references:

- <https://docs.slack.dev/authentication/tokens>
- <https://docs.slack.dev/reference/scopes>

### Useful test messages

Seed a small public channel with messages such as:

```text
Ana is the only person with the CRM administrator credentials.
For executive travel, always use LATAM.
David knows the production rollback procedure.
@David, please document the rollback steps before Friday.
```

### Defaults

| Setting | Default |
|---|---|
| Window | Last 60 days |
| Channels | Public channels where the bot is a member |
| Threads | Cursor-paginated replies for every parent with replies |
| Throttle | At least one second between requests; HTTP 429 honors `Retry-After` for up to three attempts |
| Normalized output | `data/raw/slack_events.json` |
| Raw API output | `data/source_raw/slack_api.json` |

### Run and validate

```bash
.venv/bin/python -m ingestion slack
.venv/bin/python -m ingestion validate data/raw/slack_events.json
```

Override the window with Slack's Unix `oldest` value:

```bash
.venv/bin/python -m ingestion slack --since 1754006400
```

Success means messages and thread replies are chronological, `autor_email` is populated, resolved mentions appear as emails in both `contenido` and `participantes`, and rerunning produces the same IDs. The normalized file is checkpointed after each channel so a later channel failure does not erase earlier progress.

## 4. GitHub

The connector is repository-agnostic. `OWNER/REPOSITORY` can point to any GitHub repository that the token can read; it does not need to belong to a particular organization.

### Credentials

Create a fine-grained personal access token at:

<https://github.com/settings/personal-access-tokens/new>

Restrict it to the test repository and grant:

```text
Contents: Read
Pull requests: Read
Metadata: Read
```

An organization may require an administrator to approve the token. A classic token with `repo` also works, but grants broader access.

Store the token in `.env`:

```dotenv
GITHUB_TOKEN=github_pat_replace_me
```

Official reference:

- <https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/managing-your-personal-access-tokens>

### Identity map

```bash
cp config/github_users.example.json config/github_users.json
```

Edit the ignored local file:

```json
{
  "brayanb1701": "brayan@empresa.com",
  "anasofiasa": "ana@empresa.com"
}
```

### Test activity

Create a commit, open a PR, request a review from another mapped user, and submit the review. Touch recognizable files so `metadata.archivos` is easy to verify.

### Defaults

| Setting | Default |
|---|---|
| Window | Last 60 days |
| Pagination | 100 items per page |
| Normalized output | `data/raw/github_events.json` |
| Raw API output | `data/source_raw/github_api.json` |

### Run and validate

```bash
.venv/bin/python -m ingestion github \
  --repo OWNER/REPOSITORY \
  --users config/github_users.json

.venv/bin/python -m ingestion validate data/raw/github_events.json
```

Override the window:

```bash
.venv/bin/python -m ingestion github \
  --repo OWNER/REPOSITORY \
  --users config/github_users.json \
  --since 2026-07-01T00:00:00Z
```

Success means the output includes the expected `commit`, `pr`, and `review` events, mapped emails, reviewers, and touched files.

## 5. Google Drive and Meet

### Credentials

The connector expects a short-lived OAuth access token, not an API key or credentials JSON.

1. Create a Google Cloud project.
2. Enable the Google Drive API.
3. Configure the OAuth consent screen and add your account as a test user when needed.
4. Create a Desktop OAuth client.
5. Authorize this scope:

```text
https://www.googleapis.com/auth/drive.readonly
```

For a hackathon test, Google OAuth Playground is the quickest way to authorize the scope and exchange the code for an access token:

- <https://developers.google.com/oauthplayground/>
- <https://developers.google.com/workspace/drive/api/quickstart/python>
- <https://developers.google.com/workspace/drive/api/guides/api-specific-auth>

Store the resulting access token in `.env`:

```dotenv
GOOGLE_DRIVE_TOKEN=replace-me
```

Access tokens expire. Generate a new one when Google returns an authentication error. A production integration should securely store a refresh token and mint new access tokens.

### Test folder

Create a Drive folder containing Google Docs with transcript-like content. Copy the folder ID from:

```text
https://drive.google.com/drive/folders/FOLDER_ID
```

The authorized account must be able to read the folder and documents.

### Defaults

| Setting | Default |
|---|---|
| Window | Last 60 days |
| Files | Google Docs directly in the selected folder |
| Chunk size | At most 1,500 characters |
| Normalized output | `data/raw/meet_events.json` |
| Raw API output | `data/source_raw/drive_api.json` |

### Run and validate

```bash
.venv/bin/python -m ingestion drive \
  --folder-id FOLDER_ID \
  --author-email ana@empresa.com \
  --participant david@empresa.com

.venv/bin/python -m ingestion validate data/raw/meet_events.json
```

Repeat `--participant` for multiple people. Success means every event has `fuente: "meet"`, `tipo: "transcripcion"`, stable meeting metadata, and content chunks no longer than 1,500 characters.

### Speaker attribution status

The Drive connector deliberately does not infer speakers from the exported Google Doc yet. Google documents the destination as a Docs file, but does not publish a stable plain-text export grammar suitable for a reliable parser. The official Meet REST API is a stronger future source: `conferenceRecords.transcripts.entries` returns one speech entry with `participant`, `text`, `languageCode`, `startTime`, and `endTime`. Once we have a real Workspace transcript and Meet API credentials, prefer those structured entries over regex parsing of an editable Doc.

Official references:

- <https://developers.google.com/workspace/meet/api/guides/artifacts>
- <https://developers.google.com/workspace/meet/api/reference/rest/v2/conferenceRecords.transcripts.entries>

### Manual fallback

If OAuth blocks the demo, use downloaded `.txt` transcripts without a token:

```bash
.venv/bin/python -m ingestion meet-local transcripts/reunion-1.txt \
  --author-email ana@empresa.com \
  --participant david@empresa.com \
  --timestamp 2026-08-22T14:30:00Z \
  --output data/raw/meet_events.json
```

## 6. P1-to-P2 test

P2 automatically prefers live normalized files in `data/raw/`, ignores `mock_events.json` whenever any live file exists, and falls back to mocks only when no live data is present. Running P2 from the repository therefore does not mix fictional and real knowledge.

For a source-specific quality check, copy only that source into a temporary directory. Example for Slack:

```bash
rm -rf /tmp/p1-p2-source
mkdir -p /tmp/p1-p2-source
cp data/raw/slack_events.json /tmp/p1-p2-source/

.venv/bin/python -c '
from pathlib import Path
from cerebro import cargar_eventos, extraer, calcular_riesgo, simular, generar_digest

events = cargar_eventos(Path("/tmp/p1-p2-source"))
items = extraer(events)
scores = calcular_riesgo(items, events)
target = scores[0].persona_id
simulation = simular("renuncia", items, target, events)
quests = generar_digest(items, scores, events)

print("Raw events:", len(events))
print("Knowledge items:", len(items))
print("Risk scores:", len(scores))
print("Simulation:", simulation.impacto)
print("Quests:", len(quests))
'
```

Repeat with `github_events.json` and `meet_events.json`. For a mixed-source test, copy all three live normalized files into the temporary directory, but do not copy `mock_events.json`.

## 7. Troubleshooting

- Slack `not_in_channel`: invite the bot to the affected channel.
- Slack `missing_scope`: add the missing Bot Token Scope and reinstall the app.
- GitHub `403`: verify repository selection, read permissions, and organization approval.
- Missing GitHub users: add their exact login to `config/github_users.json`.
- Google `401`: generate a new access token.
- Empty Drive output: verify the folder ID, file ownership/sharing, Google Doc type, and 60-day window.
- P2 validation error: ensure only normalized `RawEvent[]` files are placed in `data/raw/`; raw provider responses belong in `data/source_raw/`.
