"""Minimal dependency-free HTTP client for the three source APIs."""

from __future__ import annotations

import json
from collections.abc import Callable
from time import monotonic, sleep
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import Request, urlopen


class HttpClient:
    def __init__(
        self,
        base_url: str,
        token: str,
        *,
        headers: dict[str, str] | None = None,
        timeout: int = 30,
        min_interval: float = 0.0,
        max_attempts: int = 3,
        clock: Callable[[], float] = monotonic,
        sleeper: Callable[[float], None] = sleep,
        opener: Callable[..., Any] = urlopen,
    ) -> None:
        if not token:
            raise ValueError("API token is required")
        self.base_url = base_url.rstrip("/")
        self.token = token
        self.headers = dict(headers or {})
        self.timeout = timeout
        self.min_interval = min_interval
        self.max_attempts = max_attempts
        self.clock = clock
        self.sleeper = sleeper
        self.opener = opener
        self._last_request_at: float | None = None

    def get(self, path: str, *, raw: bool = False, **params: Any) -> Any:
        if self.max_attempts < 1:
            raise ValueError("max_attempts must be positive")

        query = urlencode({key: value for key, value in params.items() if value is not None})
        url = f"{self.base_url}/{path.lstrip('/')}"
        if query:
            url = f"{url}?{query}"
        headers = {
            "Accept": "application/json",
            "Authorization": f"Bearer {self.token}",
            "User-Agent": "bus-factor-hq-ingestion/1.0",
            **self.headers,
        }
        request = Request(url, headers=headers, method="GET")

        body = b""
        for attempt in range(1, self.max_attempts + 1):
            self._wait_for_interval()
            try:
                with self.opener(request, timeout=self.timeout) as response:
                    body = response.read()
                break
            except HTTPError as error:
                if error.code == 429 and attempt < self.max_attempts:
                    retry_after = float(error.headers.get("Retry-After", "5"))
                    self.sleeper(max(0.0, retry_after))
                    continue
                detail = error.read().decode("utf-8", errors="replace")
                try:
                    parsed = json.loads(detail)
                    detail = parsed.get("message") or parsed.get("error") or detail
                except json.JSONDecodeError:
                    pass
                raise RuntimeError(f"HTTP {error.code}: {detail}") from error
            except TimeoutError:
                raise RuntimeError("API request timed out") from None
            except URLError as error:
                raise RuntimeError(f"Network error: {error.reason}") from error

        try:
            text = body.decode("utf-8")
        except UnicodeDecodeError:
            raise RuntimeError("Invalid response: content is not UTF-8") from None
        if raw:
            return text
        try:
            return json.loads(text)
        except json.JSONDecodeError:
            raise RuntimeError("Invalid JSON response") from None

    def _wait_for_interval(self) -> None:
        now = self.clock()
        if self._last_request_at is not None:
            wait = self.min_interval - (now - self._last_request_at)
            if wait > 0:
                self.sleeper(wait)
                now += wait
        self._last_request_at = now
