from __future__ import annotations

from realforge.config import RealForgeConfig
from realforge.planner import AgentPlan, mock_plan_for_task
from realforge.providers.base import GenerationResult, ModelProvider, PlanRequest


class MockProvider(ModelProvider):
    """Deterministic provider for tests and offline demos."""

    def __init__(self, config: RealForgeConfig | None = None) -> None:
        self._config = config
        self.last_plan_request: PlanRequest | None = None

    @property
    def name(self) -> str:
        return "mock"

    @property
    def model_name(self) -> str:
        return "mock"

    def generate_plan(self, request: PlanRequest) -> AgentPlan:
        self.last_plan_request = request
        return mock_plan_for_task(request.task, context=request.context)

    def generate(self, task: str) -> GenerationResult:
        normalized = task.strip() or "(empty task)"
        content = (
            "module main;\n"
            "fn main() -> i32 {\n"
            f"  print_str(\"mock generate: {normalized}\");\n"
            "  return 0;\n"
            "}\n"
        )
        return GenerationResult(
            task=normalized,
            content=content,
            provider=self.name,
            model=self.model_name,
        )
