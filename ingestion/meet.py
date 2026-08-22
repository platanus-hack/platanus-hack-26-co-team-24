"""Local transcript and Google Drive/Meet normalization."""

from __future__ import annotations

import re
from collections.abc import Callable
from datetime import datetime, timedelta, timezone
from typing import Any

from .schema import RawEvent

DriveCall = Callable[..., Any]
Clock = Callable[[], datetime]
_SENTENCE_BOUNDARY = re.compile(r"[.!?](?=\s)")


def _chunk_text(text: str, limit: int) -> list[str]:
    """Split normalized text without losing any characters."""
    remaining = " ".join(text.lstrip("\ufeff").split())
    if not remaining:
        return []
    if limit < 1:
        raise ValueError("limit must be positive")

    chunks: list[str] = []
    while len(remaining) > limit:
        window = remaining[: limit + 1]
        boundaries = list(_SENTENCE_BOUNDARY.finditer(window))
        if boundaries:
            cut = boundaries[-1].end()
        else:
            space = window.rfind(" ")
            cut = space if space > 0 else limit
        chunks.append(remaining[:cut])
        remaining = remaining[cut:]
    if remaining:
        chunks.append(remaining)
    return chunks


def normalize_transcript(
    *,
    meeting_id: str,
    title: str,
    text: str,
    author_email: str,
    participants: list[str],
    timestamp: str,
    limit: int = 1500,
    metadata: dict[str, Any] | None = None,
) -> list[RawEvent]:
    """Create one RawEvent per chunk while retaining the shared meeting ID."""
    chunks = _chunk_text(text, limit)
    base_metadata = {key: value for key, value in (metadata or {}).items() if value is not None}
    events: list[RawEvent] = []
    for index, chunk in enumerate(chunks, start=1):
        events.append(
            RawEvent(
                id=f"meet-{meeting_id}-{index:03d}",
                fuente="meet",
                tipo="transcripcion",
                autor_email=author_email,
                participantes=sorted(set(participants) - {author_email}),
                timestamp=timestamp,
                contenido=chunk,
                metadata={
                    **base_metadata,
                    "reunion_id": meeting_id,
                    "titulo": title,
                    "bloque": index,
                    "bloques_total": len(chunks),
                },
            )
        )
    return events


def fetch_drive_events(
    api: DriveCall,
    *,
    folder_id: str,
    author_email: str,
    participants: list[str] | None = None,
    limit: int = 1500,
    since: str | None = None,
    now: Clock | None = None,
) -> list[RawEvent]:
    """List Google Docs in a Drive folder and export them as plain text."""
    current = now() if now else datetime.now(timezone.utc)
    if current.tzinfo is None:
        current = current.replace(tzinfo=timezone.utc)
    cutoff_text = since or (current.astimezone(timezone.utc) - timedelta(days=60)).isoformat().replace("+00:00", "Z")
    cutoff = datetime.fromisoformat(cutoff_text.replace("Z", "+00:00"))
    if cutoff.tzinfo is None:
        cutoff = cutoff.replace(tzinfo=timezone.utc)

    documents: list[dict[str, Any]] = []
    page_token: str | None = None
    while True:
        params: dict[str, Any] = {
            "q": (
                f"'{folder_id}' in parents and "
                "mimeType='application/vnd.google-apps.document' and "
                f"trashed=false and modifiedTime >= '{cutoff_text}'"
            ),
            "fields": "nextPageToken,files(id,name,modifiedTime,webViewLink)",
            "pageSize": 100,
        }
        if page_token:
            params["pageToken"] = page_token
        response = api("GET", "/files", **params)
        documents.extend(response.get("files", []))
        page_token = response.get("nextPageToken")
        if not page_token:
            break

    events: list[RawEvent] = []
    for document in documents:
        modified = datetime.fromisoformat(document["modifiedTime"].replace("Z", "+00:00"))
        if modified < cutoff:
            continue
        text = api(
            "GET",
            f"/files/{document['id']}/export",
            mimeType="text/plain",
            raw=True,
        )
        events.extend(
            normalize_transcript(
                meeting_id=document["id"],
                title=document["name"],
                text=text,
                author_email=author_email,
                participants=participants or [],
                timestamp=document["modifiedTime"],
                limit=limit,
                metadata={
                    "documento_id": document["id"],
                    "url": document.get("webViewLink"),
                },
            )
        )
    return sorted(events, key=lambda event: (event.timestamp, event.id))
