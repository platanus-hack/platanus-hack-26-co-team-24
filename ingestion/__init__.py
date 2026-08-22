"""Slack, GitHub, and Meet ingestion for Bus Factor HQ."""

from .schema import RawEvent, load_events, save_events

__all__ = ["RawEvent", "load_events", "save_events"]
