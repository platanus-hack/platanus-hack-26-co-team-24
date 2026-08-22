"""GitHub REST connector for commits, pull requests, and reviews."""

from __future__ import annotations

from collections.abc import Callable
from datetime import datetime, timedelta, timezone
from typing import Any

from .schema import RawEvent

GitHubCall = Callable[..., Any]
Clock = Callable[[], datetime]


def _utc_now(now: Clock | None) -> datetime:
    value = now() if now else datetime.now(timezone.utc)
    if value.tzinfo is None:
        value = value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc)


def _parse_timestamp(value: str) -> datetime:
    parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=timezone.utc)
    return parsed.astimezone(timezone.utc)


def _format_timestamp(value: datetime) -> str:
    return value.astimezone(timezone.utc).isoformat().replace("+00:00", "Z")


def _without_none(values: dict[str, Any]) -> dict[str, Any]:
    return {key: value for key, value in values.items() if value is not None}


def _paginate(api: GitHubCall, path: str, **params: Any):
    page = 1
    while True:
        values = api("GET", path, per_page=100, page=page, **params)
        if not isinstance(values, list):
            raise RuntimeError(f"GitHub {path}: expected a list response")
        yield from values
        if len(values) < 100:
            break
        page += 1


def fetch_github_events(
    api: GitHubCall,
    repo: str,
    users: dict[str, str],
    *,
    since: str | None = None,
    now: Clock | None = None,
) -> list[RawEvent]:
    """Normalize repository activity using an explicit login-to-email map."""
    since = since or _format_timestamp(_utc_now(now) - timedelta(days=60))
    cutoff = _parse_timestamp(since)
    base = f"/repos/{repo}"
    events: list[RawEvent] = []
    commit_params = {"since": since}

    for commit in _paginate(api, f"{base}/commits", **commit_params):
        login = (commit.get("author") or {}).get("login")
        raw_email = commit["commit"]["author"].get("email")
        author = users.get(login) or (raw_email if raw_email in users.values() else None)
        if not author:
            continue
        if _parse_timestamp(commit["commit"]["author"]["date"]) < cutoff:
            continue
        sha = commit["sha"]
        detail = api("GET", f"{base}/commits/{sha}")
        events.append(
            RawEvent(
                id=f"github-{repo}-{sha}",
                fuente="github",
                tipo="commit",
                autor_email=author,
                participantes=[],
                timestamp=commit["commit"]["author"]["date"],
                contenido=commit["commit"]["message"].strip(),
                metadata=_without_none({
                    "repo": repo,
                    "sha": sha,
                    "url": commit.get("html_url"),
                    "archivos": [file["filename"] for file in detail.get("files", [])],
                }),
            )
        )

    for pull in _paginate(api, f"{base}/pulls", state="all", sort="updated", direction="desc"):
        if _parse_timestamp(pull.get("updated_at") or pull["created_at"]) < cutoff:
            break
        login = (pull.get("user") or {}).get("login")
        author = users.get(login)
        if not author:
            continue
        number = pull["number"]
        files = list(_paginate(api, f"{base}/pulls/{number}/files"))
        reviews = list(_paginate(api, f"{base}/pulls/{number}/reviews"))
        reviewers = sorted(
            {
                email
                for reviewer in pull.get("requested_reviewers", [])
                if (email := users.get(reviewer.get("login"))) and email != author
            }
            | {
                email
                for review in reviews
                if (email := users.get((review.get("user") or {}).get("login"))) and email != author
            }
        )
        body = pull.get("body") or ""
        content = f"{pull['title']}\n\n{body}".strip()
        if _parse_timestamp(pull["created_at"]) >= cutoff:
            events.append(
                RawEvent(
                    id=f"github-{repo}-pr-{number}",
                    fuente="github",
                    tipo="pr",
                    autor_email=author,
                    participantes=reviewers,
                    timestamp=pull["created_at"],
                    contenido=content,
                    metadata=_without_none({
                        "repo": repo,
                        "numero": number,
                        "url": pull.get("html_url"),
                        "archivos": [file["filename"] for file in files],
                    }),
                )
            )

        for review in reviews:
            reviewer_login = (review.get("user") or {}).get("login")
            reviewer_email = users.get(reviewer_login)
            submitted = review.get("submitted_at")
            if not reviewer_email or not submitted or _parse_timestamp(submitted) < cutoff:
                continue
            review_body = (review.get("body") or "No comment").strip()
            events.append(
                RawEvent(
                    id=f"github-{repo}-review-{review['id']}",
                    fuente="github",
                    tipo="review",
                    autor_email=reviewer_email,
                    participantes=[author] if author != reviewer_email else [],
                    timestamp=submitted,
                    contenido=f"{review.get('state', 'COMMENTED')}: {review_body}",
                    metadata=_without_none({
                        "repo": repo,
                        "pr_numero": number,
                        "url": review.get("html_url"),
                        "archivos": [file["filename"] for file in files],
                    }),
                )
            )

    return sorted(events, key=lambda event: (event.timestamp, event.id))
