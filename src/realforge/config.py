from __future__ import annotations

import os
import shutil
import sys
from dataclasses import dataclass
from pathlib import Path

from realforge.config_file import (
    ConfigFileError,
    ImprovementSettings,
    ModelSettings,
    StaffSettings,
    find_config_file,
    load_realforge_settings,
)
from realforge.permissions import PermissionMode


@dataclass(frozen=True)
class RealForgeConfig:
    realc_command: tuple[str, ...]
    backup_suffix: str = ".bak"
    permission_mode: PermissionMode = PermissionMode.READONLY
    workspace_root: Path | None = None
    model: ModelSettings = ModelSettings()
    staff: StaffSettings = StaffSettings()
    improvement: ImprovementSettings = ImprovementSettings()
    config_path: Path | None = None
    ollama_base_url: str | None = None
    openai_compatible_base_url: str | None = None


def _realc_command() -> tuple[str, ...]:
    realc = shutil.which("realc")
    if realc:
        return (realc,)
    return (sys.executable, "-m", "reallang.cli")


def _merge_model_settings(
    file_settings: ModelSettings,
    *,
    ollama_env: str | None,
    openai_env: str | None,
) -> ModelSettings:
    provider = file_settings.provider
    model = file_settings.model
    base_url = file_settings.base_url

    if provider == "ollama":
        base_url = base_url or ollama_env
    elif provider in {"openai_compatible_local", "openai-compatible-local"}:
        base_url = base_url or openai_env

    return ModelSettings(provider=provider, model=model, base_url=base_url)


def load_config(workspace_root: Path | None = None) -> RealForgeConfig:
    root = (workspace_root or Path.cwd()).resolve()
    config_path = find_config_file(root)
    file_settings = ModelSettings()
    staff_settings = StaffSettings()
    improvement_settings = ImprovementSettings()
    if config_path is not None:
        file_settings, staff_settings, improvement_settings = load_realforge_settings(
            config_path,
            workspace_root=root,
        )

    ollama_env = os.environ.get("REALFORGE_OLLAMA_URL")
    openai_env = os.environ.get("REALFORGE_OPENAI_COMPAT_URL")
    model = _merge_model_settings(file_settings, ollama_env=ollama_env, openai_env=openai_env)

    legacy_ollama = ollama_env or (model.base_url if model.provider == "ollama" else None)
    legacy_openai = openai_env or (
        model.base_url
        if model.provider in {"openai_compatible_local", "openai-compatible-local"}
        else None
    )

    return RealForgeConfig(
        realc_command=_realc_command(),
        workspace_root=root,
        model=model,
        staff=staff_settings,
        improvement=improvement_settings,
        config_path=config_path,
        ollama_base_url=legacy_ollama,
        openai_compatible_base_url=legacy_openai,
    )


def default_config(workspace_root: Path | None = None) -> RealForgeConfig:
    return load_config(workspace_root)
