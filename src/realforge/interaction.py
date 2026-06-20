from __future__ import annotations

import json
from dataclasses import asdict, dataclass


@dataclass(frozen=True)
class SlashCommand:
    shortcut: str
    maps_to: str
    description: str
    safety_label: str
    requires_staff: bool = False


@dataclass(frozen=True)
class SlashCommandRegistry:
    commands: tuple[SlashCommand, ...]
    staff_mode_enabled: bool
    interactive_shell_implemented: bool = False


def build_slash_registry(*, staff_mode_enabled: bool) -> SlashCommandRegistry:
    commands = [
        SlashCommand("/plan", 'realforge plan --task "<task>"', "Build a structured plan.", "UNTRUSTED"),
        SlashCommand("/ask", 'realforge ask --task "<task>"', "Request a concise plan or answer.", "UNTRUSTED"),
        SlashCommand("/check", "realforge check <file.real>", "Run compiler-guided checks.", "PASS/BLOCKED"),
        SlashCommand("/repair", "realforge repair <file.real> --dry-run", "Preview conservative repairs.", "DRY RUN"),
        SlashCommand("/context", 'realforge context --task "<task>"', "Build bounded workspace context.", "READ ONLY"),
        SlashCommand(
            "/research",
            "realforge research --url <https-url> --allow-domain <domain>",
            "Fetch one explicitly allowlisted research source.",
            "NETWORK GATED",
        ),
        SlashCommand("/creative", 'realforge creative brief --task "<task>"', "Create a planning brief.", "UNTRUSTED"),
        SlashCommand("/image", 'realforge image prompt --task "<task>"', "Build an image prompt specification.", "UNTRUSTED"),
        SlashCommand("/engine", "realforge engine scan --path <project>", "Scan an engine project without mutation.", "DRY RUN"),
        SlashCommand("/eval", "realforge eval --provider mock --suite smoke", "Run provider evaluation checks.", "BENCHMARK"),
        SlashCommand("/bench", "realforge bench-tasks --provider mock --suite smoke", "Run repeatable task benchmarks.", "BENCHMARK"),
        SlashCommand("/leaderboard", "realforge leaderboard", "Show saved local-provider benchmark rankings.", "READ ONLY"),
        SlashCommand("/improve", "realforge improve --dry-run", "Propose a bounded improvement plan.", "DRY RUN"),
        SlashCommand("/doctor", "realforge doctor", "Check environment health.", "PASS/WARN/BLOCKED"),
        SlashCommand("/help", "realforge slash", "Show this slash-command grammar.", "READ ONLY"),
    ]
    if staff_mode_enabled:
        commands.extend(
            (
                SlashCommand(
                    "/scheduler",
                    "realforge scheduler-status",
                    "Review the bounded staff scheduler gate and status.",
                    "STAFF ONLY",
                    requires_staff=True,
                ),
                SlashCommand(
                    "/update",
                    "realforge update-bundle list",
                    "Review staff update candidates.",
                    "STAFF ONLY",
                    requires_staff=True,
                ),
            )
        )
    return SlashCommandRegistry(commands=tuple(commands), staff_mode_enabled=staff_mode_enabled)


def slash_registry_to_dict(registry: SlashCommandRegistry) -> dict[str, object]:
    return {
        "schema_version": "1.0",
        "interactive_shell_implemented": registry.interactive_shell_implemented,
        "staff_mode_enabled": registry.staff_mode_enabled,
        "staff_shortcuts_hidden": not registry.staff_mode_enabled,
        "commands": [asdict(command) for command in registry.commands],
    }


def format_slash_json(registry: SlashCommandRegistry) -> str:
    return json.dumps(slash_registry_to_dict(registry), indent=2, sort_keys=True)


def format_slash_commands(registry: SlashCommandRegistry) -> str:
    lines = [
        "REALFORGE SLASH COMMANDS",
        "Status: GRAMMAR ONLY (no interactive shell in 2.2)",
        "Safety: shortcuts map to existing commands and execute nothing here",
        "",
    ]
    for command in registry.commands:
        lines.append(f"[{command.safety_label}] {command.shortcut}")
        lines.append(f"  Maps to: {command.maps_to}")
        lines.append(f"  {command.description}")
    if not registry.staff_mode_enabled:
        lines.extend(("", "STAFF ONLY shortcuts are hidden because staff mode is disabled."))
    lines.extend(("", "Next: run a mapped command explicitly, or use realforge capabilities."))
    return "\n".join(lines)
