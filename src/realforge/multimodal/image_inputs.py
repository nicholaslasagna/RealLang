from __future__ import annotations

import hashlib
import struct
from pathlib import Path

from realforge.multimodal.models import ImageInput
from realforge.workspace import WorkspaceError, assert_path_in_workspace


DEFAULT_MAX_IMAGE_BYTES = 8 * 1024 * 1024


class ImageInputError(Exception):
    pass


def _sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as source:
        for chunk in iter(lambda: source.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def _inspect_header(path: Path) -> tuple[str, int | None, int | None, dict[str, object]]:
    with path.open("rb") as source:
        header = source.read(32)

    metadata: dict[str, object] = {
        "filename": path.name,
        "extension": path.suffix.lower(),
        "semantic_analysis_performed": False,
    }
    if header.startswith(b"\x89PNG\r\n\x1a\n") and len(header) >= 24:
        width, height = struct.unpack(">II", header[16:24])
        metadata["format"] = "png"
        return "image/png", width, height, metadata
    if header[:6] in {b"GIF87a", b"GIF89a"} and len(header) >= 10:
        width, height = struct.unpack("<HH", header[6:10])
        metadata["format"] = "gif"
        return "image/gif", width, height, metadata
    if header.startswith(b"\xff\xd8\xff"):
        metadata["format"] = "jpeg"
        return "image/jpeg", None, None, metadata
    if header.startswith(b"RIFF") and len(header) >= 12 and header[8:12] == b"WEBP":
        metadata["format"] = "webp"
        return "image/webp", None, None, metadata
    raise ImageInputError(
        "unsupported image format; RealForge accepts PNG, GIF, JPEG, or WebP inputs"
    )


def load_image_input(
    image_path: Path,
    *,
    workspace_root: Path,
    max_image_bytes: int = DEFAULT_MAX_IMAGE_BYTES,
) -> ImageInput:
    if max_image_bytes <= 0:
        raise ValueError("max_image_bytes must be positive")
    root = workspace_root.resolve()
    path = image_path.resolve()
    try:
        assert_path_in_workspace(path, root)
    except WorkspaceError as err:
        raise ImageInputError(f"image input refused outside workspace {root}: {path}") from err
    if not path.exists():
        raise ImageInputError(f"image input not found: {path}")
    if not path.is_file():
        raise ImageInputError(f"image input must be a regular file: {path}")

    size = path.stat().st_size
    if size > max_image_bytes:
        raise ImageInputError(
            f"image input exceeds provider limit: {size} bytes > {max_image_bytes} bytes"
        )
    media_type, width, height, metadata = _inspect_header(path)
    relative = path.relative_to(root).as_posix()
    metadata["size_bytes"] = size
    return ImageInput(
        path=str(path),
        sha256=_sha256_file(path),
        size_bytes=size,
        media_type=media_type,
        width=width,
        height=height,
        metadata=metadata,
        workspace_relative_path=relative,
    )
