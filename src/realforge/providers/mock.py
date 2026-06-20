from __future__ import annotations

from realforge.config import RealForgeConfig
from realforge.planner import AgentPlan, mock_plan_for_task
from realforge.providers.base import GenerationResult, ImproveRequest, ModelProvider, PlanRequest
from realforge.self_improvement_plan import (
    SelfImprovementPlan,
    mock_improvement_plan,
    mock_patch_proposal,
    parse_improvement_plan,
)


class MockProvider(ModelProvider):
    """Deterministic provider for tests and offline demos."""

    def __init__(self, config: RealForgeConfig | None = None) -> None:
        self._config = config
        self.last_plan_request: PlanRequest | None = None
        self.last_improve_request: ImproveRequest | None = None

    @property
    def name(self) -> str:
        return "mock"

    @property
    def model_name(self) -> str:
        return "mock"

    def generate_plan(self, request: PlanRequest) -> AgentPlan:
        self.last_plan_request = request
        return mock_plan_for_task(request.task, context=request.context)

    def generate_improvement_plan(self, request: ImproveRequest) -> SelfImprovementPlan:
        self.last_improve_request = request
        return mock_improvement_plan(request.area)

    def generate_patch_proposal(self, request: ImproveRequest, plan: SelfImprovementPlan) -> str:
        self.last_improve_request = request
        return mock_patch_proposal(plan.area)

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
