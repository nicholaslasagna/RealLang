from __future__ import annotations

import json
import os
import subprocess
import sys
from pathlib import Path

import pytest

from realforge.private_provider_config import CONFIG_FILE_NAME
from realforge.provider_chat_sandbox import (
    CHAT_SANDBOX_MAX_PROMPT_CHARS,
    CHAT_SANDBOX_MAX_RESPONSE_CHARS,
    run_private_provider_chat_sandbox_stream,
)
from realforge.providers.http_util import HTTPProviderError, stream_sse

ROOT = Path(__file__).resolve().parents[1]

# Generic placeholders — the point is to prove they never leak, not real identities.
SECRET_MODEL = "private-runtime-model-x"
SECRET_API_KEY = "super-secret-local-key-x"


def _write_private_config(home: Path) -> None:
    home.mkdir(parents=True, exist_ok=True)
    (home / CONFIG_FILE_NAME).write_text(
        "\n".join(
            [
                "[provider]",
                'kind = "openai_compatible_local"',
                'display_name = "Private Local Model"',
                f'model = "{SECRET_MODEL}"',
                'base_url = "http://localhost:8000/v1"',
                f'api_key = "{SECRET_API_KEY}"',
                'trust = "local_untrusted"',
            ]
        )
        + "\n",
        encoding="utf-8",
    )


class _FakeStreamResponse:
    """Iterable, closeable stand-in for an SSE HTTP response."""

    def __init__(self, lines: list[bytes]) -> None:
        self._lines = lines
        self.closed = False

    def __iter__(self):
        return iter(self._lines)

    def close(self) -> None:
        self.closed = True


def _sse_opener(deltas: list[str], *, done: bool = True):
    lines: list[bytes] = []
    for delta in deltas:
        chunk = {"choices": [{"delta": {"content": delta}}]}
        lines.append(("data: " + json.dumps(chunk) + "\n").encode("utf-8"))
    lines.append(b": keep-alive comment\n")  # not a data line -> ignored
    if done:
        lines.append(b"data: [DONE]\n")

    def opener(_request, timeout=0):
        return _FakeStreamResponse(lines)

    return opener


def _home_env() -> dict[str, str]:
    env = os.environ.copy()
    env["PYTHONPATH"] = str(ROOT / "src")
    return env


# --- stream_sse ---------------------------------------------------------------

def test_stream_sse_yields_chunks_skips_keepalive_and_stops_at_done():
    opener = _sse_opener(["a", "b"])
    chunks = list(stream_sse("http://localhost:8000/v1/chat/completions", {"stream": True}, opener=opener))
    contents = [c["choices"][0]["delta"]["content"] for c in chunks]
    assert contents == ["a", "b"]


def test_stream_sse_caps_total_bytes():
    big = "x" * 5000
    opener = _sse_opener([big], done=False)
    with pytest.raises(HTTPProviderError) as exc:
        list(stream_sse("http://x/v1/chat/completions", {"stream": True}, opener=opener, max_response_bytes=1024))
    assert exc.value.code == "response_too_large"


# --- streaming sandbox runner -------------------------------------------------

def test_chat_stream_emits_deltas_then_final(isolated_home_env: Path):
    _write_private_config(isolated_home_env)
    events = list(run_private_provider_chat_sandbox_stream("hello", opener=_sse_opener(["Hel", "lo", " there"])))
    deltas = [e for e in events if e["type"] == "delta"]
    finals = [e for e in events if e["type"] == "final"]
    assert "".join(e["text"] for e in deltas) == "Hello there"
    assert len(finals) == 1
    assert finals[0]["ok"] is True
    assert finals[0]["status"] == "pass"
    assert finals[0]["untrusted_output"] is True
    assert finals[0]["response_truncated"] is False
    assert not any(e["type"] == "error" for e in events)


def test_chat_stream_never_leaks_model_or_key(isolated_home_env: Path):
    _write_private_config(isolated_home_env)
    events = list(run_private_provider_chat_sandbox_stream("hi", opener=_sse_opener(["ok"])))
    blob = json.dumps(events)
    assert SECRET_MODEL not in blob
    assert SECRET_API_KEY not in blob
    assert "api_key" not in blob
    assert "base_url" not in blob


def test_chat_stream_caps_response_chars(isolated_home_env: Path):
    _write_private_config(isolated_home_env)
    deltas = ["y" * 300] * 40  # 12000 chars, well over the cap
    events = list(run_private_provider_chat_sandbox_stream("long", opener=_sse_opener(deltas)))
    emitted = sum(len(e["text"]) for e in events if e["type"] == "delta")
    final = next(e for e in events if e["type"] == "final")
    assert emitted <= CHAT_SANDBOX_MAX_RESPONSE_CHARS
    assert final["response_truncated"] is True


def test_chat_stream_not_configured_emits_single_error(isolated_home_env: Path):
    events = list(run_private_provider_chat_sandbox_stream("hello", opener=_sse_opener(["x"])))
    assert len(events) == 1
    assert events[0]["type"] == "error"
    assert events[0]["error"]["code"] == "not_configured"
    assert events[0]["untrusted_output"] is True


def test_chat_stream_rejects_empty_and_too_long(isolated_home_env: Path):
    _write_private_config(isolated_home_env)
    empty = list(run_private_provider_chat_sandbox_stream("   ", opener=_sse_opener(["x"])))
    assert empty[0]["type"] == "error" and empty[0]["status"] == "rejected"

    long_prompt = "z" * (CHAT_SANDBOX_MAX_PROMPT_CHARS + 5)
    too_long = list(run_private_provider_chat_sandbox_stream(long_prompt, opener=_sse_opener(["x"])))
    assert too_long[0]["type"] == "error" and too_long[0]["status"] == "rejected"


def test_chat_stream_midstream_error_is_redacted(isolated_home_env: Path):
    _write_private_config(isolated_home_env)

    def boom_opener(_request, timeout=0):
        raise HTTPProviderError("timeout", "Local provider request timed out.")

    events = list(run_private_provider_chat_sandbox_stream("hi", opener=boom_opener))
    error = next(e for e in events if e["type"] == "error")
    assert error["error"]["code"] == "timeout"
    assert SECRET_API_KEY not in json.dumps(events)


def test_cli_stream_ndjson_not_configured(isolated_home_env: Path):
    # The CLI streaming path emits one JSON object per line; with no config it is a single error line.
    proc = subprocess.run(
        [sys.executable, "-m", "realforge.cli", "provider", "chat-sandbox", "--stdin", "--stream"],
        input="hello there",
        capture_output=True,
        text=True,
        env=_home_env(),
    )
    lines = [line for line in proc.stdout.splitlines() if line.strip()]
    assert len(lines) == 1
    event = json.loads(lines[0])
    assert event["type"] == "error"
    assert event["error"]["code"] == "not_configured"
    assert proc.returncode == 1
