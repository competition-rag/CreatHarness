"""Tool controller."""

from __future__ import annotations

from pathlib import Path
from typing import Any
import inspect

from .tool_registry import ToolRegistry


class ToolController:
    """Dispatch tools by name with protocol validation."""

    def __init__(
        self,
        tools_dir: str | Path,
        permission_level: str = "root",
        allowed_tools: set[str] | None = None,
    ):
        self.registry = ToolRegistry(tools_dir)
        self.permission_level = permission_level
        self.allowed_tools = allowed_tools

    def call(self, tool_name: str, **kwargs: Any) -> str:
        self._check_permission(tool_name)
        tool = self.registry.load_tool(tool_name)
        protocol = self.registry.get_metadata(tool_name)

        self._validate_kwargs(tool, kwargs, protocol)
        result = self._invoke_tool(tool, kwargs)
        if not isinstance(result, str):
            raise TypeError(f"Tool {tool_name} must return str")
        return result

    def _check_permission(self, tool_name: str) -> None:
        if self.permission_level == "root":
            return
        if self.allowed_tools is None or tool_name not in self.allowed_tools:
            raise PermissionError(f"Tool not allowed for current permission: {tool_name}")

    @staticmethod
    def _validate_kwargs(
        tool: Any,
        kwargs: dict[str, Any],
        protocol: dict[str, Any],
    ) -> None:
        signature = ToolController._tool_signature(tool)
        expected = list(signature.parameters.keys())
        protocol_expected = [parameter["name"] for parameter in protocol.get("parameters", [])]
        missing = [name for name in expected if name not in kwargs]
        extra = [name for name in kwargs if name not in expected]
        if missing:
            raise ValueError(f"Missing tool parameters: {missing}")
        if extra:
            raise ValueError(f"Unexpected tool parameters: {extra}")
        if protocol_expected and protocol_expected != expected:
            raise ValueError(
                f"Tool protocol parameters do not match function signature: {protocol_expected} != {expected}"
            )

        for name, param in signature.parameters.items():
            annotation = param.annotation
            if annotation is str and not isinstance(kwargs[name], str):
                raise TypeError(f"Tool parameter {name} must be str")

    @staticmethod
    def _tool_signature(tool: Any) -> inspect.Signature:
        if hasattr(tool, "func"):
            return inspect.signature(tool.func)
        if callable(tool):
            return inspect.signature(tool)
        raise AttributeError("Tool must be callable or expose func")

    @staticmethod
    def _invoke_tool(tool: Any, kwargs: dict[str, Any]) -> Any:
        if hasattr(tool, "invoke"):
            return tool.invoke(kwargs)
        if callable(tool):
            return tool(**kwargs)
        raise AttributeError("Tool must be invokable")
