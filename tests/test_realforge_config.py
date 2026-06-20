import sys
from pathlib import Path

from realforge.config import RealForgeConfig, default_config
from realforge.permissions import PermissionMode


def test_default_config_finds_realc_or_module():
    cfg = default_config()
    assert cfg.realc_command
    assert cfg.permission_mode == PermissionMode.READONLY


def test_config_reads_optional_env(monkeypatch):
    monkeypatch.setenv("REALFORGE_OLLAMA_URL", "http://127.0.0.1:11434")
    monkeypatch.setenv("REALFORGE_OPENAI_COMPAT_URL", "http://127.0.0.1:1234/v1")
    cfg = default_config(Path.cwd())
    assert cfg.ollama_base_url == "http://127.0.0.1:11434"
    assert cfg.openai_compatible_base_url == "http://127.0.0.1:1234/v1"


def test_custom_realc_command():
    cfg = RealForgeConfig(realc_command=(sys.executable, "-m", "reallang.cli"))
    assert cfg.realc_command[-1] == "reallang.cli"
