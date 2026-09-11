"""Validate the estimated total weight of selected dishes."""

# 输入：
# 由多个菜品名称组成的字符串列表，例如 ["毛肚", "牛肉", "白菜"]。
#
# 输出：
# 每个菜品的估算重量、总重量，以及总重量是否超过限制。

from __future__ import annotations

from rule import rule
from run_context import ComponentRequest, ComponentResponse


@rule(name="dish_weight_rule")
def dish_weight_rule(request: ComponentRequest) -> ComponentResponse:
    """Estimate dish weights from a list of dish strings."""
    dishes = request.payload.get("dish_list", [])
    if not isinstance(dishes, list) or not all(isinstance(item, str) for item in dishes):
        return ComponentResponse.failure("INVALID_INPUT", "dish_list 必须是 list[str]")

    weight_tool = request.tool("calculate_dish_weight")
    report = weight_tool(dishes=dishes)
    return ComponentResponse(
        ok=True,
        data={"weight_report": report},
        state_updates={"weight_report": report},
    )


if __name__ == "__main__":
    import sys

    input_text = sys.stdin.read().replace("，", ",")
    dishes = [item.strip() for item in input_text.split(",") if item.strip()]
    print(dish_weight_rule(dishes))
