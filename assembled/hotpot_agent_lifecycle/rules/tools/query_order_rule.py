"""Query one order record from the order library."""

from __future__ import annotations

from rule import rule
from run_context import ComponentRequest, ComponentResponse


@rule(
    name="query_order_rule",
    description="当用户意图为查询订单时，调用订单查询工具在订单库中查找订单。",
    input_type=dict,
    input_description="包含意图、订单号和原始输入的结构化字典",
    output_type=ComponentResponse,
    output_description="输出查询结果字符串和订单详情",
)
def query_order_rule(request: ComponentRequest) -> ComponentResponse:
    """Look up an order only when the current intent is order query."""
    inputs = request.inputs
    intent = inputs.get("intent", "")
    order_id = str(inputs.get("query_order_id", "") or "").strip()

    if intent != "查询订单":
        return ComponentResponse(
            ok=True,
            data={
                "query_order_result": "",
                "queried_order_record": None,
            },
        )

    if not order_id:
        return ComponentResponse(
            ok=True,
            data={
                "query_order_result": "请提供要查询的订单号。",
                "queried_order_record": None,
            },
        )

    query_order = request.tool("query_order_record")
    result = query_order(order_id=order_id)
    if result.get("found"):
        record = result.get("order", {})
        items = record.get("items", [])
        joined_items = "、".join(str(item) for item in items) if items else "无菜品信息"
        message = f"订单 {order_id} 存在，菜品为：{joined_items}。"
    else:
        message = f"订单 {order_id} 不存在。"

    return ComponentResponse(
        ok=True,
        data={
            "query_order_result": message,
            "queried_order_record": result.get("order"),
        },
    )
