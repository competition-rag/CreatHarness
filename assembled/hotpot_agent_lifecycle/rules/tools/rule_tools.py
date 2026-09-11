"""Example tools available to Rules."""

from __future__ import annotations

from typing import Any

from tools.core.tool_registry import tool


WEIGHT_MAP = {
    "毛肚": 0.5,
    "牛肉": 0.5,
    "羊肉": 0.5,
    "鸡肉": 0.5,
    "虾": 0.4,
    "鱼": 0.8,
    "蔬菜": 0.3,
    "白菜": 0.3,
    "土豆": 0.4,
    "豆腐": 0.4,
    "面条": 0.3,
}


@tool(
    name="calculate_dish_weight",
    description="根据菜品名称计算每道菜和所有菜品的估算重量。",
    allowed_callers={"rule"},
)
def calculate_dish_weight(arguments: dict[str, Any], context: Any) -> str:
    """Calculate a deterministic weight report for a dish list."""
    dishes = arguments.get("dishes", [])
    if not isinstance(dishes, list) or not all(
        isinstance(item, str) for item in dishes
    ):
        raise TypeError("dishes must be a list[str]")

    normalized = [item.strip() for item in dishes if item.strip()]
    if not normalized:
        return "未输入菜品，无法计算重量"

    details: list[str] = []
    total_weight = 0.0
    for dish in normalized:
        weight = next(
            (value for keyword, value in WEIGHT_MAP.items() if keyword in dish),
            0.5,
        )
        total_weight += weight
        details.append(f"{dish}:{weight:g}KG")

    status = "未超过2KG" if total_weight <= 2.0 else "超过2KG"
    return f"菜品重量：{'、'.join(details)}；总重量：{total_weight:g}KG；{status}"
