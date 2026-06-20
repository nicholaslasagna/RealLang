from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass

from realforge.multimodal.models import (
    ImageGenerationRequest,
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
