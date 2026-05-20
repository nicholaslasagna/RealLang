from pathlib import Path

import pytest

from reallang.codegen import emit_c
from reallang.errors import TypeError as RealTypeError
from reallang.lexer import lex
from reallang.parser import parse
from reallang.typecheck import typecheck

HELLO = Path(__file__).resolve().parents[1] / "examples" / "hello.real"
ADD = Path(__file__).resolve().parents[1] / "examples" / "add.real"
LOOPTEST = Path(__file__).resolve().parents[1] / "examples" / "looptest.real"
CONDITION = Path(__file__).resolve().parents[1] / "examples" / "condition.real"


def test_emit_hello_c():
    module = typecheck(parse(lex(HELLO.read_text(encoding="utf-8"))))
    c = emit_c(module)
    assert "int main(void) {" in c


def test_emit_add_c():
    module = typecheck(parse(lex(ADD.read_text(encoding="utf-8"))))
    c = emit_c(module)
    assert "int32_t z = add(x, y);" in c
    assert "return real_i32_add(a, b);" in c


def test_emit_looptest_c():
    module = typecheck(parse(lex(LOOPTEST.read_text(encoding="utf-8"))))
    c = emit_c(module)
    assert "int32_t i = 0;" in c
    assert "int32_t total = 0;" in c
    assert "while (i < 1000000) {" in c
    assert "total = real_i32_add(total, i);" in c
    assert "i = real_i32_add(i, 1);" in c
    assert 'printf("%" PRId32 "\\n", total);' in c


def test_emit_condition_c():
    module = typecheck(parse(lex(CONDITION.read_text(encoding="utf-8"))))
    c = emit_c(module)
    assert "if (x == 10) {" in c
    assert 'printf("%s\\n", "true");' in c
    assert "} else {" in c
    assert 'printf("%s\\n", "false");' in c


def test_emit_i32_wrapping_helpers():
    source = """module main;
fn main() -> i32 {
  let x: i32 = 2147483647 + 1;
  let y: i32 = 0 - 1;
  let z: i32 = 65536 * 65536;
  return x + y + z;
}
"""
    module = typecheck(parse(lex(source)))
    c = emit_c(module)
    assert "#include <stdint.h>" in c
    assert "static inline int32_t real_i32_add" in c
    assert "static inline int32_t real_i32_sub" in c
    assert "static inline int32_t real_i32_mul" in c
    assert "int32_t x = real_i32_add(2147483647, 1);" in c
    assert "int32_t y = real_i32_sub(0, 1);" in c
    assert "int32_t z = real_i32_mul(65536, 65536);" in c
    assert "return real_i32_add(real_i32_add(x, y), z);" in c


def test_typecheck_requires_main():
    source = "module x;\nfn other() -> i32 { return 0; }\n"
    with pytest.raises(RealTypeError, match="E210"):
        typecheck(parse(lex(source)))
