import subprocess
from pathlib import Path

import pytest

from reallang.codegen import emit_c
from reallang.errors import TypeError as RealTypeError
from reallang.lexer import lex
from reallang.parser import parse
from reallang.typecheck import typecheck


def _typecheck_source(source: str):
    return typecheck(parse(lex(source)))


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


def test_reject_main_with_parameters():
    source = """module main;
fn main(argc: i32) -> i32 {
  return argc;
}
"""
    with pytest.raises(RealTypeError, match="E217"):
        _typecheck_source(source)


def test_reject_duplicate_parameter_names():
    source = """module main;
fn add(value: i32, value: i32) -> i32 {
  return value;
}
fn main() -> i32 {
  return add(1, 2);
}
"""
    with pytest.raises(RealTypeError, match="E218"):
        _typecheck_source(source)


@pytest.mark.parametrize(
    "source",
    [
        """module main;
fn for() -> i32 {
  return 0;
}
fn main() -> i32 {
  return for();
}
""",
        """module main;
fn helper(static: i32) -> i32 {
  return static;
}
fn main() -> i32 {
  return helper(1);
}
""",
        """module main;
fn main() -> i32 {
  let printf: i32 = 1;
  return printf;
}
""",
        """module main;
fn real_i32_add() -> i32 {
  return 0;
}
fn main() -> i32 {
  return real_i32_add();
}
""",
        """module main;
fn helper(_Private: i32) -> i32 {
  return _Private;
}
fn main() -> i32 {
  return helper(1);
}
""",
    ],
)
def test_reject_c_unsafe_identifiers(source: str):
    with pytest.raises(RealTypeError, match="E219"):
        _typecheck_source(source)


def test_reject_block_local_binding_used_outside_scope():
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


def test_reject_missing_return_path():
    source = """module main;
fn maybe(flag: bool) -> i32 {
  if condition(flag) {
    return 1;
  } else {
    print_i32(0);
  }
}
fn main() -> i32 {
  return maybe(false);
}
"""
    with pytest.raises(RealTypeError, match="E220"):
        _typecheck_source(source)


def test_forward_call_regression_compiles_warning_free(tmp_path: Path):
    source = """module main;

fn main() -> i32 {
  let x: i32 = later(10);
  print_i32(x);
  return 0;
}

fn later(v: i32) -> i32 {
  return v + 1;
}
"""
    c_source = emit_c(_typecheck_source(source))
    assert "int32_t later(int32_t v);" in c_source
    assert c_source.index("int32_t later(int32_t v);") < c_source.index("int main(void) {")
    binary = _compile_c_warning_free(c_source, tmp_path)
    run = subprocess.run([str(binary)], capture_output=True, text=True, check=True)
    assert run.stdout == "11\n"


def test_non_main_forward_call_and_void_params_compile_warning_free(tmp_path: Path):
    source = """module main;

fn first() -> i32 {
  return second();
}

fn main() -> i32 {
  return first();
}

fn second() -> i32 {
  return 7;
}
"""
    c_source = emit_c(_typecheck_source(source))
    assert "int32_t first(void);" in c_source
    assert "int32_t second(void);" in c_source
    assert "int32_t first(void) {" in c_source
    assert "return second();" in c_source
    _compile_c_warning_free(c_source, tmp_path)


def test_unused_supported_identifiers_compile_warning_free(tmp_path: Path):
    source = """module main;
fn ignore(value: i32) -> i32 {
  let local: i32 = 1;
  return 0;
}
fn main() -> i32 {
  return ignore(1);
}
"""
    c_source = emit_c(_typecheck_source(source))
    assert "(void)value;" in c_source
    assert "(void)local;" in c_source
    _compile_c_warning_free(c_source, tmp_path)
