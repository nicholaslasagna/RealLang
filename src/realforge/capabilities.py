from __future__ import annotations

import json
from dataclasses import asdict, dataclass

from realforge.config import RealForgeConfig


CAPABILITY_STATUSES = frozenset({"available", "planned", "experimental", "staff-only"})


@dataclass(frozen=True)
class Capability:
    domain: str
    status: str
    safety_level: str
    commands: tuple[str, ...]
    writes_files: bool
    requires_staff: bool
    requires_network: bool
    description: str
    next_suggested_command: str


@dataclass(frozen=True)
class CapabilityRegistry:
    platform: str
    trust_model: str
    capabilities: tuple[Capability, ...]
    staff_mode_enabled: bool


def build_capability_registry(config: RealForgeConfig) -> CapabilityRegistry:
    staff_enabled = config.staff.enabled
    scheduler_commands: tuple[str, ...] = ()
    if staff_enabled:
        scheduler_commands = ("realforge scheduler-status",)
        if config.scheduler.enabled:
            scheduler_commands += ("realforge scheduler-run --dry-run",)
    capabilities = (
        Capability(
            domain="code",
            status="available",
            safety_level="compiler-guided",
            commands=(
                "realforge ask --task <task>",
                "realforge plan --task <task>",
                "realforge check <file.real>",
                "realforge repair <file.real> --dry-run",
            ),
            writes_files=True,
            requires_staff=False,
            requires_network=False,
            description="Repository planning, RealLang diagnostics, conservative repairs, and validation.",
            next_suggested_command='realforge ask --task "describe the next engineering task"',
        ),
        Capability(
            domain="docs",
            status="experimental",
            safety_level="dry-run-first",
            commands=(
                "realforge plan --task <documentation task>",
                "realforge improve --area docs --dry-run",
            ),
            writes_files=False,
            requires_staff=False,
            requires_network=False,
            description="Structured documentation planning through the general provider and improvement loops.",
            next_suggested_command='realforge plan --task "review project documentation"',
        ),
        Capability(
            domain="research",
            status="experimental",
            safety_level="network-gated",
            commands=("realforge research --url <https-url> --allow-domain <domain>",),
            writes_files=True,
            requires_staff=False,
            requires_network=True,
            description="Explicit allowlisted HTTPS research saved as untrusted snapshots.",
            next_suggested_command="realforge research-list",
        ),
        Capability(
            domain="creative",
            status="experimental",
            safety_level="planning-only",
            commands=(
                "realforge creative brief --task <task>",
                "realforge creative map --task <task>",
            ),
            writes_files=True,
            requires_staff=False,
            requires_network=False,
            description="Game, world, and creative briefs as untrusted structured planning artifacts.",
            next_suggested_command='realforge creative brief --task "describe a project concept"',
        ),
        Capability(
            domain="image",
            status="experimental",
            safety_level="prompt-spec-only",
            commands=(
                "realforge creative image --image <workspace-path>",
                "realforge image prompt --task <task>",
            ),
            writes_files=True,
            requires_staff=False,
            requires_network=False,
            description="Image metadata plus untrusted prompt specifications; no binary generation.",
            next_suggested_command='realforge image prompt --task "describe an image workflow"',
        ),
        Capability(
            domain="vision",
            status="experimental",
            safety_level="untrusted-provider-output",
            commands=("realforge vision analyze --image <workspace-path> --task <task>",),
            writes_files=True,
            requires_staff=False,
            requires_network=False,
            description="Optional provider-backed vision reports; mock mode performs no semantic recognition.",
            next_suggested_command="realforge multimodal capabilities",
        ),
        Capability(
            domain="engine",
            status="experimental",
            safety_level="dry-run-only",
            commands=(
                "realforge engine scan --path <project>",
                "realforge unreal plan --path <project> --task <task>",
            ),
            writes_files=True,
            requires_staff=False,
            requires_network=False,
            description="Engine-aware detection and planning without direct project mutation.",
            next_suggested_command="realforge engine scan --path <project>",
        ),
        Capability(
            domain="assets",
            status="experimental",
            safety_level="planning-only",
            commands=("realforge creative asset --task <task>",),
            writes_files=True,
            requires_staff=False,
            requires_network=False,
            description="Asset briefs and future pipeline plans; no binary generation in 2.2.",
            next_suggested_command='realforge creative asset --task "describe an asset"',
        ),
        Capability(
            domain="eval",
            status="available",
            safety_level="benchmark-aware",
            commands=(
                "realforge eval --provider mock --suite smoke",
                "realforge bench-tasks --provider mock --suite smoke",
                "realforge leaderboard",
            ),
            writes_files=True,
            requires_staff=False,
            requires_network=False,
            description="Rule-based provider evaluations, repeatable task benchmarks, and leaderboards.",
            next_suggested_command="realforge eval --provider mock --suite smoke",
        ),
        Capability(
            domain="self-improvement",
            status="experimental",
            safety_level="isolated-and-approval-gated",
            commands=("realforge improve --dry-run", "realforge experiment --dry-run"),
            writes_files=True,
            requires_staff=False,
            requires_network=False,
            description="Bounded proposals and isolated experiments; apply remains approval-gated.",
            next_suggested_command="realforge improve --dry-run",
        ),
        Capability(
            domain="scheduler",
            status="staff-only",
            safety_level="staff-gated",
            commands=scheduler_commands,
            writes_files=True,
            requires_staff=True,
            requires_network=False,
            description="Bounded staff improvement jobs that never auto-apply or auto-commit.",
            next_suggested_command=(
                "realforge scheduler-status"
                if staff_enabled
                else "Enable staff mode only after reviewing docs/realforge-staff-mode.md"
            ),
        ),
    )
    return CapabilityRegistry(
        platform="local-first AI engineering environment",
        trust_model="provider, research, patch, plan, and generated artifact output remains untrusted",
        capabilities=capabilities,
        staff_mode_enabled=staff_enabled,
    )


def registry_to_dict(registry: CapabilityRegistry) -> dict[str, object]:
    return {
        "schema_version": "1.0",
        "platform": registry.platform,
        "trust_model": registry.trust_model,
        "staff_mode_enabled": registry.staff_mode_enabled,
        "capabilities": [asdict(capability) for capability in registry.capabilities],
    }


def format_capabilities_json(registry: CapabilityRegistry) -> str:
    return json.dumps(registry_to_dict(registry), indent=2, sort_keys=True)


def format_capabilities(registry: CapabilityRegistry) -> str:
    counts = {
        status: sum(1 for item in registry.capabilities if item.status == status)
        for status in sorted(CAPABILITY_STATUSES)
    }
    lines = [
        "REALFORGE CAPABILITIES",
        f"Platform: {registry.platform}",
        "Trust: UNTRUSTED provider/research/generated output until validated",
        f"Staff mode: {'ENABLED' if registry.staff_mode_enabled else 'DISABLED'}",
        "Summary: " + ", ".join(f"{key}={value}" for key, value in counts.items()),
        "",
    ]
    for capability in registry.capabilities:
        lines.append(f"[{capability.status.upper()}] {capability.domain}")
        lines.append(
            "  Safety: "
            f"{capability.safety_level.upper()} | writes={'yes' if capability.writes_files else 'no'} "
            f"| staff={'yes' if capability.requires_staff else 'no'} "
            f"| network={'yes' if capability.requires_network else 'no'}"
        )
        lines.append(f"  {capability.description}")
        if capability.commands:
            lines.append(f"  Commands: {', '.join(capability.commands)}")
        elif capability.requires_staff and not registry.staff_mode_enabled:
            lines.append("  Commands: hidden while staff mode is disabled")
        else:
            lines.append("  Commands: not implemented")
        lines.append(f"  Next: {capability.next_suggested_command}")
        lines.append("")
    return "\n".join(lines).rstrip()
