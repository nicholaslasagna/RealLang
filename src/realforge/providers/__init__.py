from __future__ import annotations

from realforge.config import RealForgeConfig
from realforge.providers.base import ModelProvider
from realforge.providers.mock import MockProvider
from realforge.providers.ollama import OllamaProvider
from realforge.providers.openai_compatible_local import OpenAICompatibleLocalProvider

_PROVIDER_ALIASES = {
    "mock": "mock",
    "ollama": "ollama",
    "openai_compatible_local": "openai_compatible_local",
    "openai-compatible-local": "openai_compatible_local",
}

_FACTORIES = {
    "mock": MockProvider,
    "ollama": OllamaProvider,
    "openai_compatible_local": OpenAICompatibleLocalProvider,
}


def normalize_provider_name(name: str) -> str:
    key = name.strip().lower()
    if key not in _PROVIDER_ALIASES:
        known = ", ".join(sorted(_FACTORIES))
        raise ValueError(f"unknown provider {name!r}; known: {known}")
    return _PROVIDER_ALIASES[key]


def get_provider(name: str, config: RealForgeConfig) -> ModelProvider:
    normalized = normalize_provider_name(name)
    return _FACTORIES[normalized](config)


def resolve_provider(config: RealForgeConfig, override: str | None = None) -> ModelProvider:
    name = override or config.model.provider
    return get_provider(name, config)


__all__ = [
    "ModelProvider",
    "MockProvider",
    "OllamaProvider",
    "OpenAICompatibleLocalProvider",
    "get_provider",
    "normalize_provider_name",
    "resolve_provider",
]
