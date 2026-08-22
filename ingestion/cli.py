"""Ingestion CLI. Run ``python -m ingestion --help``."""

from __future__ import annotations

import argparse
import json
import os
import re
from collections.abc import Callable, Sequence
from hashlib import sha256
from pathlib import Path
from typing import Any

from .schema import load_events, save_events
from .github import fetch_github_events
from .http import HttpClient
from .meet import normalize_transcript, fetch_drive_events
from .slack import fetch_slack_events

_ENV_KEY = re.compile(r"[A-Za-z_][A-Za-z0-9_]*")


def _load_env_file(path: Path, environment: dict[str, str]) -> None:
    """Load simple KEY=VALUE entries while preserving exported variables."""
    if not path.exists():
        return
    for line_number, raw_line in enumerate(path.read_text(encoding="utf-8").splitlines(), start=1):
        line = raw_line.strip()
        if not line or line.startswith("#"):
            continue
        if line.startswith("export "):
            line = line[7:].lstrip()
        key, separator, value = line.partition("=")
        key = key.strip()
        value = value.strip()
        if not separator or not _ENV_KEY.fullmatch(key):
            raise ValueError(f"Invalid .env entry on line {line_number}")
        if len(value) >= 2 and value[0] == value[-1] and value[0] in {'\"', "'"}:
            value = value[1:-1]
        environment.setdefault(key, value)


def _recording(api: Callable[..., Any], output: Path):
    records: list[dict[str, Any]] = []

    def call(*args: Any, **kwargs: Any) -> Any:
        response = api(*args, **kwargs)
        records.append({"args": list(args), "params": kwargs, "response": response})
        output.parent.mkdir(parents=True, exist_ok=True)
        output.write_text(json.dumps(records, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        return response

    return call


def _meeting_id_for_file(file: Path) -> str:
    identity = file.resolve().as_posix()
    digest = sha256(identity.encode("utf-8")).hexdigest()
    return f"{file.stem}-{digest}"


def _parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Normalize Slack, GitHub, and Meet data for P2's RawEvent contract")
    sub = parser.add_subparsers(dest="command", required=True)

    validate = sub.add_parser("validate", help="Validate a RawEvent[] JSON file")
    validate.add_argument("path", type=Path)

    slack = sub.add_parser("slack", help="Fetch Slack messages")
    slack.add_argument("--output", type=Path, default=Path("data/raw/slack_events.json"))
    slack.add_argument("--raw-output", type=Path, default=Path("data/source_raw/slack_api.json"))
    slack.add_argument("--since", help="Slack oldest value as a Unix timestamp")

    github = sub.add_parser("github", help="Fetch commits, pull requests, and reviews")
    github.add_argument("--repo", required=True, help="owner/repo")
    github.add_argument("--users", required=True, type=Path, help="JSON github_username -> email")
    github.add_argument("--output", type=Path, default=Path("data/raw/github_events.json"))
    github.add_argument("--raw-output", type=Path, default=Path("data/source_raw/github_api.json"))
    github.add_argument("--since", help="ISO 8601 cutoff; defaults to the last 60 days")

    drive = sub.add_parser("drive", help="Export Meet transcripts from Google Drive")
    drive.add_argument("--folder-id", required=True)
    drive.add_argument("--author-email", required=True)
    drive.add_argument("--participant", action="append", default=[])
    drive.add_argument("--since", help="ISO 8601 cutoff; defaults to the last 60 days")
    drive.add_argument("--output", type=Path, default=Path("data/raw/meet_events.json"))
    drive.add_argument("--raw-output", type=Path, default=Path("data/source_raw/drive_api.json"))

    local = sub.add_parser("meet-local", help="Normalize downloaded .txt transcripts")
    local.add_argument("files", nargs="+", type=Path)
    local.add_argument("--author-email", required=True)
    local.add_argument("--participant", action="append", default=[])
    local.add_argument("--timestamp", required=True, help="Shared ISO 8601 timestamp")
    local.add_argument("--output", required=True, type=Path)
    return parser


def main(argv: Sequence[str] | None = None, environ: dict[str, str] | None = None) -> int:
    args = _parser().parse_args(argv)
    env = dict(environ if environ is not None else os.environ)
    _load_env_file(Path(".env"), env)

    if args.command == "validate":
        events = load_events(args.path)
        print(f"OK: {len(events)} valid RawEvent objects")
        return 0

    if args.command == "meet-local":
        events = []
        for file in args.files:
            events.extend(
                normalize_transcript(
                    meeting_id=_meeting_id_for_file(file),
                    title=file.stem,
                    text=file.read_text(encoding="utf-8"),
                    author_email=args.author_email,
                    participants=args.participant,
                    timestamp=args.timestamp,
                    metadata={"archivo": file.name},
                )
            )
        save_events(args.output, events)
        print(f"Wrote {len(events)} events to {args.output}")
        return 0

    if args.command == "slack":
        client = HttpClient("https://slack.com/api", env.get("SLACK_BOT_TOKEN", ""), min_interval=1.0)
        api = _recording(lambda method, **params: client.get(f"/{method}", **params), args.raw_output)
        events = fetch_slack_events(
            api,
            since=args.since,
            checkpoint=lambda current: save_events(args.output, current),
        )
    elif args.command == "github":
        client = HttpClient(
            "https://api.github.com",
            env.get("GITHUB_TOKEN", ""),
            headers={"Accept": "application/vnd.github+json", "X-GitHub-Api-Version": "2026-03-10"},
        )
        api = _recording(lambda method, path, **params: client.get(path, **params), args.raw_output)
        users = json.loads(args.users.read_text(encoding="utf-8"))
        events = fetch_github_events(api, args.repo, users, since=args.since)
    else:
        client = HttpClient("https://www.googleapis.com/drive/v3", env.get("GOOGLE_DRIVE_TOKEN", ""))
        api = _recording(lambda method, path, **params: client.get(path, **params), args.raw_output)
        events = fetch_drive_events(
            api,
            folder_id=args.folder_id,
            author_email=args.author_email,
            participants=args.participant,
            since=args.since,
        )

    save_events(args.output, events)
    print(f"Wrote {len(events)} events to {args.output}; raw responses are in {args.raw_output}")
    return 0
