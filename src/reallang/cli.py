from __future__ import annotations

import argparse
import sys
from pathlib import Path

from reallang.codegen import emit_c
from reallang.errors import RealLangError
from reallang.lexer import lex
from reallang.parser import parse
from reallang.typecheck import typecheck


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="realc", description="RealLang compiler")
    parser.add_argument("input", type=Path, help="RealLang source file (.real)")
    parser.add_argument(
        "--emit-c",
        action="store_true",
        help="emit generated C source",
    )
    parser.add_argument(
        "-o",
        "--output",
        type=Path,
        help="output path for generated C (default: <input>.c)",
    )
    args = parser.parse_args(argv)

    if not args.emit_c:
        parser.error("realc currently supports only --emit-c")

    source_path = str(args.input)
    source = args.input.read_text(encoding="utf-8")
    try:
        tokens = lex(source, file=source_path)
        module = parse(tokens, file=source_path)
        module = typecheck(module, file=source_path)
        c_source = emit_c(module)
    except RealLangError as err:
        print(str(err), file=sys.stderr)
        return 1

    out_path = args.output if args.output else args.input.with_suffix(".c")
    out_path.write_text(c_source, encoding="utf-8")
    print(f"emitted {out_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
