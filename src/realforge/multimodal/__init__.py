"""Multimodal provider interfaces and safe report scaffolding."""

from realforge.multimodal.models import (
    ImageGenerationJob,
    ImageGenerationRequest,
    ImageInput,
    ImageComparisonReport,
    ImageIterationPlan,
    ImageProvenanceRecord,
    ImagePromptSpec,
    ImageReferenceBoard,
    ImageToAssetBriefReport,
    ImageUnderstandingReport,
    MultimodalCapabilities,
    PromptPack,
    VisionAnalysis,
    VisionRequest,
)
from realforge.multimodal.provider_base import (
    MultimodalProvider,
    UnsupportedCapabilityError,
)

__all__ = [
    "ImageGenerationRequest",
    "ImageGenerationJob",
    "ImageComparisonReport",
    "ImageInput",
    "ImageIterationPlan",
    "ImageProvenanceRecord",
    "ImagePromptSpec",
    "ImageReferenceBoard",
    "ImageToAssetBriefReport",
    "ImageUnderstandingReport",
    "MultimodalCapabilities",
    "MultimodalProvider",
    "PromptPack",
    "UnsupportedCapabilityError",
    "VisionAnalysis",
    "VisionRequest",
]
