from __future__ import annotations

import json
from dataclasses import asdict

from realforge.config import RealForgeConfig
from realforge.multimodal.mock import MockMultimodalProvider
from realforge.multimodal.models import (
    ImageGenerationRequest,
    MultimodalCapabilities,
    VisionRequest,
)
from realforge.multimodal.provider_base import (
    ImagePromptProviderOutput,
    MultimodalProvider,
    UnsupportedCapabilityError,
    VisionProviderOutput,
)
from realforge.providers import normalize_provider_name


class TextOnlyMultimodalProvider(MultimodalProvider):
    """Capability descriptor for existing providers without multimodal adapters."""

    def __init__(self, provider: str, model: str | None) -> None:
        self._provider = provider
        self._model = model

    @property
    def name(self) -> str:
        return self._provider

    @property
    def model_name(self) -> str | None:
        return self._model

    def capabilities(self) -> MultimodalCapabilities:
        return MultimodalCapabilities(
            provider=self.name,
            model=self.model_name,
            supports_text=True,
            supports_vision=False,
            supports_image_generation=False,
            supports_embeddings=False,
            max_images=None,
            max_image_bytes=None,
            notes=(
                "Existing text provider has no RealForge multimodal adapter in 2.3.",
                "No network request is made by capability inspection.",
            ),
            experimental=True,
        )

    def analyze_vision(self, request: VisionRequest) -> VisionProviderOutput:
        raise UnsupportedCapabilityError(self.name, "vision")

    def build_image_prompt(self, request: ImageGenerationRequest) -> ImagePromptProviderOutput:
        raise UnsupportedCapabilityError(self.name, "image generation workflow output")


def get_multimodal_provider(
    name: str,
    config: RealForgeConfig,
) -> MultimodalProvider:
    normalized = normalize_provider_name(name)
    if normalized == "mock":
        return MockMultimodalProvider()
    return TextOnlyMultimodalProvider(normalized, config.model.model)


def resolve_multimodal_provider(
    config: RealForgeConfig,
    override: str | None = None,
) -> MultimodalProvider:
    return get_multimodal_provider(override or config.model.provider, config)


def format_multimodal_capabilities_json(capabilities: MultimodalCapabilities) -> str:
    return json.dumps(asdict(capabilities), indent=2, sort_keys=True)


def format_multimodal_capabilities(capabilities: MultimodalCapabilities) -> str:
    def status(enabled: bool) -> str:
        return "AVAILABLE" if enabled else "UNSUPPORTED"

    lines = [
        "REALFORGE MULTIMODAL CAPABILITIES",
        "Status: EXPERIMENTAL",
        f"Provider: {capabilities.provider}",
        f"Model: {capabilities.model or '(not configured)'}",
        "Network calls during inspection: none",
        "",
        f"Text: {status(capabilities.supports_text)}",
        f"Vision: {status(capabilities.supports_vision)}",
        f"Image generation workflow: {status(capabilities.supports_image_generation)}",
        f"Embeddings: {status(capabilities.supports_embeddings)}",
        f"Maximum images: {capabilities.max_images if capabilities.max_images is not None else '(unspecified)'}",
        f"Maximum image bytes: {capabilities.max_image_bytes if capabilities.max_image_bytes is not None else '(unspecified)'}",
        "",
        "Notes",
    ]
    lines.extend(f"  - {note}" for note in capabilities.notes)
    lines.extend(("", "Next: use only a capability reported as AVAILABLE."))
    return "\n".join(lines)
