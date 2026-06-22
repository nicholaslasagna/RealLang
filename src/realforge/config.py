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
    SchedulerSettings,
    StaffSettings,
    find_config_file,
    load_realforge_settings,
)
from realforge.permissions import PermissionMode
from realforge.private_provider_config import (
    PrivateProviderConfigError,
    PrivateProviderStatus,
    PrivateImageProviderStatus,
    build_private_image_provider_status,
    build_private_provider_status,
    load_private_local_config_bundle,
)


@dataclass(frozen=True)
class RealForgeConfig:
    realc_command: tuple[str, ...]
    backup_suffix: str = ".bak"
    permission_mode: PermissionMode = PermissionMode.READONLY
    workspace_root: Path | None = None
    model: ModelSettings = ModelSettings()
    staff: StaffSettings = StaffSettings()
    improvement: ImprovementSettings = ImprovementSettings()
    scheduler: SchedulerSettings = SchedulerSettings()
    config_path: Path | None = None
    ollama_base_url: str | None = None
    openai_compatible_base_url: str | None = None
    private_provider_status: PrivateProviderStatus | None = None
    private_image_provider_status: PrivateImageProviderStatus | None = None
    model_identity_redacted: bool = False


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
        base_url = ollama_env or base_url
    elif provider in {"openai_compatible_local", "openai-compatible-local"}:
        base_url = openai_env or base_url

    return ModelSettings(
        provider=provider,
        model=model,
        base_url=base_url,
        api_key=file_settings.api_key,
        display_name=file_settings.display_name,
        trust=file_settings.trust,
    )


def _apply_private_provider_settings(
    repo_settings: ModelSettings,
    private_runtime,
) -> tuple[ModelSettings, bool]:
    if private_runtime is None or not private_runtime.configured:
        return repo_settings, False

    return (
        ModelSettings(
            provider=private_runtime.provider or repo_settings.provider,
            model=private_runtime.model,
            base_url=private_runtime.base_url,
            api_key=private_runtime.api_key,
            display_name=private_runtime.display_name,
            trust=private_runtime.trust,
        ),
        True,
    )


def load_config(workspace_root: Path | None = None) -> RealForgeConfig:
    root = (workspace_root or Path.cwd()).resolve()
    config_path = find_config_file(root)
    file_settings = ModelSettings()
    staff_settings = StaffSettings()
    improvement_settings = ImprovementSettings()
    scheduler_settings = SchedulerSettings()
    if config_path is not None:
        file_settings, staff_settings, improvement_settings, scheduler_settings = load_realforge_settings(
            config_path,
            workspace_root=root,
        )

    try:
        private_bundle = load_private_local_config_bundle()
    except PrivateProviderConfigError as err:
        raise ConfigFileError(err.message) from err

    private_runtime = private_bundle.chat
    private_status = build_private_provider_status(private_runtime)
    private_image_status = build_private_image_provider_status(private_bundle.image)
    file_settings, model_identity_redacted = _apply_private_provider_settings(
        file_settings,
        private_runtime,
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
        scheduler=scheduler_settings,
        config_path=config_path,
        ollama_base_url=legacy_ollama,
        openai_compatible_base_url=legacy_openai,
        private_provider_status=private_status,
        private_image_provider_status=private_image_status,
        model_identity_redacted=model_identity_redacted,
    )


def default_config(workspace_root: Path | None = None) -> RealForgeConfig:
    return load_config(workspace_root)
