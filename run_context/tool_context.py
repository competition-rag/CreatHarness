"""Context for one tool request and its audit record."""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

from .run_context import RunContext


@dataclass
class ToolContext:
    """Per-call tool data linked to the parent RunContext."""

    run_context: RunContext
    tool_name: str = ""
    arguments: dict[str, Any] = field(default_factory=dict)
    caller_type: str = ""
    caller_id: str = ""
    allowed_tools: set[str] | None = None
    result: Any = None
    error: Exception | None = None

    @property
    def run_id(self) -> str:
        return self.run_context.run_id

    @property
    def node_id(self) -> str:
        return self.run_context.current_node_id

    @property
    def permissions(self) -> set[str]:
        return (
            self.run_context.permissions
            if self.allowed_tools is None
            else self.allowed_tools
        )

    @property
    def metadata(self) -> dict[str, Any]:
        return self.run_context.metadata

    @property
    def usage(self) -> dict[str, Any]:
        return self.run_context.usage

    @classmethod
    def for_caller(
        cls,
        run_context: RunContext,
        *,
        caller_type: str,
        caller_id: str,
        allowed_tools: set[str] | None = None,
    ) -> "ToolContext":
        return cls(
            run_context=run_context,
            caller_type=caller_type,
            caller_id=caller_id,
            allowed_tools=allowed_tools,
        )

    def for_tool(self, name: str, arguments: dict[str, Any]) -> "ToolContext":
        return ToolContext(
            run_context=self.run_context,
            tool_name=name,
            arguments=arguments,
            caller_type=self.caller_type or self.run_context.caller_type,
            caller_id=self.caller_id or self.run_context.caller_id,
            allowed_tools=self.allowed_tools,
        )


@dataclass(frozen=True)
class ToolCallRecord:
    """Immutable audit entry for one tool call."""

    tool_name: str
    run_id: str
    node_id: str
    caller_type: str
    caller_id: str
    ok: bool
    error: str | None = None
