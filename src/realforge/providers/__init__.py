from __future__ import annotations

from realforge.config import RealForgeConfig
from realforge.providers.base import ModelProvider
from realforge.providers.mock import MockProvider
from realforge.providers.ollama import OllamaProvider
from realforge.providers.openai_compatible_local import OpenAICompatibleLocalProvider


def get_provider(name: str, config: RealForgeConfig) -> ModelProvider:
    providers = {
        "mock": MockProvider,
        "ollama": OllamaProvider,
        "openai-compatible-local": OpenAICompatibleLocalProvider,
    }
    factory = providers.get(name)
    if factory is None:
        known = ", ".join(sorted(providers))
        raise ValueError(f"unknown provider {name!r}; known: {known}")
    return factory(config)


__all__ = [
    "ModelProvider",
    "MockProvider",
    "OllamaProvider",
    "OpenAICompatibleLocalProvider",
    "get_provider",
]
