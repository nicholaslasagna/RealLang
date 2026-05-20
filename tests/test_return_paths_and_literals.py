import subprocess
from pathlib import Path

import pytest

from reallang.codegen import emit_c
from reallang.errors import ParseError, TypeError as RealTypeError
from reallang.lexer import lex
from reallang.parser import parse
from reallang.typecheck import typecheck


def _parse_source(source: str):
    return parse(lex(source), file="test.real")


def _typecheck_source(source: str):
    return typecheck(_parse_source(source), file="test.real")


def _compile_c_warning_free(c_source: str, tmp_path: Path) -> None:
    out_c = tmp_path / "program.c"
    binary = tmp_path / "program"
    out_c.write_text(c_source, encoding="utf-8")
    proc = subprocess.run(
        ["cc", "-std=c11", "-Wall", "-Wextra", str(out_c), "-o", str(binary)],
        capture_output=True,
        text=True,
    )
    assert proc.returncode == 0, proc.stderr
    assert "warning:" not in proc.stderr.lower()


def test_reject_empty_i32_function_body():
    source = """module main;
fn f() -> i32 {
}
fn main() -> i32 {
  return 0;
}
"""
    with pytest.raises(RealTypeError, match="E220"):
        _typecheck_source(source)


def test_reject_empty_bool_function_body():
    source = """module main;
fn f() -> bool {
}
fn main() -> i32 {
  print_bool(f());
  return 0;
}
"""
    with pytest.raises(RealTypeError, match="E220"):
        _typecheck_source(source)


def test_if_without_else_is_rejected_before_return_analysis():
    source = """module main;
fn f() -> i32 {
  if condition(true) {
    return 1;
  }
}
fn main() -> i32 {
  return 0;
}
"""
    with pytest.raises(ParseError, match="E100"):
        _parse_source(source)


def test_reject_if_branch_without_guaranteed_return():
    source = """module main;
fn f() -> i32 {
  if condition(true) {
    return 1;
  } else {
    print_i32(0);
  }
}
fn main() -> i32 {
  return f();
}
"""
    with pytest.raises(RealTypeError, match="E220"):
        _typecheck_source(source)


def test_accept_if_else_when_both_branches_return(tmp_path: Path):
    source = """module main;
fn f() -> i32 {
  if condition(true) {
    return 1;
  } else {
    return 0;
  }
}
fn main() -> i32 {
  return f();
}
"""
    c_source = emit_c(_typecheck_source(source))
    _compile_c_warning_free(c_source, tmp_path)


def test_accept_bool_return_function(tmp_path: Path):
    source = """module main;
fn f(flag: bool) -> bool {
  if condition(flag) {
    return true;
  } else {
    return false;
  }
}
fn main() -> i32 {
  print_bool(f(true));
  return 0;
}
"""
    c_source = emit_c(_typecheck_source(source))
    assert "bool f(bool flag);" in c_source
    assert "bool f(bool flag) {" in c_source
    _compile_c_warning_free(c_source, tmp_path)


def test_while_return_does_not_guarantee_function_return():
    source = """module main;
fn f() -> i32 {
  while condition(true) {
    return 1;
  }
}
fn main() -> i32 {
  return f();
}
"""
    with pytest.raises(RealTypeError, match="E220"):
        _typecheck_source(source)


def test_reject_missing_return_in_main():
    source = """module main;
fn main() -> i32 {
  print_i32(1);
}
"""
    with pytest.raises(RealTypeError, match="E220"):
        _typecheck_source(source)


def test_reject_i32_literal_above_source_range():
    source = """module main;
fn main() -> i32 {
  let x: i32 = 2147483648;
  return 0;
}
"""
    with pytest.raises(RealTypeError, match="E221") as exc:
        _typecheck_source(source)
    assert exc.value.diagnostic.expected == "0..2147483647"
    assert exc.value.diagnostic.found == "2147483648"


def test_accept_i32_max_source_literal(tmp_path: Path):
    source = """module main;
fn main() -> i32 {
  let x: i32 = 2147483647;
  print_i32(x);
  return 0;
}
"""
    c_source = emit_c(_typecheck_source(source))
    assert "2147483647" in c_source
    _compile_c_warning_free(c_source, tmp_path)
