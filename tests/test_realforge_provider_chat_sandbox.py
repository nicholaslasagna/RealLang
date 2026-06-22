from __future__ import annotations

import json
import os
import subprocess
import sys
import urllib.error
from pathlib import Path

import pytest

from realforge.private_provider_config import CONFIG_FILE_NAME
from realforge.provider_chat_sandbox import (
    CHAT_SANDBOX_MAX_PROMPT_CHARS,
    CHAT_SANDBOX_MAX_RESPONSE_CHARS,
    CHAT_SANDBOX_MAX_TOKENS,
    format_provider_chat_sandbox,
    format_provider_chat_sandbox_json,
    run_private_provider_chat_sandbox,
)

ROOT = Path(__file__).resolve().parents[1]
TEST_MODEL = "configured-test-model"
TEST_API_KEY = "test-local-key-value"


def _env() -> dict[str, str]:
    env = os.environ.copy()
    env["PYTHONPATH"] = str(ROOT / "src")
    return env


def _write_config(home: Path) -> None:
    home.mkdir(parents=True, exist_ok=True)
    (home / CONFIG_FILE_NAME).write_text(
        "\n".join(
            [
                "[provider]",
                'kind = "openai_compatible_local"',
                'display_name = "Private Local Model"',
                f'model = "{TEST_MODEL}"',
                'base_url = "http://localhost:8000/v1"',
                f'api_key = "{TEST_API_KEY}"',
                'trust = "local_untrusted"',
            ]
        )
        + "\n",
        encoding="utf-8",
    )


class _FakeResponse:
    def __init__(self, body: bytes) -> None:
        self._body = body

    def read(self, _limit: int) -> bytes:
        return self._body

    def __enter__(self) -> _FakeResponse:
        return self

    def __exit__(self, *_args: object) -> None:
        return None


def _ok_opener(content: str = "Bounded local response"):
    captured: list[object] = []

    def opener(request, timeout=0):
        captured.append(request)
        body = json.dumps({"choices": [{"message": {"content": content}}]}).encode()
        return _FakeResponse(body)

    opener.captured = captured  # type: ignore[attr-defined]
    return opener


@pytest.fixture
def isolated_home(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> Path:
    home = tmp_path / "home"
    monkeypatch.setenv("HOME", str(home))
    monkeypatch.delenv("USERPROFILE", raising=False)
    return home


def test_chat_sandbox_missing_config_is_structured(isolated_home: Path):
    report = run_private_provider_chat_sandbox("Hello")
    assert report.ok is False
    assert report.attempted is False
    assert report.status == "not_configured"
    assert report.input_length == 5
    assert report.untrusted_output is True
    assert report.error is not None
    assert report.error.code == "not_configured"


def test_chat_sandbox_sends_user_text_only_without_tools(isolated_home: Path):
    _write_config(isolated_home)
    prompt = "Explain one bounded local concept."
    opener = _ok_opener()
    report = run_private_provider_chat_sandbox(prompt, opener=opener)

    assert report.ok is True
    assert report.response == "Bounded local response"
    assert report.input_length == len(prompt)
    assert report.untrusted_output is True
    assert len(opener.captured) == 1
    request = opener.captured[0]
    payload = json.loads(request.data.decode())
    assert payload["messages"] == [{"role": "user", "content": prompt}]
    assert payload["max_tokens"] == CHAT_SANDBOX_MAX_TOKENS
    assert "tools" not in payload
    assert "tool_choice" not in payload
    assert all(message["role"] != "system" for message in payload["messages"])


def test_chat_sandbox_report_never_echoes_prompt_or_private_values(isolated_home: Path):
    _write_config(isolated_home)
    prompt = "Text that must not be repeated in report metadata."
    report = run_private_provider_chat_sandbox(prompt, opener=_ok_opener())
    for formatted in (format_provider_chat_sandbox(report), format_provider_chat_sandbox_json(report)):
        assert prompt not in formatted
        assert TEST_MODEL not in formatted
        assert TEST_API_KEY not in formatted


def test_chat_sandbox_rejects_oversized_or_invalid_input_before_provider(isolated_home: Path):
    opener = _ok_opener()
    too_long = run_private_provider_chat_sandbox(
        "X" * (CHAT_SANDBOX_MAX_PROMPT_CHARS + 1),
        opener=opener,
    )
    assert too_long.status == "rejected"
    assert too_long.error is not None
    assert too_long.error.code == "input_too_long"
    assert too_long.attempted is False
    assert opener.captured == []

    invalid = run_private_provider_chat_sandbox("hello\x00world", opener=opener)
    assert invalid.status == "rejected"
    assert invalid.error is not None
    assert invalid.error.code == "invalid_input"
    assert opener.captured == []


def test_chat_sandbox_response_is_capped_and_untrusted(isolated_home: Path):
    _write_config(isolated_home)
    report = run_private_provider_chat_sandbox(
        "Hello",
        opener=_ok_opener("R" * (CHAT_SANDBOX_MAX_RESPONSE_CHARS + 50)),
    )
    assert report.response is not None
    assert len(report.response) == CHAT_SANDBOX_MAX_RESPONSE_CHARS
    assert report.response_truncated is True
    assert report.untrusted_output is True


def test_chat_sandbox_connection_error_is_redacted(isolated_home: Path):
    _write_config(isolated_home)

    def fail_opener(request, timeout=0):
        raise urllib.error.URLError("private transport detail")

    report = run_private_provider_chat_sandbox("Hello", opener=fail_opener)
    assert report.ok is False
    assert report.attempted is True
    assert report.error is not None
    assert report.error.code == "connection_failed"
    serialized = format_provider_chat_sandbox_json(report)
    assert "private transport detail" not in serialized
    assert TEST_API_KEY not in serialized
    assert TEST_MODEL not in serialized


def test_chat_sandbox_cli_requires_stdin_flag(isolated_home: Path, tmp_path: Path):
    proc = subprocess.run(
        [sys.executable, "-m", "realforge.cli", "provider", "chat-sandbox", "--json"],
        input="Hello",
        capture_output=True,
        text=True,
        env={**_env(), "HOME": str(isolated_home)},
        cwd=str(tmp_path),
    )
    assert proc.returncode == 2
    assert "--stdin" in proc.stderr


def test_chat_sandbox_cli_json_missing_config(isolated_home: Path, tmp_path: Path):
    proc = subprocess.run(
        [
            sys.executable,
            "-m",
            "realforge.cli",
            "provider",
            "chat-sandbox",
            "--stdin",
            "--json",
        ],
        input="Hello",
        capture_output=True,
        text=True,
        env={**_env(), "HOME": str(isolated_home)},
        cwd=str(tmp_path),
    )
    assert proc.returncode == 1, proc.stderr
    payload = json.loads(proc.stdout)
    assert payload["status"] == "not_configured"
    assert payload["input_length"] == 5
    assert payload["untrusted_output"] is True
    assert "Hello" not in proc.stdout


def test_forbidden_identity_absent_from_chat_sandbox_module():
    source = (ROOT / "src" / "realforge" / "provider_chat_sandbox.py").read_text(
        encoding="utf-8"
    ).lower()
    for forbidden in ("qw" + "en", "ae" + "on", "dr" + "oyd", "fl" + "ux"):
        assert forbidden not in source
