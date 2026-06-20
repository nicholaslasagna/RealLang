from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass

from realforge.multimodal.models import (
    ImageGenerationRequest,
    ImageIterationPlan,
    ImagePromptSpec,
    MultimodalCapabilities,
    VisionRequest,
)


class MultimodalProviderError(Exception):
    pass


class UnsupportedCapabilityError(MultimodalProviderError):
    def __init__(self, provider: str, capability: str) -> None:
        self.provider = provider
        self.capability = capability
        super().__init__(
            f"multimodal provider {provider!r} does not support {capability}; "
            "run 'realforge multimodal capabilities' to inspect support"
        )


@dataclass(frozen=True)
class VisionProviderOutput:
    observed_elements: tuple[str, ...]
    style_notes: tuple[str, ...]
    likely_use_cases: tuple[str, ...]
    risks: tuple[str, ...]
    limitations: tuple[str, ...]
    confidence: float


@dataclass(frozen=True)
class ImagePromptProviderOutput:
    prompt: str
    negative_prompt: str | None
    style: str
    composition: str
    lighting: str
    camera: str
    materials: tuple[str, ...]
    constraints: tuple[str, ...]
    intended_tool: str | None
    risks: tuple[str, ...]


@dataclass(frozen=True)
class ImageWorkflowRequest:
    task: str
    intended_use: str
    target_style: str
    aspect_ratio: str
    output_count: int


@dataclass(frozen=True)
class ImageJobProviderOutput:
    title: str
    negative_prompt_strategy: tuple[str, ...]
    iteration_plan: ImageIterationPlan
    selection_criteria: tuple[str, ...]
    safety_notes: tuple[str, ...]


@dataclass(frozen=True)
class PromptPackProviderOutput:
    title: str
    variants: tuple[str, ...]
    style_tokens: tuple[str, ...]
    camera_notes: tuple[str, ...]
    lighting_notes: tuple[str, ...]
    material_notes: tuple[str, ...]
    composition_notes: tuple[str, ...]
    engine_use_notes: tuple[str, ...]
    risks: tuple[str, ...]


class MultimodalProvider(ABC):
    """Separate optional adapter interface for multimodal workflows."""

    @property
    @abstractmethod
    def name(self) -> str:
        raise NotImplementedError

    @property
    @abstractmethod
    def model_name(self) -> str | None:
        raise NotImplementedError

    @abstractmethod
    def capabilities(self) -> MultimodalCapabilities:
        raise NotImplementedError

    @abstractmethod
    def analyze_vision(self, request: VisionRequest) -> VisionProviderOutput:
        raise NotImplementedError

    @abstractmethod
    def build_image_prompt(self, request: ImageGenerationRequest) -> ImagePromptProviderOutput:
        raise NotImplementedError

    def embed_text(self, texts: tuple[str, ...]) -> tuple[tuple[float, ...], ...]:
        raise UnsupportedCapabilityError(self.name, "embeddings")

    def build_image_job(
        self,
        request: ImageWorkflowRequest,
        prompt_spec: ImagePromptSpec,
    ) -> ImageJobProviderOutput:
        raise UnsupportedCapabilityError(self.name, "image generation job planning")

    def build_prompt_pack(
        self,
        request: ImageWorkflowRequest,
        prompt_spec: ImagePromptSpec,
    ) -> PromptPackProviderOutput:
        raise UnsupportedCapabilityError(self.name, "image prompt-pack planning")
