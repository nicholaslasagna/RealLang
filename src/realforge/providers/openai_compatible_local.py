from __future__ import annotations

from collections.abc import Callable
from typing import Any
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
from realforge.pipeline.prompts import (
    PIPELINE_JSON_SYSTEM_PROMPT,
    build_asset_pipeline_prompt,
    build_blender_asset_prompt,
    build_engine_pipeline_prompt,
    build_unreal_import_prompt,
)
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
from realforge.providers.smoke_constants import SMOKE_USER_PROMPT
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


class OpenAICompatibleLocalProvider(ModelProvider):
    """HTTP adapter for a user-configured OpenAI-compatible local provider."""

    def __init__(self, config: RealForgeConfig) -> None:
        self._config = config
        self._base_url = (
            config.model.base_url or config.openai_compatible_base_url or ""
        ).rstrip("/")
        self._model = config.model.model
        self._api_key = config.model.api_key

    @property
    def name(self) -> str:
        return "openai_compatible_local"

    @property
    def model_name(self) -> str:
        if not self._model:
            raise RuntimeError(
                "Local OpenAI-compatible model is not configured. "
                "Set [model].model in .realforge.toml."
            )
        return self._model

    def _request_chat(
        self,
        system: str | None,
        user: str,
        *,
        timeout: float = 120.0,
        max_tokens: int | None = None,
        opener: Callable[..., Any] | None = None,
        max_response_bytes: int = 2 * 1024 * 1024,
    ) -> str:
        if not self._base_url:
            raise HTTPProviderError(
                "not_configured",
                "OpenAI-compatible local provider endpoint is not configured.",
            )
        url = urljoin(self._base_url + "/", "chat/completions")
        messages = []
        if system:
            messages.append({"role": "system", "content": system})
        messages.append({"role": "user", "content": user})
        payload = {
            "model": self.model_name,
            "messages": messages,
            "stream": False,
        }
        if max_tokens is not None:
            payload["max_tokens"] = max_tokens
        headers: dict[str, str] = {}
        if self._api_key:
            headers["Authorization"] = f"Bearer {self._api_key}"
        data = post_json(
            url,
            payload,
            timeout=timeout,
            extra_headers=headers,
            opener=opener,
            max_response_bytes=max_response_bytes,
        )
        choices = data.get("choices", [])
        if not choices or not isinstance(choices, list):
            raise HTTPProviderError(
                "invalid_response",
                "Local provider returned no chat choices.",
            )
        message = choices[0].get("message", {}) if isinstance(choices[0], dict) else {}
        content = message.get("content") if isinstance(message, dict) else None
        if not isinstance(content, str) or not content.strip():
            raise HTTPProviderError(
                "invalid_response",
                "Local provider returned an empty chat response.",
            )
        return content.strip()

    def _chat(self, system: str, user: str) -> str:
        try:
            return self._request_chat(system, user)
        except HTTPProviderError as err:
            raise RuntimeError(err.message) from err

    def smoke_chat(
        self,
        *,
        opener: Callable[..., Any] | None = None,
        timeout: float = 5.0,
        max_tokens: int = 4,
    ) -> str:
        """Run the fixed, bounded CLI smoke request without workspace context or tools."""
        return self._request_chat(
            None,
            SMOKE_USER_PROMPT,
            timeout=min(max(timeout, 0.1), 5.0),
            max_tokens=min(max(max_tokens, 1), 4),
            opener=opener,
            max_response_bytes=32 * 1024,
        )

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

    def generate_asset_pipeline(self, request: CreativeRequest) -> str:
        return self._chat(
            PIPELINE_JSON_SYSTEM_PROMPT,
            build_asset_pipeline_prompt(request.task, request.context or "{}"),
        )

    def generate_unreal_import_plan(self, request: CreativeRequest) -> str:
        return self._chat(
            PIPELINE_JSON_SYSTEM_PROMPT,
            build_unreal_import_prompt(request.task, request.context or "{}"),
        )

    def generate_blender_asset_plan(self, request: CreativeRequest) -> str:
        return self._chat(PIPELINE_JSON_SYSTEM_PROMPT, build_blender_asset_prompt(request.task))

    def generate_engine_pipeline(self, request: CreativeRequest) -> str:
        return self._chat(
            PIPELINE_JSON_SYSTEM_PROMPT,
            build_engine_pipeline_prompt(request.task, request.context or "{}"),
        )
