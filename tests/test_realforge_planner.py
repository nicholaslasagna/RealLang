from realforge.planner import parse_plan_response
from realforge.errors import ProviderPlanError


def test_parse_plan_response_json():
    task = "inspect hello.real"
    text = """
    {
      "summary": "Check hello.real with realc.",
      "steps": [
        {"order": 1, "action": "check", "detail": "Run realc --check on hello.real"}
      ],
      "files_to_inspect": ["examples/hello.real"],
      "files_to_modify": [],
      "commands_to_run": ["realforge check examples/hello.real"],
      "risks": ["Planning is not editing."],
      "requires_write_permission": false
    }
    """
    plan = parse_plan_response(task, text)
    assert plan.task == task
    assert plan.summary == "Check hello.real with realc."
    assert len(plan.steps) == 1
    assert plan.steps[0].action == "check"
    assert plan.files_to_inspect == ("examples/hello.real",)
    assert plan.commands_to_run == ("realforge check examples/hello.real",)


def test_parse_plan_response_rejects_invalid_json():
    try:
        parse_plan_response("task", "{bad", provider="test")
        assert False, "expected ProviderPlanError"
    except ProviderPlanError as err:
        assert err.provider == "test"
