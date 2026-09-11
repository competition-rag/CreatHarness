"""Create one order record in the order library."""

from __future__ import annotations

from rule import rule
from run_context import ComponentRequest, ComponentResponse


@rule(name="create_order_rule")
def create_order_rule(request: ComponentRequest) -> ComponentResponse:
    """Create an order only when the current intent is order placement."""
    inputs = request.inputs
    intent = inputs.get("intent", "")
    items = inputs.get("order_items", [])
    input_text = inputs.get("input_text", "")

    if intent != "点餐":
        return ComponentResponse(
            ok=True,
            data={
                "create_order_result": "",
                "created_order_id": "",
                "created_order_record": None,
            },
        )

    if not isinstance(items, list) or not all(isinstance(item, str) for item in items):
        return ComponentResponse.failure("INVALID_INPUT", "order_items 必须是 list[str]")
    if not items:
        return ComponentResponse(
            ok=True,
            data={
                "create_order_result": "没有识别到要下单的菜品，请补充点餐内容。",
                "created_order_id": "",
                "created_order_record": None,
            },
        )

    create_order = request.tool("create_order_record")
    order_record = create_order(items=items, original_input=input_text)
    order_id = str(order_record.get("order_id", ""))
    return ComponentResponse(
        ok=True,
        data={
            "create_order_result": f"订单已经创建完成，订单号是 {order_id}。",
            "created_order_id": order_id,
            "created_order_record": order_record,
        },
    )
