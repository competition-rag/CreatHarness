"""Tool declaration and registration primitives."""

from __future__ import annotations

from dataclasses import dataclass
from functools import wraps
from typing import Any, Callable


@dataclass(frozen=True)
class ToolSpec:
    """Runtime metadata for one callable tool."""

    name: str
    description: str
    function: Callable[..., Any]
    allowed_callers: frozenset[str] = frozenset({"agent", "rule", "harness"})
    side_effect: bool = False
    risk_level: str = "low"


class ToolRegistry:
    """Registry populated by the ``@tool`` decorator."""

    def __init__(self) -> None:
        self._tools: dict[str, ToolSpec] = {}

    def register(self, spec: ToolSpec) -> ToolSpec:
        existing = self._tools.get(spec.name)
        if existing and existing.function is not spec.function:
            raise ValueError(f"Tool already registered: {spec.name}")
        self._tools[spec.name] = spec
        return spec

    def get(self, name: str) -> ToolSpec:
        try:
            return self._tools[name]
        except KeyError as exc:
            raise KeyError(f"Unknown tool: {name}") from exc

    def list(self) -> list[ToolSpec]:
        return list(self._tools.values())


DEFAULT_REGISTRY = ToolRegistry()


def tool(
    *,
    name: str,
    description: str,
    allowed_callers: set[str] | frozenset[str] | None = None,
    side_effect: bool = False,
    risk_level: str = "low",
) -> Callable[[Callable[..., Any]], Callable[..., Any]]:
    """Register a function as a Tool while preserving its call behavior."""

    def decorator(function: Callable[..., Any]) -> Callable[..., Any]:
        spec = ToolSpec(
            name=name,
            description=description,
            function=function,
            allowed_callers=frozenset(
                allowed_callers or {"agent", "rule", "harness"}
            ),
            side_effect=side_effect,
            risk_level=risk_level,
        )
        DEFAULT_REGISTRY.register(spec)
        setattr(function, "__tool_spec__", spec)

        @wraps(function)
        def wrapper(*args: Any, **kwargs: Any) -> Any:
            return function(*args, **kwargs)

        setattr(wrapper, "__tool_spec__", spec)
        return wrapper

    return decorator
