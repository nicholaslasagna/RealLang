from __future__ import annotations

import json
import os
import subprocess
import sys
import urllib.error
from pathlib import Path

import pytest

from realforge.private_provider_config import CONFIG_FILE_NAME
from realforge.provider_smoke import (
    RESPONSE_PREVIEW_CHARS,
    SMOKE_MAX_TOKENS,
    run_private_provider_smoke,
    format_provider_smoke,
    format_provider_smoke_json,
)
from realforge.providers.smoke_constants import SMOKE_USER_PROMPT
from realforge.provider_status import build_provider_status_report, format_provider_status_json
from realforge.providers.http_util import HTTPProviderError

ROOT = Path(__file__).resolve().parents[1]
SECRET_MODEL = "private-runtime-model"
SECRET_API_KEY = "super-secret-local-key"


def _env() -> dict[str, str]:
    env = os.environ.copy()
    env["PYTHONPATH"] = str(ROOT / "src")
    return env


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


class _FakeResponse:
    def __init__(self, body: bytes) -> None:
        self._body = body

    def read(self, _limit: int) -> bytes:
        return self._body

    def __enter__(self) -> _FakeResponse:
        return self

    def __exit__(self, *_args: object) -> None:
        return None


def _ok_opener(content: str = "OK"):
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


def test_smoke_missing_config_structured_not_configured(isolated_home: Path):
    report = run_private_provider_smoke()
    assert report.ok is False
    assert report.attempted is False
    assert report.status == "not_configured"
    assert report.error is not None
    assert report.error.code == "not_configured"
    payload = json.loads(format_provider_smoke_json(report))
    assert payload["untrusted_output"] is True
    assert payload["attempted"] is False


def test_smoke_valid_config_uses_mocked_http_only(isolated_home: Path):
    _write_private_config(isolated_home)
    opener = _ok_opener("OK")
    report = run_private_provider_smoke(opener=opener)
    assert report.ok is True
    assert report.attempted is True
    assert report.status == "pass"
    assert report.response_preview == "OK"
    assert report.untrusted_output is True
    assert len(opener.captured) == 1
    request = opener.captured[0]
    payload = json.loads(request.data.decode())
    assert payload["messages"] == [{"role": "user", "content": SMOKE_USER_PROMPT}]
    assert payload["max_tokens"] == SMOKE_MAX_TOKENS
    assert SECRET_MODEL in payload["model"]


def test_smoke_never_prints_api_key_or_model_name(isolated_home: Path):
    _write_private_config(isolated_home)
    report = run_private_provider_smoke(opener=_ok_opener("OK"))
    human = format_provider_smoke(report)
    payload = format_provider_smoke_json(report)
    for blob in (human, payload):
        assert SECRET_API_KEY not in blob
        assert SECRET_MODEL not in blob
        assert SMOKE_USER_PROMPT not in blob


def test_smoke_response_preview_capped(isolated_home: Path):
    _write_private_config(isolated_home)
    long_text = "X" * (RESPONSE_PREVIEW_CHARS + 25)
    report = run_private_provider_smoke(opener=_ok_opener(long_text))
    assert report.response_truncated is True
    assert report.response_preview is not None
    assert len(report.response_preview) == RESPONSE_PREVIEW_CHARS


def test_smoke_connection_refused_structured_error(isolated_home: Path):
    _write_private_config(isolated_home)

    def fail_opener(request, timeout=0):
        raise urllib.error.URLError("[Errno 61] Connection refused")

    report = run_private_provider_smoke(opener=fail_opener)
    assert report.ok is False
    assert report.attempted is True
    assert report.status == "fail"
    assert report.error is not None
    assert report.error.code == "connection_failed"
    assert SECRET_API_KEY not in format_provider_smoke_json(report)


def test_smoke_http_error_redacted(isolated_home: Path):
    _write_private_config(isolated_home)

    def fail_opener(request, timeout=0):
        raise urllib.error.HTTPError(
            "http://localhost:8000/v1/chat/completions",
            401,
            "Unauthorized",
            hdrs=None,
            fp=None,
        )

    report = run_private_provider_smoke(opener=fail_opener)
    assert report.error is not None
    assert report.error.code == "http_error"
    assert SECRET_API_KEY not in report.error.message
    assert "HTTP 401" in report.error.message


def test_smoke_invalid_json_structured_error(isolated_home: Path):
    _write_private_config(isolated_home)

    def bad_json_opener(request, timeout=0):
        return _FakeResponse(b"not-json")

    report = run_private_provider_smoke(opener=bad_json_opener)
    assert report.error is not None
    assert report.error.code == "invalid_json"


def test_provider_status_still_redacted(isolated_home: Path, tmp_path: Path):
    _write_private_config(isolated_home)
    status = build_provider_status_report(tmp_path)
    payload = json.loads(format_provider_status_json(status))
    assert payload["api_key_configured"] is True
    assert SECRET_API_KEY not in json.dumps(payload)
    assert SECRET_MODEL not in json.dumps(payload)


def test_smoke_cli_json_missing_home(isolated_home_env: Path, tmp_path: Path):
    proc = subprocess.run(
        [sys.executable, "-m", "realforge.cli", "provider", "smoke", "--json"],
        capture_output=True,
        text=True,
        env={**_env(), "HOME": str(isolated_home_env)},
        cwd=str(tmp_path),
    )
    assert proc.returncode == 1, proc.stderr
    payload = json.loads(proc.stdout)
    assert payload["status"] == "not_configured"
    assert payload["untrusted_output"] is True


def test_forbidden_identity_absent_from_provider_smoke_module():
    source = (ROOT / "src" / "realforge" / "provider_smoke.py").read_text(encoding="utf-8")
    for forbidden in ("Qwen", "AEON", "DROYD", "FLUX", "qwen", "flux"):
        assert forbidden not in source
