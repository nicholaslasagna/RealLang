import subprocess
from pathlib import Path

import pytest

from reallang.codegen import emit_c
from reallang.errors import TypeError as RealTypeError
from reallang.lexer import lex
from reallang.parser import parse
from reallang.typecheck import typecheck


def _typecheck_source(source: str):
    return typecheck(parse(lex(source)), file="scope.real")


def _compile_c_warning_free(c_source: str, tmp_path: Path) -> Path:
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
    return binary


def test_reject_if_local_binding_used_after_if():
    source = """module main;
fn main() -> i32 {
  if condition(true) {
    let x: i32 = 1;
  } else {
    let y: i32 = 2;
  }
  return x;
}
"""
    with pytest.raises(RealTypeError, match="E201"):
        _typecheck_source(source)


def test_reject_while_local_binding_used_after_while():
    source = """module main;
fn main() -> i32 {
  while condition(false) {
    let x: i32 = 1;
  }
  return x;
}
"""
    with pytest.raises(RealTypeError, match="E201"):
        _typecheck_source(source)


def test_reject_use_before_declaration_in_same_block():
    source = """module main;
fn main() -> i32 {
  print_i32(x);
  let x: i32 = 1;
  return 0;
}
"""
    with pytest.raises(RealTypeError, match="E201"):
        _typecheck_source(source)


def test_reject_redeclaration_in_same_block():
    source = """module main;
fn main() -> i32 {
  let x: i32 = 1;
  var x: i32 = 2;
  return x;
}
"""
    with pytest.raises(RealTypeError, match="E202") as exc:
        _typecheck_source(source)
    assert "already declared as a let in this block" in exc.value.diagnostic.why


def test_reject_parameter_redeclaration_in_function_body():
    source = """module main;
fn id(x: i32) -> i32 {
  let x: i32 = 1;
  return x;
}
fn main() -> i32 {
  return id(0);
}
"""
    with pytest.raises(RealTypeError, match="E202"):
        _typecheck_source(source)


def test_reject_nested_shadowing():
    source = """module main;
fn main() -> i32 {
  let x: i32 = 1;
  if condition(true) {
    let x: i32 = 2;
    print_i32(x);
  } else {
    print_i32(x);
  }
  return x;
}
"""
    with pytest.raises(RealTypeError, match="E202") as exc:
        _typecheck_source(source)
    assert "shadows an outer declaration" in exc.value.diagnostic.problem


def test_allow_same_name_in_sibling_blocks(tmp_path: Path):
    source = """module main;
fn main() -> i32 {
  if condition(true) {
    let branch_value: i32 = 1;
    print_i32(branch_value);
  } else {
    let branch_value: i32 = 2;
    print_i32(branch_value);
  }
  return 0;
}
"""
    c_source = emit_c(_typecheck_source(source))
    binary = _compile_c_warning_free(c_source, tmp_path)
    run = subprocess.run([str(binary)], capture_output=True, text=True, check=True)
    assert run.stdout == "1\n"


def test_nested_set_resolves_outer_mutable_binding(tmp_path: Path):
    source = """module main;
fn main() -> i32 {
  var x: i32 = 0;
  if condition(true) {
    set x = 41;
  } else {
    set x = 1;
  }
  set x = x + 1;
  print_i32(x);
  return 0;
}
"""
    c_source = emit_c(_typecheck_source(source))
    binary = _compile_c_warning_free(c_source, tmp_path)
    run = subprocess.run([str(binary)], capture_output=True, text=True, check=True)
    assert run.stdout == "42\n"


def test_nested_set_rejects_outer_immutable_binding():
    source = """module main;
fn main() -> i32 {
  let x: i32 = 0;
  if condition(true) {
    set x = 1;
  } else {
    print_i32(x);
  }
  return 0;
}
"""
    with pytest.raises(RealTypeError, match="E203"):
        _typecheck_source(source)
