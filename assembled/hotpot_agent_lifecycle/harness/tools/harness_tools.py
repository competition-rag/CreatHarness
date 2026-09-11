"""Example tools available to Harnesses."""

from __future__ import annotations

import time
from typing import Any

from tools.core.tool_registry import tool


@tool(
    name="monotonic_clock",
    description="读取单调时钟，用于测量 Harness 包裹对象的执行耗时。",
    allowed_callers={"harness"},
)
def monotonic_clock(arguments: dict[str, Any], context: Any) -> float:
    """Return a clock that is safe for duration measurement."""
    return time.monotonic()
