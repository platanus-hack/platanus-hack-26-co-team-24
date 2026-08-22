"""Flat P1 -> P2 contract and JSON persistence helpers."""

from __future__ import annotations

import json
from dataclasses import asdict, dataclass, field
from datetime import datetime
from pathlib import Path
from typing import Any, ClassVar


@dataclass(frozen=True, slots=True)
class RawEvent:
    """Normalized event contract. Field names must match P2's Spanish schema."""

    id: str
    fuente: str
    tipo: str
    autor_email: str
    participantes: list[str] = field(default_factory=list)
    timestamp: str = ""
    contenido: str = ""
    metadata: dict[str, Any] = field(default_factory=dict)

    TYPES_BY_SOURCE: ClassVar[dict[str, set[str]]] = {
        "slack": {"mensaje"},
        "github": {"commit", "pr", "review"},
        "meet": {"transcripcion"},
    }

    def __post_init__(self) -> None:
        if not self.id.strip():
            raise ValueError("id cannot be empty")
        if self.fuente not in self.TYPES_BY_SOURCE:
            raise ValueError(f"unsupported fuente: {self.fuente}")
        if self.tipo not in self.TYPES_BY_SOURCE[self.fuente]:
            raise ValueError(f"tipo {self.tipo!r} does not belong to {self.fuente}")
        if not self.autor_email.strip():
            raise ValueError("autor_email cannot be empty")
        if "@" not in self.autor_email:
            raise ValueError("autor_email must be an email address")
        if not self.timestamp.strip():
            raise ValueError("timestamp cannot be empty")
        try:
            datetime.fromisoformat(self.timestamp.replace("Z", "+00:00"))
        except ValueError as error:
            raise ValueError("timestamp must use ISO 8601") from error
        if not self.contenido.strip():
            raise ValueError("contenido cannot be empty")

    @classmethod
    def from_dict(cls, value: dict[str, Any]) -> "RawEvent":
        return cls(
            id=str(value["id"]),
            fuente=str(value["fuente"]),
            tipo=str(value["tipo"]),
            autor_email=str(value["autor_email"]),
            participantes=sorted(set(value.get("participantes", []))),
            timestamp=str(value["timestamp"]),
            contenido=str(value["contenido"]),
            metadata=dict(value.get("metadata", {})),
        )

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


def save_events(path: Path, events: list[RawEvent]) -> None:
    """Write chronologically sorted events while deduplicating by ID."""
    unique_events = {event.id: event for event in events}
    ordered_events = sorted(unique_events.values(), key=lambda event: (event.timestamp, event.id))
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(
        json.dumps([event.to_dict() for event in ordered_events], ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )


def load_events(path: Path) -> list[RawEvent]:
    return [RawEvent.from_dict(value) for value in json.loads(path.read_text(encoding="utf-8"))]
