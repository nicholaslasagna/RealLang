from __future__ import annotations

from urllib.parse import urljoin

from realforge.config import RealForgeConfig
from realforge.creative.creative_context import (
    STRICT_JSON_SYSTEM_PROMPT,
    build_asset_brief_prompt,
    build_game_brief_prompt,
    build_map_design_prompt,
    build_unreal_plan_prompt,
)
from realforge.planner import AgentPlan, parse_plan_response
from realforge.providers.base import (
    CreativeRequest,
    GenerationResult,
    ImproveRequest,
    ModelProvider,
    PatchProposalRequest,
    PlanRequest,
)
from realforge.errors import ProviderPlanError
from realforge.providers.http_util import HTTPProviderError, post_json
from realforge.providers.prompts import (
    GENERATE_SYSTEM_PROMPT,
    IMPROVE_SYSTEM_PROMPT,
    PATCH_PROPOSAL_SYSTEM_PROMPT,
    PATCH_SYSTEM_PROMPT,
    PLAN_SYSTEM_PROMPT,
    build_improve_user_prompt,
    build_patch_proposal_user_prompt,
    build_patch_user_prompt,
    build_plan_user_prompt,
)
from realforge.self_improvement_plan import SelfImprovementPlan, parse_improvement_plan


class OllamaProvider(ModelProvider):
    """Local Ollama HTTP API adapter."""

    def __init__(self, config: RealForgeConfig) -> None:
        self._config = config
        self._base_url = (config.model.base_url or config.ollama_base_url or "").rstrip("/")
        self._model = config.model.model

    @property
    def name(self) -> str:
        return "ollama"

    @property
    def model_name(self) -> str:
        if not self._model:
            raise RuntimeError("Ollama model is not configured. Set [model].model in .realforge.toml.")
        return self._model

    def _chat(self, system: str, user: str) -> str:
        if not self._base_url:
            raise RuntimeError(
                "Ollama base URL is not configured. Set [model].base_url or REALFORGE_OLLAMA_URL."
            )
        url = urljoin(self._base_url + "/", "api/chat")
        payload = {
            "model": self.model_name,
            "messages": [
                {"role": "system", "content": system},
                {"role": "user", "content": user},
            ],
            "stream": False,
        }
        try:
            data = post_json(url, payload)
        except HTTPProviderError as err:
            raise RuntimeError(str(err)) from err
        message = data.get("message", {})
        content = message.get("content") if isinstance(message, dict) else None
        if not isinstance(content, str) or not content.strip():
            raise RuntimeError("Ollama returned an empty response")
        return content.strip()

    def generate_plan(self, request: PlanRequest) -> AgentPlan:
        user = build_plan_user_prompt(
            task=request.task,
            context=request.context,
            permission_mode=request.permission_mode,
        )
        text = self._chat(PLAN_SYSTEM_PROMPT, user)
        try:
            return parse_plan_response(
                request.task,
                text,
                provider=self.name,
                used_context=request.context is not None,
            )
        except ProviderPlanError:
            raise
        except ValueError as err:
            raise ProviderPlanError(self.name, str(err), raw=text) from err

    def generate_improvement_plan(self, request: ImproveRequest) -> SelfImprovementPlan:
        user = build_improve_user_prompt(area=request.area, context=request.context)
        text = self._chat(IMPROVE_SYSTEM_PROMPT, user)
        try:
            return parse_improvement_plan(text, provider=self.name, area=request.area)
        except ProviderPlanError:
            raise
        except ValueError as err:
            raise ProviderPlanError(self.name, str(err), raw=text) from err

    def generate_patch_proposal(self, request: ImproveRequest, plan: SelfImprovementPlan) -> str:
        import json
        from dataclasses import asdict

        plan_payload = json.dumps(asdict(plan), indent=2)
        user = build_patch_user_prompt(area=request.area, context=request.context, plan_json=plan_payload)
        text = self._chat(PATCH_SYSTEM_PROMPT, user)
        if not text.strip():
            raise ProviderPlanError(self.name, "empty patch proposal", raw=text)
        return text.strip()

    def generate_task_patch_proposal(self, request: PatchProposalRequest):
        user = build_patch_proposal_user_prompt(task=request.task, context=request.context)
        text = self._chat(PATCH_PROPOSAL_SYSTEM_PROMPT, user)
        from realforge.patch_proposal import parse_patch_proposal_payload

        try:
            return parse_patch_proposal_payload(text, provider=self.name, task=request.task)
        except ProviderPlanError:
            raise
        except ValueError as err:
            raise ProviderPlanError(self.name, str(err), raw=text) from err

    def generate(self, task: str) -> GenerationResult:
        user = f"Generate RealLang source code for this task:\n{task}"
        content = self._chat(GENERATE_SYSTEM_PROMPT, user)
        return GenerationResult(
            task=task.strip() or "(empty task)",
            content=content,
            provider=self.name,
            model=self.model_name,
        )

    def generate_game_brief(self, request: CreativeRequest) -> str:
        return self._chat(STRICT_JSON_SYSTEM_PROMPT, build_game_brief_prompt(request.task))

    def generate_map_design(self, request: CreativeRequest) -> str:
        return self._chat(STRICT_JSON_SYSTEM_PROMPT, build_map_design_prompt(request.task))

    def generate_asset_brief(self, request: CreativeRequest) -> str:
        return self._chat(STRICT_JSON_SYSTEM_PROMPT, build_asset_brief_prompt(request.task))

    def generate_unreal_plan(self, request: CreativeRequest) -> str:
        return self._chat(
            STRICT_JSON_SYSTEM_PROMPT,
            build_unreal_plan_prompt(request.task, request.context or "{}"),
        )
