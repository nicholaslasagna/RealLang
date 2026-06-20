from __future__ import annotations

from urllib.parse import urljoin

from realforge.config import RealForgeConfig
from realforge.providers.base import GenerationResult
from realforge.planner import AgentPlan, parse_plan_response
from realforge.providers.base import ModelProvider
from realforge.providers.http_util import HTTPProviderError, post_json
from realforge.providers.prompts import GENERATE_SYSTEM_PROMPT, PLAN_SYSTEM_PROMPT


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

    def generate_plan(self, task: str) -> AgentPlan:
        user = f"Create a repair plan for this RealLang task:\n{task}"
        text = self._chat(PLAN_SYSTEM_PROMPT, user)
        try:
            return parse_plan_response(task, text)
        except ValueError as err:
            raise RuntimeError(f"failed to parse Ollama plan JSON: {err}") from err

    def generate(self, task: str) -> GenerationResult:
        user = f"Generate RealLang source code for this task:\n{task}"
        content = self._chat(GENERATE_SYSTEM_PROMPT, user)
        return GenerationResult(
            task=task.strip() or "(empty task)",
            content=content,
            provider=self.name,
            model=self.model_name,
        )
