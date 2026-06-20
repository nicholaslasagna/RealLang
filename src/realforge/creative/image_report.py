from __future__ import annotations

import hashlib
import struct
from pathlib import Path

from realforge.creative.models import ImageAnalysisReport, new_artifact_id, utc_now_iso
from realforge.workspace import WorkspaceError, assert_path_in_workspace


def _sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as source:
        for chunk in iter(lambda: source.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def _basic_metadata(path: Path) -> dict[str, object]:
    metadata: dict[str, object] = {
        "filename": path.name,
        "extension": path.suffix.lower(),
        "size_bytes": path.stat().st_size,
        "semantic_analysis_performed": False,
    }
    with path.open("rb") as source:
        header = source.read(32)
    if header.startswith(b"\x89PNG\r\n\x1a\n") and len(header) >= 24:
        width, height = struct.unpack(">II", header[16:24])
        metadata.update({"format": "png", "width": width, "height": height})
    elif header[:6] in {b"GIF87a", b"GIF89a"} and len(header) >= 10:
        width, height = struct.unpack("<HH", header[6:10])
        metadata.update({"format": "gif", "width": width, "height": height})
    elif header.startswith(b"\xff\xd8\xff"):
        metadata["format"] = "jpeg"
    return metadata


def build_image_analysis_report(
    image_path: Path,
    *,
    workspace_root: Path,
) -> ImageAnalysisReport:
    root = workspace_root.resolve()
    path = image_path.resolve()
    try:
        assert_path_in_workspace(path, root)
    except WorkspaceError as err:
        raise WorkspaceError(f"image read refused outside workspace {root}: {path}") from err
    if not path.is_file():
        raise FileNotFoundError(f"image file not found: {path}")

    relative_path = path.relative_to(root).as_posix()
    return ImageAnalysisReport(
        id=new_artifact_id(),
        created_at=utc_now_iso(),
        image_path=relative_path,
        image_sha256=_sha256_file(path),
        metadata=_basic_metadata(path),
        observed_elements=(),
        style_notes=("Manual notes required; no vision provider is configured.",),
        likely_use_cases=(),
        risks=("Do not infer image content from filename or metadata alone.",),
        limitations=(
            "Vision provider not configured; no semantic image identification was performed.",
            "RealForge 2.1 records metadata and SHA-256 only.",
        ),
        model_used=None,
        untrusted=True,
    )
