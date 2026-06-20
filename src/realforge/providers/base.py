from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass

from realforge.permissions import PermissionMode
from realforge.planner import AgentPlan


@dataclass(frozen=True)
class GenerationResult:
    task: str
    content: str
    provider: str
    model: str


@dataclass(frozen=True)
class PlanRequest:
    task: str
    context: str | None = None
    permission_mode: PermissionMode = PermissionMode.READONLY


class ModelProvider(ABC):
    """Local model adapter interface (no cloud providers)."""

    @property
    @abstractmethod
    def name(self) -> str:
        raise NotImplementedError

    @property
    @abstractmethod
    def model_name(self) -> str:
        raise NotImplementedError

    @abstractmethod
    def generate_plan(self, request: PlanRequest) -> AgentPlan:
        raise NotImplementedError

    @abstractmethod
    def generate(self, task: str) -> GenerationResult:
        raise NotImplementedError
