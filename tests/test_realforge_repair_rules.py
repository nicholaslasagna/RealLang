from realforge.diagnostics_parser import ParsedDiagnostic
from realforge.repair_rules import apply_safe_repairs, plan_repairs

BAD_E203 = """module main;
fn main() -> i32 {
  let x: i32 = 10;
  set x = 20;
  return 0;
}
"""


def _diag(code: str, problem: str) -> ParsedDiagnostic:
    return ParsedDiagnostic(kind="REAL_TYPE_ERROR", code=code, problem=problem)


def test_e203_let_to_var_repair():
    diags = [_diag("E203", "Cannot assign to immutable binding 'x'.")]
    plan = apply_safe_repairs(BAD_E203, diags)
    assert "var x: i32" in plan.source
    assert "let x: i32" not in plan.source
    assert any(a.applied for a in plan.actions)


def test_e217_manual_only():
    diags = [_diag("E217", "fn main() must take no parameters.")]
    plan = plan_repairs(BAD_E203, diags)
    assert plan.source == BAD_E203
    assert plan.manual_notes
    assert plan.actions[0].manual_required


def test_e203_not_applied_without_set():
    source = "module main;\nfn main() -> i32 { let x: i32 = 1; return 0; }\n"
    diags = [_diag("E203", "Cannot assign to immutable binding 'x'.")]
    plan = apply_safe_repairs(source, diags)
    assert plan.source == source
    assert plan.manual_notes
