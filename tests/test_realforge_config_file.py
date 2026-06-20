from pathlib import Path

import pytest

from realforge.config import load_config
from realforge.config_file import ConfigFileError, load_model_settings


def test_load_model_settings_ollama(tmp_path: Path):
    config_path = tmp_path / ".realforge.toml"
    config_path.write_text(
        """
[model]
provider = "ollama"
model = "qwen2.5-coder:32b"
base_url = "http://localhost:11434"
""".strip(),
        encoding="utf-8",
    )
    settings = load_model_settings(config_path, workspace_root=tmp_path)
    assert settings.provider == "ollama"
    assert settings.model == "qwen2.5-coder:32b"
    assert settings.base_url == "http://localhost:11434"


def test_load_model_settings_openai_compatible_local(tmp_path: Path):
    config_path = tmp_path / ".realforge.toml"
    config_path.write_text(
        """
[model]
provider = "openai_compatible_local"
model = "local-coder"
base_url = "http://localhost:1234/v1"
""".strip(),
        encoding="utf-8",
    )
    settings = load_model_settings(config_path, workspace_root=tmp_path)
    assert settings.provider == "openai_compatible_local"
    assert settings.model == "local-coder"
    assert settings.base_url == "http://localhost:1234/v1"


def test_load_config_uses_realforge_toml(tmp_path: Path):
    config_path = tmp_path / ".realforge.toml"
    config_path.write_text(
        """
[model]
provider = "mock"
model = "mock"
""".strip(),
        encoding="utf-8",
    )
    cfg = load_config(tmp_path)
    assert cfg.config_path == config_path
    assert cfg.model.provider == "mock"
    assert cfg.model.model == "mock"


def test_invalid_toml_raises(tmp_path: Path):
    config_path = tmp_path / ".realforge.toml"
    config_path.write_text("model = [", encoding="utf-8")
    with pytest.raises(ConfigFileError):
        load_model_settings(config_path, workspace_root=tmp_path)


def test_rejects_file_url_base(tmp_path: Path):
    config_path = tmp_path / ".realforge.toml"
    config_path.write_text(
        """
[model]
provider = "ollama"
base_url = "file:///etc/passwd"
""".strip(),
        encoding="utf-8",
    )
    with pytest.raises(ConfigFileError, match="HTTP"):
        load_model_settings(config_path, workspace_root=tmp_path)
