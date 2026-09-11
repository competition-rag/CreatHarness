"""Runtime-wide services shared by one graph execution."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from memory.manager import MemoryManager
from run_context import EventBus, RunContext, ToolContext

from tools.core.tool_manager import ToolManager


@dataclass
class RuntimeServices:
    """Dependencies owned by RuntimeManager and shared by all nodes."""

    tool_manager: ToolManager
    memory_manager: MemoryManager
    event_bus: EventBus
    run_context: RunContext
    runtime_manager: Any = None

    @classmethod
    def create(
        cls,
        *,
        graph_id: str = "",
        session_id: str | None = None,
        user_id: str | None = None,
        tenant_id: str | None = None,
    ) -> "RuntimeServices":
        event_bus = EventBus()
        context = RunContext(
            graph_id=graph_id,
            session_id=session_id,
            user_id=user_id,
            tenant_id=tenant_id,
        )
        return cls(
            tool_manager=ToolManager(event_bus=event_bus),
            memory_manager=MemoryManager(),
            event_bus=event_bus,
            run_context=context,
        )

    def tool_manager_context(self) -> ToolContext:
        """Create a tool context from the currently managed component."""
        return ToolContext.for_caller(
            self.run_context,
            caller_type=self.run_context.caller_type,
            caller_id=self.run_context.caller_id,
            allowed_tools=self.run_context.permissions,
        )
