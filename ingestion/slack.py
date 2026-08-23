"""Slack Web API connector with pagination and user caching."""

from __future__ import annotations

import re
from collections.abc import Callable
from datetime import datetime, timedelta, timezone
from typing import Any

from .schema import RawEvent

SlackCall = Callable[..., dict[str, Any]]
Clock = Callable[[], datetime]
_MENTION = re.compile(r"<@([A-Z0-9]+)>")


def _utc_now(now: Clock | None) -> datetime:
    value = now() if now else datetime.now(timezone.utc)
    if value.tzinfo is None:
        value = value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc)


def _pages(api: SlackCall, method: str, **params: Any):
    cursor = ""
    while True:
        response = api(method, **params, **({"cursor": cursor} if cursor else {}))
        if not response.get("ok"):
            raise RuntimeError(f"Slack {method}: {response.get('error', 'invalid response')}")
        yield response
        cursor = response.get("response_metadata", {}).get("next_cursor", "").strip()
        if not cursor:
            break


def _timestamp_iso(timestamp: str) -> str:
    return datetime.fromtimestamp(float(timestamp), timezone.utc).isoformat().replace("+00:00", "Z")


def fetch_slack_events(
    api: SlackCall,
    *,
    since: str | None = None,
    now: Clock | None = None,
    checkpoint: Callable[[list[RawEvent]], None] | None = None,
) -> list[RawEvent]:
    """Fetch member-channel messages while isolating failures by channel."""
    oldest = since or str(int((_utc_now(now) - timedelta(days=60)).timestamp()))
    channels: list[dict[str, Any]] = []
    for page in _pages(api, "conversations.list", types="public_channel", limit=200):
        channels.extend(channel for channel in page.get("channels", []) if channel.get("is_member"))

    email_cache: dict[str, str | None] = {}

    def email_for(user_id: str) -> str | None:
        if user_id not in email_cache:
            try:
                response = api("users.info", user=user_id)
            except RuntimeError as error:
                print(f"[ingestion] skipping Slack user {user_id}: {error}")
                return None
            profile = response.get("user", {}).get("profile", {}) if response.get("ok") else {}
            email_cache[user_id] = profile.get("email")
        return email_cache[user_id]

    def normalize_message(channel: dict[str, Any], message: dict[str, Any]) -> RawEvent | None:
        user_id = message.get("user")
        text = message.get("text", "").strip()
        if not user_id or message.get("bot_id") or message.get("subtype") or not text:
            return None
        author = email_for(user_id)
        if not author:
            return None

        participants = set()
        for mentioned_user in _MENTION.findall(text):
            email = email_for(mentioned_user)
            if not email:
                continue
            text = text.replace(f"<@{mentioned_user}>", email)
            if mentioned_user != user_id:
                participants.add(email)

        timestamp = str(message["ts"])
        metadata = {
            "canal": f"#{channel.get('name', channel['id'])}",
            "canal_id": channel["id"],
            "thread_ts": message.get("thread_ts"),
        }
        return RawEvent(
            id=f"slack-{channel['id']}-{timestamp}",
            fuente="slack",
            tipo="mensaje",
            autor_email=author,
            participantes=sorted(participants),
            timestamp=_timestamp_iso(timestamp),
            contenido=text,
            metadata={key: value for key, value in metadata.items() if value is not None},
        )

    events: list[RawEvent] = []
    for channel in channels:
        try:
            params: dict[str, Any] = {"channel": channel["id"], "limit": 200, "oldest": oldest}
            for page in _pages(api, "conversations.history", **params):
                for message in page.get("messages", []):
                    if event := normalize_message(channel, message):
                        events.append(event)
                    if not message.get("reply_count"):
                        continue
                    parent_timestamp = str(message["ts"])
                    seen_replies = {parent_timestamp}
                    try:
                        for reply_page in _pages(
                            api,
                            "conversations.replies",
                            channel=channel["id"],
                            ts=parent_timestamp,
                            limit=200,
                        ):
                            for reply in reply_page.get("messages", []):
                                reply_timestamp = str(reply["ts"])
                                if reply_timestamp in seen_replies:
                                    continue
                                seen_replies.add(reply_timestamp)
                                if reply_event := normalize_message(channel, reply):
                                    events.append(reply_event)
                    except RuntimeError as error:
                        print(
                            f"[ingestion] skipping Slack thread "
                            f"{channel['id']}:{parent_timestamp}: {error}"
                        )
        except RuntimeError as error:
            print(f"[ingestion] skipping Slack channel {channel['id']}: {error}")
        finally:
            events.sort(key=lambda event: (event.timestamp, event.id))
            if checkpoint:
                checkpoint(list(events))
    return events
