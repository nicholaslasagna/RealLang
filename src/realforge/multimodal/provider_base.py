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
class ImageUnderstandingProviderOutput:
    detected_subjects: tuple[str, ...]
    environment_notes: tuple[str, ...]
    composition_notes: tuple[str, ...]
    lighting_notes: tuple[str, ...]
    color_palette_notes: tuple[str, ...]
    material_notes: tuple[str, ...]
    style_notes: tuple[str, ...]
    mood_notes: tuple[str, ...]
    gameplay_relevance: tuple[str, ...]
    asset_opportunities: tuple[str, ...]
    map_design_opportunities: tuple[str, ...]
    risks: tuple[str, ...]
    limitations: tuple[str, ...]
    confidence: float
    semantic_analysis_performed: bool


@dataclass(frozen=True)
class ImageComparisonProviderOutput:
    similarities: tuple[str, ...]
    differences: tuple[str, ...]
    style_consistency_notes: tuple[str, ...]
    asset_pipeline_notes: tuple[str, ...]
    risks: tuple[str, ...]
    limitations: tuple[str, ...]
    confidence: float


@dataclass(frozen=True)
class AssetBriefDraft:
    name: str
    category: str
    purpose: str
    silhouette: str
    materials: tuple[str, ...]
    scale_reference: str
    style_notes: tuple[str, ...]
    gameplay_constraints: tuple[str, ...]
    engine_constraints: tuple[str, ...]
    texture_requirements: tuple[str, ...]
    lod_notes: tuple[str, ...]
    collision_notes: tuple[str, ...]
    animation_notes: tuple[str, ...]
    validation_checklist: tuple[str, ...]


@dataclass(frozen=True)
class ImageToAssetBriefProviderOutput:
    asset_brief: AssetBriefDraft
    inferred_constraints: tuple[str, ...]
    engine_notes: tuple[str, ...]
    modeling_notes: tuple[str, ...]
    texture_notes: tuple[str, ...]
    collision_notes: tuple[str, ...]
    animation_notes: tuple[str, ...]
    risks: tuple[str, ...]
    limitations: tuple[str, ...]


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

    def understand_image(self, request: VisionRequest) -> ImageUnderstandingProviderOutput:
        raise UnsupportedCapabilityError(self.name, "rich image understanding")

    def compare_images(self, request: VisionRequest) -> ImageComparisonProviderOutput:
        raise UnsupportedCapabilityError(self.name, "image comparison")

    def image_to_asset_brief(self, request: VisionRequest) -> ImageToAssetBriefProviderOutput:
        raise UnsupportedCapabilityError(self.name, "image-to-asset-brief planning")
