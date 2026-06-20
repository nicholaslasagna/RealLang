from __future__ import annotations

import re
from dataclasses import dataclass
from pathlib import Path

MODULE_RE = re.compile(r"^\s*module\s+(\w+)\s*;", re.MULTILINE)
FN_RE = re.compile(
    r"^\s*fn\s+(\w+)\s*\(([^)]*)\)\s*(?:->\s*(\w+))?\s*\{",
    re.MULTILINE,
)
PARAM_RE = re.compile(r"(\w+)\s*:\s*(\w+)")
BINDING_RE = re.compile(r"^\s*(let|var)\s+(\w+)\s*:\s*(\w+)\s*=", re.MULTILINE)


@dataclass(frozen=True)
class FunctionSymbol:
    name: str
    parameters: tuple[tuple[str, str], ...]
    return_type: str | None


@dataclass(frozen=True)
class BindingSymbol:
    kind: str
    name: str
    type_name: str


@dataclass(frozen=True)
class FileSymbols:
    path: Path
    module: str | None
    functions: tuple[FunctionSymbol, ...]
    bindings: tuple[BindingSymbol, ...]


@dataclass(frozen=True)
class Symbol:
    kind: str
    name: str


def _parse_parameters(raw: str) -> tuple[tuple[str, str], ...]:
    params: list[tuple[str, str]] = []
    for match in PARAM_RE.finditer(raw):
        params.append((match.group(1), match.group(2)))
    return tuple(params)


def extract_file_symbols(path: Path, source: str) -> FileSymbols:
    """Conservative text-based symbol scan (not a full parser)."""
    module = MODULE_RE.search(source)
    module_name = module.group(1) if module else None

    functions: list[FunctionSymbol] = []
    for match in FN_RE.finditer(source):
        functions.append(
            FunctionSymbol(
                name=match.group(1),
                parameters=_parse_parameters(match.group(2)),
                return_type=match.group(3),
            )
        )

    bindings: list[BindingSymbol] = []
    for match in BINDING_RE.finditer(source):
        bindings.append(
            BindingSymbol(
                kind=match.group(1),
                name=match.group(2),
                type_name=match.group(3),
            )
        )

    return FileSymbols(
        path=path,
        module=module_name,
        functions=tuple(functions),
        bindings=tuple(bindings),
    )


def extract_symbols(source: str) -> list[Symbol]:
    """Legacy lightweight symbol list."""
    symbols: list[Symbol] = []
    for match in MODULE_RE.finditer(source):
        symbols.append(Symbol(kind="module", name=match.group(1)))
    for match in FN_RE.finditer(source):
        symbols.append(Symbol(kind="function", name=match.group(1)))
    return symbols


def scan_workspace_symbols(real_files: tuple[Path, ...]) -> tuple[FileSymbols, ...]:
    results: list[FileSymbols] = []
    for path in real_files:
        source = path.read_text(encoding="utf-8")
        results.append(extract_file_symbols(path, source))
    return tuple(results)


def format_symbol_table(
    symbols: tuple[FileSymbols, ...],
    *,
    workspace_root: Path | None = None,
) -> str:
    lines = ["RealForge symbol table", ""]
    for entry in symbols:
        if workspace_root is not None:
            rel = entry.path.resolve().relative_to(workspace_root.resolve())
            header = str(rel)
        else:
            header = str(entry.path)
        lines.append(f"file: {header}")
        if entry.module is not None:
            lines.append(f"  module: {entry.module}")
        for fn in entry.functions:
            params = ", ".join(f"{name}: {typ}" for name, typ in fn.parameters)
            ret = fn.return_type or "void"
            lines.append(f"  fn {fn.name}({params}) -> {ret}")
        for binding in entry.bindings:
            lines.append(f"  {binding.kind} {binding.name}: {binding.type_name}")
        lines.append("")
    return "\n".join(lines).rstrip()
