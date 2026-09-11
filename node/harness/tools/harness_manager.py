"""Run harness lifecycle hooks around agents, rules, or subgraphs."""

from __future__ import annotations

from typing import Any, Callable

from run_context import ComponentRef, ComponentRequest, ComponentResponse, ExecutionTarget
from tools.core.tool_manager import ToolManager


class HarnessManager:
    """Build synchronous harness compositions from lifecycle configuration.

    Harness implementations only provide ``start`` and ``end`` hooks. The
    manager owns the wrapping order so a harness cannot accidentally execute
    its child more than once or introduce its own concurrency model.
    """

    @staticmethod
    def create(harness_factory: Any, config: dict[str, Any] | None = None) -> Any:
        options = config or {}
        if isinstance(harness_factory, type):
            return harness_factory(**options)
        if callable(harness_factory):
            return harness_factory(options)
        raise TypeError("Harness must be a class or callable")

    @classmethod
    def compose(
        cls,
        *,
        mode: str,
        harness_factory: Any,
        child: Callable[[dict[str, Any]], dict[str, Any]],
        child_target: ExecutionTarget | None = None,
        config: dict[str, Any] | None = None,
        tool_manager: ToolManager | None = None,
        caller_id: str = "",
        permissions: set[str] | None = None,
        runtime_services: Any | None = None,
    ) -> Callable[[dict[str, Any]], dict[str, Any]]:
        harness = cls.create(harness_factory, config)
        if mode not in {"contains", "before_after"}:
            raise ValueError(f"Unsupported harness mode: {mode}")
        return cls._compose_lifecycle(
            harness,
            child,
            mode,
            tool_manager or ToolManager(),
            caller_id or harness_factory.__name__,
            permissions or set(),
            runtime_services,
            child_target,
        )

    @staticmethod
    def _compose_lifecycle(
        harness: Any,
        child: Callable[[dict[str, Any]], dict[str, Any]],
        mode: str,
        tool_manager: ToolManager,
        caller_id: str,
        permissions: set[str],
        runtime_services: Any | None,
        child_target: ExecutionTarget | None,
    ) -> Callable[[dict[str, Any]], dict[str, Any]]:
        start = getattr(harness, "start", None)
        end = getattr(harness, "end", None)
        if not callable(start) or not callable(end):
            raise TypeError("Harness must define callable start(request) and end(request, response)")

        def wrapped(state: dict[str, Any]) -> dict[str, Any]:
            if runtime_services is None:
                raise RuntimeError("HarnessManager requires RuntimeServices")
            run_context = runtime_services.run_context
            run_context.caller_type = "harness"
            run_context.caller_id = caller_id
            run_context.permissions = permissions
            request = ComponentRequest(
                run_context=run_context,
                state=dict(state),
                payload=dict(state),
                component=ComponentRef(
                    id=caller_id,
                    name=caller_id.rsplit(".", 1)[-1],
                    kind="harness",
                    instance=harness,
                ),
                target=child_target,
                services=runtime_services,
                metadata={"mode": mode},
            )
            started = start(request)
            if not isinstance(started, ComponentResponse):
                raise TypeError("Harness.start() must return ComponentResponse")
            if not started.ok:
                raise RuntimeError(started.error.message if started.error else "Harness start failed")

            prepared_state = dict(state)
            prepared_state.update(started.state_updates)
            result = child(prepared_state)
            child_response = ComponentResponse(
                ok=True,
                data=dict(result),
                state_updates=dict(result),
            )
            request.metadata["result"] = result
            run_context.caller_type = "harness"
            run_context.caller_id = caller_id
            run_context.permissions = permissions
            completed = end(request, child_response)
            if not isinstance(completed, ComponentResponse):
                raise TypeError("Harness.end() must return ComponentResponse")
            if not completed.ok:
                raise RuntimeError(
                    completed.error.message if completed.error else "Harness end failed"
                )
            return completed.state_updates or result

        return wrapped
