from realforge.planner import parse_plan_response


def test_parse_plan_response_json():
    task = "inspect hello.real"
    text = """
    {
      "summary": "Check hello.real with realc.",
      "steps": [
        {"order": 1, "action": "check", "detail": "Run realc --check on hello.real"}
      ]
    }
    """
    plan = parse_plan_response(task, text)
    assert plan.task == task
    assert plan.summary == "Check hello.real with realc."
    assert len(plan.steps) == 1
    assert plan.steps[0].action == "check"
