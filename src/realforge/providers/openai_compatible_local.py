from __future__ import annotations

from urllib.parse import urljoin

from realforge.config import RealForgeConfig
from realforge.planner import AgentPlan, parse_plan_response
from realforge.providers.base import GenerationResult, ModelProvider, PlanRequest
from realforge.errors import ProviderPlanError
from realforge.providers.http_util import HTTPProviderError, post_json
from realforge.providers.prompts import GENERATE_SYSTEM_PROMPT, PLAN_SYSTEM_PROMPT, build_plan_user_prompt


class OpenAICompatibleLocalProvider(ModelProvider):
    """Local OpenAI-compatible HTTP adapter (LM Studio, llama.cpp server, etc.)."""

    def __init__(self, config: RealForgeConfig) -> None:
        self._config = config
        self._base_url = (
            config.model.base_url or config.openai_compatible_base_url or ""
        ).rstrip("/")
        self._model = config.model.model

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

    def _chat(self, system: str, user: str) -> str:
        if not self._base_url:
            raise RuntimeError(
                "OpenAI-compatible base URL is not configured. "
                "Set [model].base_url or REALFORGE_OPENAI_COMPAT_URL."
            )
        url = urljoin(self._base_url + "/", "chat/completions")
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
        choices = data.get("choices", [])
        if not choices or not isinstance(choices, list):
            raise RuntimeError("OpenAI-compatible server returned no choices")
        message = choices[0].get("message", {}) if isinstance(choices[0], dict) else {}
        content = message.get("content") if isinstance(message, dict) else None
        if not isinstance(content, str) or not content.strip():
            raise RuntimeError("OpenAI-compatible server returned an empty response")
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

    def generate(self, task: str) -> GenerationResult:
        user = f"Generate RealLang source code for this task:\n{task}"
        content = self._chat(GENERATE_SYSTEM_PROMPT, user)
        return GenerationResult(
            task=task.strip() or "(empty task)",
            content=content,
            provider=self.name,
            model=self.model_name,
        )
