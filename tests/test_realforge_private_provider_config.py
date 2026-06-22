from __future__ import annotations

import json
import os
from pathlib import Path

import pytest

from realforge.config import load_config
from realforge.config_file import ConfigFileError
from realforge.doctor import format_doctor_report, run_doctor
from realforge.private_provider_config import (
    CONFIG_FILE_NAME,
    PrivateProviderConfigError,
    build_private_image_provider_status,
    build_private_local_multimodal_status,
    build_private_provider_status,
    format_redacted_provider_status,
    load_private_local_config_bundle,
    load_private_provider_runtime,
    parse_local_endpoint,
    redacted_multimodal_status_to_dict,
    redacted_status_to_dict,
)
from realforge.settings_surface import build_effective_settings, format_settings_json

SECRET_MODEL = "private-runtime-model"
SECRET_API_KEY = "super-secret-local-key"


def _write_private_config(home: Path, *, include_secrets: bool = True) -> None:
    home.mkdir(parents=True, exist_ok=True)
    lines = [
        "[provider]",
        'kind = "openai_compatible_local"',
        'display_name = "Private Local Model"',
        f'model = "{SECRET_MODEL}"' if include_secrets else 'model = "<configured-locally>"',
        'base_url = "http://localhost:8000/v1"',
        'trust = "local_untrusted"',
    ]
    if include_secrets:
        lines.append(f'api_key = "{SECRET_API_KEY}"')
    (home / CONFIG_FILE_NAME).write_text("\n".join(lines) + "\n", encoding="utf-8")


@pytest.fixture
def isolated_home(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> Path:
    home = tmp_path / "home"
    monkeypatch.setenv("HOME", str(home))
    monkeypatch.delenv("USERPROFILE", raising=False)
    return home


def test_missing_private_config_falls_back_to_repo_defaults(isolated_home: Path, tmp_path: Path):
    (tmp_path / ".realforge.toml").write_text(
        '[model]\nprovider = "mock"\nmodel = "mock"\n',
        encoding="utf-8",
    )
    cfg = load_config(tmp_path)
    assert cfg.model.provider == "mock"
    assert cfg.model_identity_redacted is False
    assert cfg.private_provider_status is not None
    assert cfg.private_provider_status.configured is False


def test_valid_private_config_overrides_repo_model(isolated_home: Path, tmp_path: Path):
    _write_private_config(isolated_home)
    (tmp_path / ".realforge.toml").write_text(
        '[model]\nprovider = "mock"\nmodel = "repo-model"\n',
        encoding="utf-8",
    )
    cfg = load_config(tmp_path)
    assert cfg.model.provider == "openai_compatible_local"
    assert cfg.model.model == SECRET_MODEL
    assert cfg.model.base_url == "http://localhost:8000/v1"
    assert cfg.model.api_key == SECRET_API_KEY
    assert cfg.model_identity_redacted is True
    assert cfg.private_provider_status is not None
    assert cfg.private_provider_status.configured is True


def test_env_overrides_private_base_url(isolated_home: Path, tmp_path: Path, monkeypatch: pytest.MonkeyPatch):
    _write_private_config(isolated_home)
    monkeypatch.setenv("REALFORGE_OPENAI_COMPAT_URL", "http://127.0.0.1:9000/v1")
    cfg = load_config(tmp_path)
    assert cfg.model.base_url == "http://127.0.0.1:9000/v1"


def test_api_key_redacted_from_diagnostics(isolated_home: Path, tmp_path: Path):
    _write_private_config(isolated_home)
    cfg = load_config(tmp_path)
    status_text = format_redacted_provider_status(cfg.private_provider_status)
    status_json = json.dumps(redacted_status_to_dict(cfg.private_provider_status))
    doctor_text = format_doctor_report(run_doctor(cfg))
    settings_payload = json.loads(format_settings_json(build_effective_settings(cfg)))

    for blob in (status_text, status_json, doctor_text):
        assert SECRET_API_KEY not in blob
        assert SECRET_MODEL not in blob

    assert SECRET_API_KEY not in json.dumps(settings_payload)
    assert settings_payload["configured_model"] == "<configured locally>"
    assert "api_key" not in status_json
    assert "api_key" not in settings_payload


def test_invalid_private_toml_raises_structured_error(isolated_home: Path, tmp_path: Path):
    isolated_home.mkdir(parents=True)
    (isolated_home / CONFIG_FILE_NAME).write_text("model = [broken", encoding="utf-8")
    with pytest.raises(ConfigFileError, match="invalid"):
        load_config(tmp_path)


def test_invalid_toml_loader_error_code(isolated_home: Path):
    isolated_home.mkdir(parents=True)
    (isolated_home / CONFIG_FILE_NAME).write_text("model = [broken", encoding="utf-8")
    with pytest.raises(PrivateProviderConfigError) as err:
        load_private_provider_runtime(path=isolated_home / CONFIG_FILE_NAME)
    assert err.value.code == "invalid_toml"


def test_trust_defaults_to_local_untrusted(isolated_home: Path):
    _write_private_config(isolated_home)
    runtime = load_private_provider_runtime(path=isolated_home / CONFIG_FILE_NAME)
    assert runtime is not None
    status = build_private_provider_status(runtime)
    assert status.trust == "local_untrusted"


def test_rejects_non_local_endpoint(isolated_home: Path):
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
    runtime = load_private_provider_runtime(path=isolated_home / CONFIG_FILE_NAME)
    assert runtime is not None
    status = build_private_provider_status(runtime)
    assert status.configured is False
    assert status.endpoint_host is None


def test_parse_local_endpoint_accepts_loopback_hosts():
    assert parse_local_endpoint("http://localhost:8000/v1") is not None
    assert parse_local_endpoint("http://127.0.0.1:1234/v1") is not None
    assert parse_local_endpoint("https://example.com/v1") is None


def test_forbidden_identity_strings_not_in_loader_source():
    root = Path(__file__).resolve().parents[1]
    source = (root / "src" / "realforge" / "private_provider_config.py").read_text(encoding="utf-8")
    for forbidden in ("Qwen", "AEON", "DROYD", "FLUX", "qwen", "flux"):
        assert forbidden not in source


def test_optional_image_provider_metadata_parsed_without_execution(isolated_home: Path):
    isolated_home.mkdir(parents=True)
    (isolated_home / CONFIG_FILE_NAME).write_text(
        """
[provider]
kind = "openai_compatible_local"
model = "chat-model"
base_url = "http://localhost:8000/v1"

[image_provider]
kind = "local_image_provider"
display_name = "Private Local Image Model"
base_url = "http://localhost:8188"
api_key = "image-secret-value"
model = "private-image-runtime-name"
model_path = "/private/image/runtime/path"
trust = "local_untrusted"
""".strip()
        + "\n",
        encoding="utf-8",
    )
    bundle = load_private_local_config_bundle(path=isolated_home / CONFIG_FILE_NAME)
    status = build_private_image_provider_status(bundle.image)
    assert status.configured is True
    assert status.future is True
    assert status.execution_enabled is False
    assert status.trust == "local_untrusted"
    redacted = format_redacted_provider_status(build_private_provider_status(bundle.chat))
    assert "chat-model" not in redacted
    payload = json.dumps(
        redacted_multimodal_status_to_dict(build_private_local_multimodal_status(bundle))
    )
    for private_value in (
        "image-secret-value",
        "private-image-runtime-name",
        "/private/image/runtime/path",
        "chat-model",
    ):
        assert private_value not in payload


def test_non_local_image_provider_endpoint_is_rejected(isolated_home: Path):
    isolated_home.mkdir(parents=True)
    (isolated_home / CONFIG_FILE_NAME).write_text(
        """
[image_provider]
kind = "local_image_provider"
base_url = "https://example.com/image"
""".strip()
        + "\n",
        encoding="utf-8",
    )
    bundle = load_private_local_config_bundle(path=isolated_home / CONFIG_FILE_NAME)
    status = build_private_image_provider_status(bundle.image)
    assert status.configured is False
    assert status.endpoint_host is None


def test_legacy_chat_table_remains_supported(isolated_home: Path):
    isolated_home.mkdir(parents=True)
    (isolated_home / CONFIG_FILE_NAME).write_text(
        """
[model]
provider = "openai_compatible_local"
model = "legacy-local-name"
base_url = "http://localhost:8000/v1"
""".strip()
        + "\n",
        encoding="utf-8",
    )
    runtime = load_private_provider_runtime(path=isolated_home / CONFIG_FILE_NAME)
    assert runtime is not None
    assert runtime.configured is True


def test_settings_redacts_private_model_identity(isolated_home: Path, tmp_path: Path):
    _write_private_config(isolated_home)
    cfg = load_config(tmp_path)
    payload = json.loads(format_settings_json(build_effective_settings(cfg)))
    assert payload["configured_model"] == "<configured locally>"
    assert payload["model_identity_redacted"] is True
    assert payload["provider_trust"] == "local_untrusted"
    assert SECRET_MODEL not in json.dumps(payload)
