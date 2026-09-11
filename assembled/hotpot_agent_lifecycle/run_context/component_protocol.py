"""Shared component request/response protocol for Rules, Agents, Adapters, and Harnesses."""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Callable


@dataclass
class ComponentRef:
    """Identity and runtime instance of the component currently executing."""

    id: str
    name: str
    kind: str
    instance: Any = None


@dataclass
class ExecutionTarget:
    """Runtime-only executable target exposed to a containing Harness."""

    kind: str
    node_id: str | None = None
    graph_id: str | None = None
    component: ComponentRef | None = None
    executor: Callable[[dict[str, Any]], dict[str, Any]] | None = None


@dataclass
class ComponentError:
    code: str
    message: str
    retryable: bool = False
    details: dict[str, Any] = field(default_factory=dict)


@dataclass
class ControlSignal:
    action: str = "continue"
    reason: str = ""
    target: str | None = None


@dataclass
class ComponentRequest:
    """Stable input envelope passed to every component."""

    run_context: Any
    state: dict[str, Any]
    payload: dict[str, Any]
    component: ComponentRef
    target: ExecutionTarget | None
    services: Any
    metadata: dict[str, Any] = field(default_factory=dict)

    @property
    def inputs(self) -> dict[str, Any]:
        """Alias for the normalized multi-field input payload."""
        return self.payload

    def call_tool(
        self,
        name: str,
        arguments: dict[str, Any] | None = None,
    ) -> Any:
        """Call one registered tool with the current runtime context."""
        return self.services.tool_manager.call(
            name,
            arguments or {},
            self.services.tool_manager_context(),
        )

    def tool(self, name: str) -> Callable[..., Any]:
        """Return a function-style proxy for one registered tool."""

        def invoke(**kwargs: Any) -> Any:
            return self.call_tool(name, kwargs)

        setattr(invoke, "__tool_name__", name)
        return invoke


@dataclass
class ComponentResponse:
    """Stable output envelope returned by every component."""

    ok: bool = True
    data: dict[str, Any] = field(default_factory=dict)
    state_updates: dict[str, Any] = field(default_factory=dict)
    control: ControlSignal | None = None
    error: ComponentError | None = None
    events: list[Any] = field(default_factory=list)
    metadata: dict[str, Any] = field(default_factory=dict)

    @property
    def outputs(self) -> dict[str, Any]:
        """Alias for the normalized multi-field output payload."""
        return self.data

    @classmethod
    def failure(
        cls,
        code: str,
        message: str,
        *,
        retryable: bool = False,
        details: dict[str, Any] | None = None,
    ) -> "ComponentResponse":
        return cls(
            ok=False,
            error=ComponentError(
                code=code,
                message=message,
                retryable=retryable,
                details=details or {},
            ),
        )


def component(
    *,
    kind: str,
    name: str,
    description: str = "",
    input_type: object = dict,
    input_description: str = "",
    output_type: object = ComponentResponse,
    output_description: str = "",
    **metadata: Any,
) -> Callable[[Any], Any]:
    """Attach one common component specification to a function or class."""

    spec = {
        "name": name,
        "kind": kind,
        "description": description or metadata.get("descript", ""),
        "input_type": input_type,
        "input_description": input_description,
        "output_type": output_type,
        "output_description": output_description,
        **metadata,
    }

    def decorator(target: Any) -> Any:
        setattr(target, "__component_spec__", spec)
        setattr(target, "__component_kind__", kind)
        if kind == "rule":
            setattr(target, "__rule_metadata__", spec)
        return target

    return decorator


def rule(**metadata: Any) -> Callable[[Any], Any]:
    return component(kind="rule", **metadata)


def agent(**metadata: Any) -> Callable[[Any], Any]:
    return component(kind="agent", **metadata)


def adapter(**metadata: Any) -> Callable[[Any], Any]:
    return component(kind="adapter", **metadata)


def adapte(**metadata: Any) -> Callable[[Any], Any]:
    """Backward-compatible alias for users who typed @adapte."""
    return adapter(**metadata)


def harness(**metadata: Any) -> Callable[[Any], Any]:
    return component(kind="harness", **metadata)
