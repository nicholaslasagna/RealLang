from __future__ import annotations

from realforge.config import RealForgeConfig
from realforge.planner import AgentPlan, mock_plan_for_task
from realforge.providers.base import ModelProvider


class MockProvider(ModelProvider):
    """Deterministic provider for tests and offline demos."""

    def __init__(self, config: RealForgeConfig | None = None) -> None:
        self._config = config

    @property
    def name(self) -> str:
        return "mock"

    def generate_plan(self, task: str) -> AgentPlan:
        return mock_plan_for_task(task)
