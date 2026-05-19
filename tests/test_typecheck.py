from pathlib import Path

import pytest

from reallang.errors import TypeError as RealTypeError
from reallang.lexer import lex
from reallang.parser import parse
from reallang.typecheck import typecheck

HELLO = Path(__file__).resolve().parents[1] / "examples" / "hello.real"
ADD = Path(__file__).resolve().parents[1] / "examples" / "add.real"
LOOPTEST = Path(__file__).resolve().parents[1] / "examples" / "looptest.real"
CONDITION = Path(__file__).resolve().parents[1] / "examples" / "condition.real"


def test_hello_typechecks():
    typecheck(parse(lex(HELLO.read_text(encoding="utf-8"))))


def test_add_typechecks():
    typecheck(parse(lex(ADD.read_text(encoding="utf-8"))))


def test_looptest_typechecks():
    typecheck(parse(lex(LOOPTEST.read_text(encoding="utf-8"))))


def test_condition_typechecks():
    typecheck(parse(lex(CONDITION.read_text(encoding="utf-8"))))


def test_typecheck_bool_literals():
    source = """module main;
fn main() -> i32 {
  print_bool(true);
  print_bool(false);
  return 0;
}
"""
    typecheck(parse(lex(source)))


def test_reject_non_bool_while_condition():
    source = """module main;
fn main() -> i32 {
  var i: i32 = 0;
  while condition(i) {
    set i = i + 1;
  }
  return 0;
}
"""
    with pytest.raises(RealTypeError, match="E208"):
        typecheck(parse(lex(source)))


def test_reject_non_bool_if_condition():
    source = """module main;
fn main() -> i32 {
  let x: i32 = 1;
  if condition(x) {
    return 0;
  } else {
    return 1;
  }
}
"""
    with pytest.raises(RealTypeError, match="E207"):
        typecheck(parse(lex(source)))


def test_reject_set_on_let():
    source = """module main;
fn main() -> i32 {
  let x: i32 = 1;
  set x = 2;
  return 0;
}
"""
    with pytest.raises(RealTypeError, match="E203"):
        typecheck(parse(lex(source)))


def test_reject_set_type_mismatch():
    source = """module main;
fn main() -> i32 {
  var x: i32 = 1;
  set x = true;
  return 0;
}
"""
    with pytest.raises(RealTypeError, match="E204"):
        typecheck(parse(lex(source)))


def test_reject_wrong_argument_count():
    source = """module main;
fn add(a: i32, b: i32) -> i32 { return a + b; }
fn main() -> i32 {
  let x: i32 = add(1);
  return 0;
}
"""
    with pytest.raises(RealTypeError, match="E205"):
        typecheck(parse(lex(source)))
