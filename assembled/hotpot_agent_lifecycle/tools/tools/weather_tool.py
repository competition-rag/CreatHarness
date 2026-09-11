"""Weather tool."""

from __future__ import annotations
from tool_compat import tool

@tool
def weather_tool(location: str) -> str:
    """根据地点返回天气信息。

    Args:
        location: 要查询天气的地点名称。

    Returns:
        天气查询结果字符串。
    """
    if not isinstance(location, str):
        raise TypeError("location must be a str")
    location = location.strip()
    if not location:
        return "请输入地点"
    return f"{location} 的天气信息暂未接入真实天气服务"
