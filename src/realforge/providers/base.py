from __future__ import annotations

from abc import ABC, abstractmethod

from realforge.planner import AgentPlan


class ModelProvider(ABC):
    """Local model adapter interface (no cloud providers in v0.1)."""

    @property
    @abstractmethod
    def name(self) -> str:
        raise NotImplementedError

    @abstractmethod
    def generate_plan(self, task: str) -> AgentPlan:
        raise NotImplementedError
