"""Text tool."""

from __future__ import annotations
from tool_compat import tool

@tool
def text_tool(text: str) -> str:
    """统计文本字符数。

    Args:
        text: 需要统计字符数的文本。

    Returns:
        字符数结果字符串。
    """
    if not isinstance(text, str):
        raise TypeError("text must be a str")
    return str(len(text))
