from __future__ import annotations

from realforge.config import RealForgeConfig
from realforge.planner import AgentPlan
from realforge.providers.base import ModelProvider


class OpenAICompatibleLocalProvider(ModelProvider):
    """Scaffold for local OpenAI-compatible servers (LM Studio, llama.cpp, etc.)."""

    def __init__(self, config: RealForgeConfig) -> None:
        self._config = config

    @property
    def name(self) -> str:
        return "openai-compatible-local"

    def generate_plan(self, task: str) -> AgentPlan:
        base = self._config.openai_compatible_base_url
        if not base:
            raise RuntimeError(
                "OpenAI-compatible local server is not configured. "
                "Set REALFORGE_OPENAI_COMPAT_URL."
            )
        raise NotImplementedError(
            "OpenAICompatibleLocalProvider is scaffolded only in RealForge 0.1; "
            "use --provider mock."
        )
