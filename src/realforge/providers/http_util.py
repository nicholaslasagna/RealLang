from __future__ import annotations

import json
import re
import socket
import urllib.error
import urllib.request
from collections.abc import Callable, Iterator
from typing import Any


class HTTPProviderError(Exception):
    def __init__(self, code: str, message: str) -> None:
        super().__init__(message)
        self.code = code
        self.message = message


def stream_sse(
    url: str,
    payload: dict,
    *,
    timeout: float = 120.0,
    extra_headers: dict[str, str] | None = None,
    opener: Callable[..., Any] | None = None,
    max_response_bytes: int = 2 * 1024 * 1024,
) -> Iterator[dict]:
    """POST a request and yield parsed Server-Sent-Event ``data:`` JSON objects.

    Bounded and sanitized like ``post_json``: total streamed bytes are capped,
    timeouts/connection errors map to the same redacted codes, the terminating
    ``data: [DONE]`` sentinel stops iteration, and malformed keep-alive lines are
    skipped. The caller owns per-chunk size/char limits.
    """
    headers = {"Content-Type": "application/json", "Accept": "text/event-stream"}
    if extra_headers:
        headers.update(extra_headers)
    body = json.dumps(payload).encode("utf-8")
    request = urllib.request.Request(url, data=body, headers=headers, method="POST")
    open_request = opener or urllib.request.urlopen

    try:
        response = open_request(request, timeout=timeout)
    except urllib.error.HTTPError as err:
        raise HTTPProviderError("http_error", f"Local provider returned HTTP {err.code}.") from err
    except (TimeoutError, socket.timeout) as err:
        raise HTTPProviderError("timeout", "Local provider request timed out.") from err
    except urllib.error.URLError as err:
        if isinstance(err.reason, (TimeoutError, socket.timeout)):
            raise HTTPProviderError("timeout", "Local provider request timed out.") from err
        raise HTTPProviderError("connection_failed", "Could not connect to the local provider.") from err
    except OSError as err:
        raise HTTPProviderError("connection_failed", "Could not connect to the local provider.") from err

    total = 0
    try:
        for raw_line in response:
            total += len(raw_line)
            if total > max_response_bytes:
                raise HTTPProviderError(
                    "response_too_large",
                    "Local provider response exceeded the allowed size.",
                )
            line = raw_line.decode("utf-8", errors="replace").strip()
            if not line or not line.startswith("data:"):
                continue
            data_str = line[len("data:") :].strip()
            if data_str == "[DONE]":
                return
            try:
                chunk = json.loads(data_str)
            except json.JSONDecodeError:
                continue
            if isinstance(chunk, dict):
                yield chunk
    except (TimeoutError, socket.timeout) as err:
        raise HTTPProviderError("timeout", "Local provider request timed out.") from err
    except urllib.error.URLError as err:
        raise HTTPProviderError("connection_failed", "Could not connect to the local provider.") from err
    finally:
        close = getattr(response, "close", None)
        if callable(close):
            try:
                close()
            except Exception:  # noqa: BLE001 - never surface provider internals on cleanup
                pass


def post_json(
    url: str,
    payload: dict,
    *,
    timeout: float = 120.0,
    extra_headers: dict[str, str] | None = None,
    opener: Callable[..., Any] | None = None,
    max_response_bytes: int = 2 * 1024 * 1024,
) -> dict:
    headers = {"Content-Type": "application/json"}
    if extra_headers:
        headers.update(extra_headers)
    body = json.dumps(payload).encode("utf-8")
    request = urllib.request.Request(
        url,
        data=body,
        headers=headers,
        method="POST",
    )
    open_request = opener or urllib.request.urlopen
    try:
        with open_request(request, timeout=timeout) as response:
            raw_bytes = response.read(max_response_bytes + 1)
        if len(raw_bytes) > max_response_bytes:
            raise HTTPProviderError(
                "response_too_large",
                "Local provider response exceeded the allowed size.",
            )
    except urllib.error.HTTPError as err:
        raise HTTPProviderError(
            "http_error",
            f"Local provider returned HTTP {err.code}.",
        ) from err
    except (TimeoutError, socket.timeout) as err:
        raise HTTPProviderError(
            "timeout",
            "Local provider request timed out.",
        ) from err
    except urllib.error.URLError as err:
        if isinstance(err.reason, (TimeoutError, socket.timeout)):
            raise HTTPProviderError(
                "timeout",
                "Local provider request timed out.",
            ) from err
        raise HTTPProviderError(
            "connection_failed",
            "Could not connect to the local provider.",
        ) from err
    except OSError as err:
        raise HTTPProviderError(
            "connection_failed",
            "Could not connect to the local provider.",
        ) from err

    try:
        raw = raw_bytes.decode("utf-8")
    except UnicodeDecodeError as err:
        raise HTTPProviderError(
            "invalid_response",
            "Local provider returned a non-text response.",
        ) from err

    try:
        data = json.loads(raw)
    except json.JSONDecodeError as err:
        raise HTTPProviderError(
            "invalid_json",
            "Local provider returned invalid JSON.",
        ) from err
    if not isinstance(data, dict):
        raise HTTPProviderError(
            "invalid_json",
            "Local provider returned invalid JSON.",
        )
    return data


def extract_json_object(text: str) -> dict:
    stripped = text.strip()
    if stripped.startswith("{") and stripped.endswith("}"):
        return json.loads(stripped)

    fenced = re.search(r"```(?:json)?\s*(\{.*?\})\s*```", stripped, re.DOTALL)
    if fenced:
        return json.loads(fenced.group(1))

    start = stripped.find("{")
    end = stripped.rfind("}")
    if start != -1 and end != -1 and end > start:
        return json.loads(stripped[start : end + 1])

    raise ValueError("no JSON object found in model response")
