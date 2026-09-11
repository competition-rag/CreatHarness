"""Top-level lifecycle manager for graph execution."""

from __future__ import annotations

from typing import Any, Callable
from uuid import uuid4

from run_context import (
    ComponentRef,
    ComponentRequest,
    ComponentResponse,
    ExecutionTarget,
    RunContext,
)

from .services import RuntimeServices


class RuntimeManager:
    """Create one execution context and route every node through it."""

    CALLER_TYPE_ALIASES = {
        "agent": "agent",
        "agent_tool": "agent",
        "rule": "rule",
        "rule_tool": "rule",
        "harness": "harness",
        "adapter": "rule",
    }

    def __init__(self, services: RuntimeServices) -> None:
        self.services = services

    @classmethod
    def create(
        cls,
        *,
        graph_id: str = "",
        session_id: str | None = None,
        user_id: str | None = None,
        tenant_id: str | None = None,
    ) -> "RuntimeManager":
        services = RuntimeServices.create(
            graph_id=graph_id,
            session_id=session_id,
            user_id=user_id,
            tenant_id=tenant_id,
        )
        manager = cls(services)
        services.runtime_manager = manager
        return manager

    def invoke(
        self,
        graph: Any,
        input_state: dict[str, Any],
    ) -> dict[str, Any]:
        """Run a compiled graph with the shared RuntimeServices."""
        previous = self.services.run_context
        context = RunContext(
            run_id=uuid4().hex,
            graph_id=previous.graph_id,
            session_id=previous.session_id,
            user_id=previous.user_id,
            tenant_id=previous.tenant_id,
        )
        self.services.run_context = context
        context.metadata["_memory_manager"] = self.services.memory_manager
        context.status = "running"
        self.services.event_bus.emit("run_started", context, scope="run")
        state = dict(input_state)
        state["_run_context"] = context
        try:
            result = graph.invoke(state)
            context.status = "completed"
            self.services.event_bus.emit(
                "run_finished",
                context,
                scope="run",
                payload={"result": result},
            )
            return result
        except Exception as error:
            context.status = "failed"
            context.error = error
            self.services.event_bus.emit(
                "run_failed",
                context,
                scope="run",
                payload={"error": str(error)},
            )
            raise

    def execute_node(
        self,
        *,
        node_id: str,
        node_type: str,
        caller_id: str,
        operation: Callable[[ComponentRequest], ComponentResponse],
        state: dict[str, Any],
        payload: dict[str, Any] | None = None,
        target: ExecutionTarget | None = None,
        allowed_tools: set[str] | None = None,
    ) -> dict[str, Any]:
        """Build the common request, execute one component, and merge its response."""
        context = self.services.run_context
        normalized_type = self.normalize_caller_type(node_type)
        context.current_node_id = node_id
        context.caller_type = normalized_type
        context.caller_id = caller_id
        context.permissions = allowed_tools or set()
        request = ComponentRequest(
            run_context=context,
            state=dict(state),
            payload=payload or {},
            component=ComponentRef(
                id=node_id,
                name=caller_id.rsplit(".", 1)[-1],
                kind=normalized_type,
            ),
            target=target,
            services=self.services,
            metadata={"node_type": node_type},
        )
        self.services.event_bus.emit(
            "node_started",
            context,
            scope="node",
            payload={"node_type": node_type, "caller_type": normalized_type},
        )
        try:
            result = operation(request)
            if not isinstance(result, ComponentResponse):
                raise TypeError(
                    f"Component '{caller_id}' must return ComponentResponse"
                )
            if not result.ok:
                message = result.error.message if result.error else "组件执行失败"
                raise RuntimeError(message)
            self.services.event_bus.emit(
                "node_finished",
                context,
                scope="node",
                payload={"result": result.data},
            )
            return result.state_updates
        except Exception as error:
            context.error = error
            self.services.event_bus.emit(
                "node_failed",
                context,
                scope="node",
                payload={"error": str(error)},
            )
            raise

    @classmethod
    def normalize_caller_type(cls, node_type: str) -> str:
        """Map graph node kinds to the stable permission categories."""
        return cls.CALLER_TYPE_ALIASES.get(node_type, node_type)
