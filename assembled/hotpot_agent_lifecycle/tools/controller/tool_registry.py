"""Tool registry."""

from __future__ import annotations

from pathlib import Path
import importlib.util
import inspect
import sys
from typing import Any

class ToolRegistry:
    """Load tool objects and derive metadata from the tool itself."""

    def __init__(self, tools_dir: str | Path):
        self.tools_dir = Path(tools_dir).resolve()
        self.tools_package = self.tools_dir / "tools"

    @staticmethod
    def _load_module(path: Path):
        spec = importlib.util.spec_from_file_location(path.stem, path)
        if spec is None or spec.loader is None:
            raise RuntimeError(f"Cannot load tool module: {path}")
        module = importlib.util.module_from_spec(spec)
        sys.path.insert(0, str(path.parent))
        spec.loader.exec_module(module)
        return module

    def load_tool(self, tool_name: str):
        tool_file = self.tools_package / f"{tool_name}.py"
        if not tool_file.is_file():
            raise KeyError(f"Unknown tool: {tool_name}")
        module = self._load_module(tool_file)
        if hasattr(module, tool_name):
            return getattr(module, tool_name)
        raise AttributeError(f"{tool_name}.py must export a @tool object")

    def get_metadata(self, tool_name: str) -> dict[str, Any]:
        tool = self.load_tool(tool_name)
        metadata: dict[str, Any] = {
            "name": getattr(tool, "name", tool_name),
            "description": getattr(tool, "description", tool.__doc__ or ""),
            "parameters": [],
            "returns": {
                "type": "str",
                "description": "字符串输出",
            },
        }

        signature = getattr(tool, "func", tool)
        for parameter in inspect.signature(signature).parameters.values():
            metadata["parameters"].append(
                {
                    "name": parameter.name,
                    "type": "str" if parameter.annotation is str else "Any",
                    "description": "",
                }
            )
        return metadata
