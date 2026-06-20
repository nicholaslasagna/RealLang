from __future__ import annotations

import json

from realforge.config import RealForgeConfig
from realforge.creative.creative_context import (
    mock_asset_brief_payload,
    mock_game_brief_payload,
    mock_map_design_payload,
    mock_unreal_plan_payload,
)
from realforge.planner import AgentPlan, mock_plan_for_task
from realforge.pipeline.prompts import (
    mock_asset_pipeline_payload,
    mock_blender_asset_payload,
    mock_engine_pipeline_payload,
    mock_unreal_import_payload,
)
from realforge.providers.base import (
    CreativeRequest,
    GenerationResult,
    ImproveRequest,
    ModelProvider,
    PatchProposalRequest,
    PlanRequest,
)
from realforge.patch_proposal_report import mock_task_patch_proposal
from realforge.self_improvement_plan import (
    SelfImprovementPlan,
    mock_improvement_plan,
    mock_patch_proposal,
)

_MOCK_GENERATION_OUTPUTS: tuple[tuple[tuple[str, ...], str], ...] = (
    (
        ("hello", "world"),
        "module main;\nfn main() -> i32 {\n  print_str(\"hello\");\n  return 0;\n}\n",
    ),
    (
        ("add", "i32"),
        "module main;\n\nfn add(a: i32, b: i32) -> i32 {\n  return a + b;\n}\n\n"
        "fn main() -> i32 {\n  let x: i32 = 1;\n  let y: i32 = 2;\n  print_i32(add(x, y));\n  return 0;\n}\n",
    ),
    (
        ("while", "loop"),
        "module main;\n\nfn main() -> i32 {\n  var count: i32 = 0;\n  while condition(count < 3) {\n"
        "    set count = count + 1;\n  }\n  print_i32(count);\n  return 0;\n}\n",
    ),
    (
        ("if", "else"),
        "module main;\n\nfn main() -> i32 {\n  let flag: bool = true;\n  if condition(flag) {\n"
        "    print_bool(true);\n  } else {\n    print_bool(false);\n  }\n  return 0;\n}\n",
    ),
)


def _mock_generation_content(task: str) -> str | None:
    lowered = task.lower()
    if "generate" not in lowered:
        return None
    for keywords, content in _MOCK_GENERATION_OUTPUTS:
        if all(keyword in lowered for keyword in keywords):
            return content
    return None


class MockProvider(ModelProvider):
    """Deterministic provider for tests and offline demos."""

    def __init__(self, config: RealForgeConfig | None = None) -> None:
        self._config = config
        self.last_plan_request: PlanRequest | None = None
        self.last_improve_request: ImproveRequest | None = None
        self.last_patch_proposal_request: PatchProposalRequest | None = None

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

    def generate_task_patch_proposal(self, request: PatchProposalRequest):
        self.last_patch_proposal_request = request
        return mock_task_patch_proposal(request.task, provider=self.name)

    def generate(self, task: str) -> GenerationResult:
        normalized = task.strip() or "(empty task)"
        matched = _mock_generation_content(normalized)
        if matched is not None:
            content = matched
        else:
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

    def generate_game_brief(self, request: CreativeRequest) -> str:
        return json.dumps(mock_game_brief_payload(request.task), sort_keys=True)

    def generate_map_design(self, request: CreativeRequest) -> str:
        return json.dumps(mock_map_design_payload(request.task), sort_keys=True)

    def generate_asset_brief(self, request: CreativeRequest) -> str:
        return json.dumps(mock_asset_brief_payload(request.task), sort_keys=True)

    def generate_unreal_plan(self, request: CreativeRequest) -> str:
        return json.dumps(mock_unreal_plan_payload(request.task), sort_keys=True)

    def generate_asset_pipeline(self, request: CreativeRequest) -> str:
        return json.dumps(mock_asset_pipeline_payload(request.task), sort_keys=True)

    def generate_unreal_import_plan(self, request: CreativeRequest) -> str:
        return json.dumps(mock_unreal_import_payload(request.task), sort_keys=True)

    def generate_blender_asset_plan(self, request: CreativeRequest) -> str:
        return json.dumps(mock_blender_asset_payload(request.task), sort_keys=True)

    def generate_engine_pipeline(self, request: CreativeRequest) -> str:
        return json.dumps(mock_engine_pipeline_payload(request.task), sort_keys=True)
