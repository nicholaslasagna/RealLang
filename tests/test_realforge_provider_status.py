from __future__ import annotations

import json
import os
import subprocess
import sys
from pathlib import Path

import pytest

from realforge.config import load_config
from realforge.config_file import ConfigFileError
from realforge.doctor import format_doctor_report, run_doctor
from realforge.private_provider_config import CONFIG_FILE_NAME
from realforge.provider_status import (
    build_provider_status_report,
    format_provider_status,
    format_provider_status_json,
)
from realforge.settings_surface import build_effective_settings, format_settings_json

ROOT = Path(__file__).resolve().parents[1]
SECRET_MODEL = "private-runtime-model"
SECRET_API_KEY = "super-secret-local-key"


def _env() -> dict[str, str]:
    env = os.environ.copy()
    env["PYTHONPATH"] = str(ROOT / "src")
    return env


def _write_private_config(home: Path, *, include_image: bool = False) -> None:
    home.mkdir(parents=True, exist_ok=True)
    lines = [
        "[provider]",
        'kind = "openai_compatible_local"',
        'display_name = "Private Local Model"',
        f'model = "{SECRET_MODEL}"',
        'base_url = "http://localhost:8000/v1"',
        f'api_key = "{SECRET_API_KEY}"',
        'trust = "local_untrusted"',
    ]
    if include_image:
        lines.extend(
            [
                "",
                "[image_provider]",
                'kind = "local_image_provider"',
                'display_name = "Private Local Image Model"',
                'base_url = "http://localhost:8188"',
                'trust = "local_untrusted"',
            ]
        )
    (home / CONFIG_FILE_NAME).write_text("\n".join(lines) + "\n", encoding="utf-8")


@pytest.fixture
def isolated_home(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> Path:
    home = tmp_path / "home"
    monkeypatch.setenv("HOME", str(home))
    monkeypatch.delenv("USERPROFILE", raising=False)
    return home


def test_provider_status_missing_home_config(tmp_path: Path, isolated_home: Path):
    report = build_provider_status_report(tmp_path)
    assert report.ok is True
    assert report.configured is False
    assert report.source == "defaults"
    assert report.provider_kind == "mock"
    assert report.api_key_configured is False
    assert report.image_provider_configured is False


def test_provider_status_valid_private_config_redacted(isolated_home: Path, tmp_path: Path):
    _write_private_config(isolated_home, include_image=True)
    report = build_provider_status_report(tmp_path)
    assert report.ok is True
    assert report.configured is True
    assert report.source == "home_private"
    assert report.provider_kind == "openai_compatible_local"
    assert report.trust == "local_untrusted"
    assert report.endpoint_configured is True
    assert report.endpoint_host == "http://localhost:8000"
    assert report.model_configured is True
    assert report.api_key_configured is True
    assert report.image_provider_configured is True
    assert report.image_provider_kind == "local_image_provider"
    assert report.image_endpoint_host == "http://localhost:8188"
    assert report.image_provider_execution_enabled is False

    human = format_provider_status(report)
    payload = json.loads(format_provider_status_json(report))
    for blob in (human, json.dumps(payload)):
        assert SECRET_API_KEY not in blob
        assert SECRET_MODEL not in blob
    assert "api_key_configured" in human
    assert payload["api_key_configured"] is True
    assert SECRET_API_KEY not in json.dumps(payload)


def test_provider_status_env_override_warning(isolated_home: Path, tmp_path: Path, monkeypatch: pytest.MonkeyPatch):
    _write_private_config(isolated_home)
    monkeypatch.setenv("REALFORGE_OPENAI_COMPAT_URL", "http://127.0.0.1:9000/v1")
    report = build_provider_status_report(tmp_path)
    assert report.source == "home_private"
    assert report.endpoint_host == "http://127.0.0.1:9000"
    assert any("REALFORGE_OPENAI_COMPAT_URL" in warning for warning in report.warnings)


def test_provider_status_invalid_toml_structured_error(isolated_home: Path, tmp_path: Path):
    isolated_home.mkdir(parents=True)
    (isolated_home / CONFIG_FILE_NAME).write_text("model = [broken", encoding="utf-8")
    report = build_provider_status_report(tmp_path)
    assert report.ok is False
    assert report.configured is False
    assert report.errors
    assert report.errors[0].code == "invalid_toml"
    assert SECRET_MODEL not in format_provider_status(report)


def test_provider_status_rejects_non_local_endpoint(isolated_home: Path, tmp_path: Path):
    isolated_home.mkdir(parents=True)
    (isolated_home / CONFIG_FILE_NAME).write_text(
        """
[model]
provider = "openai_compatible_local"
model = "configured"
base_url = "https://example.com/v1"
""".strip()
        + "\n",
        encoding="utf-8",
    )
    report = build_provider_status_report(tmp_path)
    assert report.configured is False
    assert report.endpoint_configured is False
    assert report.endpoint_host is None


def test_invalid_home_config_blocks_load_config(isolated_home: Path, tmp_path: Path):
    isolated_home.mkdir(parents=True)
    (isolated_home / CONFIG_FILE_NAME).write_text("model = [broken", encoding="utf-8")
    with pytest.raises(ConfigFileError):
        load_config(tmp_path)


def test_provider_status_cli_json_missing_home(isolated_home_env: Path, tmp_path: Path):
    proc = subprocess.run(
        [sys.executable, "-m", "realforge.cli", "provider", "status", "--json"],
        capture_output=True,
        text=True,
        env={**_env(), "HOME": str(isolated_home_env)},
        cwd=str(tmp_path),
    )
    assert proc.returncode == 0, proc.stderr
    payload = json.loads(proc.stdout)
    assert payload["configured"] is False
    assert payload["source"] == "defaults"


def test_doctor_and_settings_remain_redacted(isolated_home: Path, tmp_path: Path):
    _write_private_config(isolated_home)
    cfg = load_config(tmp_path)
    doctor_text = format_doctor_report(run_doctor(cfg))
    settings_text = format_settings_json(build_effective_settings(cfg))
    assert SECRET_MODEL not in doctor_text
    assert SECRET_API_KEY not in doctor_text
    assert SECRET_MODEL not in settings_text
    assert "<configured locally>" in settings_text


def test_forbidden_identity_absent_from_provider_status_module():
    source = (ROOT / "src" / "realforge" / "provider_status.py").read_text(encoding="utf-8")
    for forbidden in ("Qwen", "AEON", "DROYD", "FLUX", "qwen", "flux"):
        assert forbidden not in source
