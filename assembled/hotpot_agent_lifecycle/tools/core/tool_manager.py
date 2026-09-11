"""Central tool dispatch, permission checks, and call auditing."""

from __future__ import annotations

import importlib
from typing import Any

from run_context import EventBus, RunContext
from run_context.tool_context import ToolCallRecord, ToolContext

from .tool_registry import DEFAULT_REGISTRY, ToolRegistry, ToolSpec


class ToolManager:
    """Dispatch every Agent, Rule, and Harness tool call."""

    def __init__(
        self,
        registry: ToolRegistry | None = None,
        event_bus: EventBus | None = None,
    ) -> None:
        self.registry = registry or DEFAULT_REGISTRY
        self.event_bus = event_bus
        self.call_history: list[ToolCallRecord] = []

    def call(
        self,
        name: str,
        arguments: dict[str, Any] | None = None,
        context: ToolContext | None = None,
    ) -> Any:
        """Validate, invoke, and audit one tool call."""
        spec = self._get_spec(name)
        payload = arguments or {}
        call_context = (
            context.for_tool(name, payload)
            if context is not None
            else ToolContext(run_context=RunContext(), tool_name=name, arguments=payload)
        )
        self._check_permission(spec, call_context)
        if self.event_bus:
            self.event_bus.emit(
                "tool_started",
                call_context,
                scope="tool",
                payload={"tool_name": name, "arguments": payload},
            )

        try:
            result = spec.function(payload, call_context)
        except Exception as error:
            self.call_history.append(
                self._record(spec, call_context, ok=False, error=str(error))
            )
            if self.event_bus:
                self.event_bus.emit(
                    "tool_failed",
                    call_context,
                    scope="tool",
                    payload={"tool_name": name, "error": str(error)},
                )
            raise

        self.call_history.append(self._record(spec, call_context, ok=True))
        if self.event_bus:
            self.event_bus.emit(
                "tool_finished",
                call_context,
                scope="tool",
                payload={"tool_name": name, "result": result},
            )
        return result

    def _get_spec(self, name: str) -> ToolSpec:
        try:
            return self.registry.get(name)
        except KeyError:
            self._autoload_tool_modules()
            return self.registry.get(name)

    @staticmethod
    def _autoload_tool_modules() -> None:
        """Import common tool modules so local rule debugging can reuse ToolManager."""
        module_names = (
            "tools.builtins.business_tools",
            "memory.tools.memory_tools",
            "agent_tools",
            "rule_tools",
            "harness_tools",
        )
        for module_name in module_names:
            try:
                importlib.import_module(module_name)
            except ImportError:
                continue

    @staticmethod
    def _check_permission(spec: ToolSpec, context: ToolContext) -> None:
        caller_type = context.caller_type or "unknown"
        if caller_type not in spec.allowed_callers and "*" not in spec.allowed_callers:
            raise PermissionError(
                f"Caller '{caller_type}' cannot use tool '{spec.name}'"
            )
        if context.permissions and spec.name not in context.permissions:
            raise PermissionError(
                f"Caller '{context.caller_id}' is not allowed to use tool '{spec.name}'"
            )

    @staticmethod
    def _record(
        spec: ToolSpec,
        context: ToolContext,
        *,
        ok: bool,
        error: str | None = None,
    ) -> ToolCallRecord:
        return ToolCallRecord(
            tool_name=spec.name,
            run_id=context.run_id,
            node_id=context.node_id,
            caller_type=context.caller_type,
            caller_id=context.caller_id,
            ok=ok,
            error=error,
        )

    def tools_used_by(self, caller_type: str, caller_id: str) -> list[str]:
        """Return distinct tools used by one Agent, Rule, or Harness."""
        return list(
            dict.fromkeys(
                record.tool_name
                for record in self.call_history
                if record.caller_type == caller_type
                and record.caller_id == caller_id
            )
        )
