from __future__ import annotations

from realforge.config import RealForgeConfig
from realforge.planner import AgentPlan
from realforge.providers.base import ModelProvider


class OllamaProvider(ModelProvider):
    """Scaffold for local Ollama HTTP API (not required for v0.1 tests)."""

    def __init__(self, config: RealForgeConfig) -> None:
        self._config = config

    @property
    def name(self) -> str:
        return "ollama"

    def generate_plan(self, task: str) -> AgentPlan:
        base = self._config.ollama_base_url
        if not base:
            raise RuntimeError(
                "Ollama is not configured. Set REALFORGE_OLLAMA_URL or pass --ollama-url."
            )
        raise NotImplementedError(
            "OllamaProvider is scaffolded only in RealForge 0.1; use --provider mock."
        )
