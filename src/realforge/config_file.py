from __future__ import annotations

import tomllib
from dataclasses import dataclass
from pathlib import Path


class ConfigFileError(Exception):
    pass


@dataclass(frozen=True)
class ModelSettings:
    provider: str = "mock"
    model: str | None = None
    base_url: str | None = None


def find_config_file(workspace_root: Path) -> Path | None:
    root = workspace_root.resolve()
    path = root / ".realforge.toml"
    if not path.is_file():
        return None
    try:
        path.resolve().relative_to(root)
    except ValueError as err:
        raise ConfigFileError(f"config file must live inside workspace root: {path}") from err
    return path


def load_model_settings(path: Path, *, workspace_root: Path) -> ModelSettings:
    try:
        path.resolve().relative_to(workspace_root.resolve())
    except ValueError as err:
        raise ConfigFileError(
            f"refusing to load config outside workspace root: {path}"
        ) from err

    try:
        data = tomllib.loads(path.read_text(encoding="utf-8"))
    except tomllib.TOMLDecodeError as err:
        raise ConfigFileError(f"invalid TOML in {path}: {err}") from err

    section = data.get("model")
    if section is None:
        return ModelSettings()

    if not isinstance(section, dict):
        raise ConfigFileError("[model] must be a table")

    provider = section.get("provider", "mock")
    if not isinstance(provider, str) or not provider.strip():
        raise ConfigFileError("[model].provider must be a non-empty string")

    model = section.get("model")
    if model is not None and not isinstance(model, str):
        raise ConfigFileError("[model].model must be a string")

    base_url = section.get("base_url")
    if base_url is not None and not isinstance(base_url, str):
        raise ConfigFileError("[model].base_url must be a string")

    normalized_provider = provider.strip()
    normalized_model = model.strip() if isinstance(model, str) and model.strip() else None
    normalized_base_url = (
        base_url.strip() if isinstance(base_url, str) and base_url.strip() else None
    )

    if normalized_base_url and normalized_base_url.startswith("file:"):
        raise ConfigFileError("[model].base_url must be an HTTP(S) endpoint, not a file URL")

    return ModelSettings(
        provider=normalized_provider,
        model=normalized_model,
        base_url=normalized_base_url,
    )
