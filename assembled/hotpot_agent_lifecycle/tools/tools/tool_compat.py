"""Compatibility wrapper for LangChain's @tool decorator."""

from __future__ import annotations

from functools import wraps
from typing import Any, Callable, TypeVar
import inspect

F = TypeVar("F", bound=Callable[..., Any])

try:
    from langchain_core.tools import tool as langchain_tool

    tool = langchain_tool
except ImportError:
    class SimpleTool:
        """Fallback tool object with a LangChain-like invoke interface."""

        def __init__(self, func: Callable[..., Any]):
            self.func = func
            self.name = func.__name__
            self.description = func.__doc__ or ""
            self.args_schema = None

        def invoke(self, values: dict[str, Any]) -> Any:
            return self.func(**values)

        def __call__(self, *args: Any, **kwargs: Any) -> Any:
            return self.func(*args, **kwargs)

    def tool(func: F) -> SimpleTool:
        """Fallback @tool decorator when LangChain is unavailable."""

        @wraps(func)
        def wrapped(*args: Any, **kwargs: Any):
            return func(*args, **kwargs)

        wrapped.__signature__ = inspect.signature(func)
        return SimpleTool(wrapped)
