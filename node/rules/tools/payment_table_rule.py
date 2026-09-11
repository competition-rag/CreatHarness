"""Check payment and table availability from user input keywords."""

from __future__ import annotations

from rule import rule
from run_context import ComponentRequest, ComponentResponse


@rule(name="payment_table_rule")
def payment_table_rule(request: ComponentRequest) -> ComponentResponse:
    """Scan the input string and call tools for matched business fields."""
    input_text = request.inputs.get("input_text", "")
    if not isinstance(input_text, str):
        return ComponentResponse.failure("INVALID_INPUT", "payment_table_rule 输入必须是字符串")

    parts: list[str] = []
    payment_status = None
    available_tables = None

    matched_fields = set()
    for keyword in ("支付", "付款", "已付"):
        if keyword in input_text:
            matched_fields.add("payment")
            break
    for keyword in ("空桌", "桌子", "座位"):
        if keyword in input_text:
            matched_fields.add("tables")
            break

    if "payment" in matched_fields:
        payment_status = request.tool("check_user_payment")()
        parts.append(f"支付状态：{payment_status}")

    if "tables" in matched_fields:
        available_tables = request.tool("check_available_tables")()
        parts.append(f"空桌数量：{available_tables}")

    if not parts:
        parts.append("未检测到“支付”或“空桌”关键词")

    result = "；".join(parts)
    return ComponentResponse(
        ok=True,
        data={
            "result": result,
            "payment_status": payment_status,
            "available_tables": available_tables,
        },
    )
