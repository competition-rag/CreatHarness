"""Coupon tool."""

from __future__ import annotations

from datetime import date
from tool_compat import tool

@tool
def coupon_tool(input_text: str) -> str:
    """判断当前日期或指定日期是否有优惠券。

    Args:
        input_text: 日期字符串，建议使用 YYYY-MM-DD；为空时默认当天。

    Returns:
        周一到周五返回有优惠券，周六到周日返回没有优惠券。
    """
    if not isinstance(input_text, str):
        raise TypeError("input_text must be a str")

    day = _parse_day(input_text.strip())
    if day.weekday() < 5:
        return "有优惠券"
    return "没有优惠券"


def _parse_day(input_text: str) -> date:
    if not input_text:
        return date.today()
    try:
        return date.fromisoformat(input_text)
    except ValueError:
        return date.today()


if __name__ == "__main__":
    import sys

    print(coupon_tool.invoke({"input_text": sys.stdin.read().strip()}))
