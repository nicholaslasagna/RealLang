from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import TYPE_CHECKING

from realforge.config import RealForgeConfig, default_config
from realforge.patcher import write_text_with_backup
from realforge.permissions import PermissionError, Permissions
from realforge.providers.base import GenerationResult

if TYPE_CHECKING:
    from realforge.providers.base import ModelProvider


@dataclass(frozen=True)
class GenerateOutcome:
    result: GenerationResult
    dry_run: bool
    output: Path | None
    backup: Path | None
    message: str


def format_generation(result: GenerationResult, *, dry_run: bool) -> str:
    mode = "dry-run" if dry_run else "apply"
    lines = [
        f"RealForge generate ({mode})",
        f"Task: {result.task}",
        f"Provider: {result.provider}",
        f"Model: {result.model}",
        "",
        "--- generated ---",
        result.content.rstrip(),
        "--- end ---",
    ]
    return "\n".join(lines)


def run_generate(
    task: str,
    provider: ModelProvider,
    *,
    dry_run: bool = True,
    output: Path | None = None,
    config: RealForgeConfig | None = None,
    permissions: Permissions | None = None,
) -> GenerateOutcome:
    cfg = config or default_config()
    perms = permissions or Permissions(mode=cfg.permission_mode, workspace_root=cfg.workspace_root)
    result = provider.generate(task)
    message = format_generation(result, dry_run=dry_run)

    if dry_run:
        return GenerateOutcome(
            result=result,
            dry_run=True,
            output=output,
            backup=None,
            message=message,
        )

    if output is None:
        raise ValueError("generate --apply requires --output <file.real>")

    try:
        backup = write_text_with_backup(
            output,
            result.content,
            suffix=cfg.backup_suffix,
            permissions=perms,
        )
    except PermissionError as err:
        raise PermissionError(str(err)) from err

    msg = message + f"\n\nwritten: {output}"
    if backup is not None:
        msg += f"\nbackup: {backup}"
    return GenerateOutcome(
        result=result,
        dry_run=False,
        output=output,
        backup=backup,
        message=msg,
    )
