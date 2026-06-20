SAMPLE = """REAL_TYPE_ERROR[E203]
File: bad.real
Line: 4
Column: 3
Problem:
  Cannot assign to immutable binding 'x'.
Why:
  'x' was declared with let, which creates an immutable binding.
Suggested repair:
  Change:
    let x: i32 = ...;
  To:
    var x: i32 = ...;
  Or remove this set statement.
"""


def test_parse_structured_diagnostic():
    from realforge.diagnostics_parser import parse_diagnostics

    diags = parse_diagnostics(SAMPLE)
    assert len(diags) == 1
    d = diags[0]
    assert d.kind == "REAL_TYPE_ERROR"
    assert d.code == "E203"
    assert d.file == "bad.real"
    assert d.line == 4
    assert d.column == 3
    assert "immutable binding" in d.problem
    assert d.why is not None
    assert "let" in d.repair


def test_parse_multiple_diagnostics():
    from realforge.diagnostics_parser import parse_diagnostics

    text = SAMPLE + "\n\nREAL_TYPE_ERROR[E217]\nFile: bad.real\nLine: 1\nColumn: 1\nProblem:\n  main must take no parameters.\n"
    diags = parse_diagnostics(text)
    assert len(diags) == 2
    assert {d.code for d in diags} == {"E203", "E217"}
