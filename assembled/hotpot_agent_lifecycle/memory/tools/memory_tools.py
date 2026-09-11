"""ToolManager entry points for memory operations."""

from __future__ import annotations

from typing import Any

from memory.manager import MemoryManager
from memory.models import MemoryItem, MemoryQuery
from tools.core.tool_registry import tool


DEFAULT_MEMORY_MANAGER = MemoryManager()


def _manager(context: Any) -> MemoryManager:
    """Use the MemoryManager owned by the current Runtime when available."""
    return context.metadata.get("_memory_manager", DEFAULT_MEMORY_MANAGER)


def _scope(arguments: dict[str, Any], context: Any) -> tuple[str | None, str | None]:
    user_id = arguments.get("user_id") or context.metadata.get("user_id")
    session_id = arguments.get("session_id") or context.metadata.get("session_id")
    return user_id, session_id


@tool(
    name="search_short_term_memory",
    description="检索当前会话的近期上下文。",
    allowed_callers={"agent", "rule"},
)
def search_short_term_memory(arguments: dict[str, Any], context: Any) -> list[dict[str, Any]]:
    user_id, session_id = _scope(arguments, context)
    items = _manager(context).search_short_term(
        MemoryQuery(
            query=arguments.get("query", ""),
            user_id=user_id,
            session_id=session_id,
            limit=int(arguments.get("limit", 10)),
        )
    )
    return [item.__dict__ for item in items]


@tool(
    name="save_short_term_memory",
    description="保存当前会话中的临时上下文。",
    allowed_callers={"agent", "rule"},
)
def save_short_term_memory(arguments: dict[str, Any], context: Any) -> dict[str, Any]:
    user_id, session_id = _scope(arguments, context)
    item = _manager(context).save_short_term(
        MemoryItem(
            content=str(arguments["content"]),
            user_id=user_id,
            session_id=session_id,
            source=str(arguments.get("source", context.caller_id)),
            memory_type=str(arguments.get("memory_type", "conversation")),
            metadata=dict(arguments.get("metadata", {})),
        )
    )
    return item.__dict__


@tool(
    name="search_long_term_memory",
    description="检索用户的长期记忆。",
    allowed_callers={"agent", "rule"},
)
def search_long_term_memory(arguments: dict[str, Any], context: Any) -> list[dict[str, Any]]:
    user_id, session_id = _scope(arguments, context)
    items = _manager(context).search_long_term(
        MemoryQuery(
            query=arguments.get("query", ""),
            user_id=user_id,
            session_id=session_id,
            limit=int(arguments.get("limit", 10)),
        )
    )
    return [item.__dict__ for item in items]


@tool(
    name="save_long_term_memory",
    description="经过记忆策略检查后保存用户长期记忆。",
    allowed_callers={"agent"},
)
def save_long_term_memory(arguments: dict[str, Any], context: Any) -> dict[str, Any]:
    user_id, session_id = _scope(arguments, context)
    item = _manager(context).save_long_term(
        MemoryItem(
            content=str(arguments["content"]),
            user_id=user_id,
            session_id=session_id,
            source=str(arguments.get("source", context.caller_id)),
            memory_type=str(arguments.get("memory_type", "user_preference")),
            confidence=float(arguments.get("confidence", 1.0)),
            importance=float(arguments.get("importance", 0.5)),
            metadata=dict(arguments.get("metadata", {})),
        )
    )
    return item.__dict__
