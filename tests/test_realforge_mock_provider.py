from realforge.config import default_config
from realforge.planner import mock_plan_for_task
from realforge.providers import MockProvider, get_provider


def test_mock_provider_is_deterministic():
    provider = MockProvider()
    task = "fix E203 in examples/bad.real"
    first = provider.generate_plan(task)
    second = provider.generate_plan(task)
    assert first == second
    assert first.task == task
    assert len(first.steps) == 5


def test_mock_plan_matches_helper():
    task = "inspect hello.real"
    assert MockProvider().generate_plan(task) == mock_plan_for_task(task)


def test_get_provider_mock():
    provider = get_provider("mock", default_config())
    assert provider.name == "mock"
