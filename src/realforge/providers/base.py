from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass

from realforge.permissions import PermissionMode
from realforge.planner import AgentPlan
from realforge.self_improvement_plan import SelfImprovementPlan
from realforge.patch_proposal_report import PatchProposal


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


@dataclass(frozen=True)
class PatchProposalRequest:
    task: str
    context: str


@dataclass(frozen=True)
class ImproveRequest:
    area: str
    context: str
    propose_patch: bool = False


@dataclass(frozen=True)
class CreativeRequest:
    task: str
    context: str | None = None


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
    def generate_improvement_plan(self, request: ImproveRequest) -> SelfImprovementPlan:
        raise NotImplementedError

    @abstractmethod
    def generate_patch_proposal(self, request: ImproveRequest, plan: SelfImprovementPlan) -> str:
        raise NotImplementedError

    @abstractmethod
    def generate_task_patch_proposal(self, request: PatchProposalRequest) -> PatchProposal:
        raise NotImplementedError

    @abstractmethod
    def generate(self, task: str) -> GenerationResult:
        raise NotImplementedError

    @abstractmethod
    def generate_game_brief(self, request: CreativeRequest) -> str:
        raise NotImplementedError

    @abstractmethod
    def generate_map_design(self, request: CreativeRequest) -> str:
        raise NotImplementedError

    @abstractmethod
    def generate_asset_brief(self, request: CreativeRequest) -> str:
        raise NotImplementedError

    @abstractmethod
    def generate_unreal_plan(self, request: CreativeRequest) -> str:
        raise NotImplementedError

    @abstractmethod
    def generate_asset_pipeline(self, request: CreativeRequest) -> str:
        raise NotImplementedError

    @abstractmethod
    def generate_unreal_import_plan(self, request: CreativeRequest) -> str:
        raise NotImplementedError

    @abstractmethod
    def generate_blender_asset_plan(self, request: CreativeRequest) -> str:
        raise NotImplementedError

    @abstractmethod
    def generate_engine_pipeline(self, request: CreativeRequest) -> str:
        raise NotImplementedError
