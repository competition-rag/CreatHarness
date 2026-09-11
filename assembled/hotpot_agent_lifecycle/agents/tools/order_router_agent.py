"""Route the user request into order creation or order lookup."""

from __future__ import annotations

import re

from agent import agent
from run_context import ComponentRequest, ComponentResponse


def _extract_order_items(text: str) -> list[str]:
    normalized = (
        text.replace("，", ",")
        .replace("、", ",")
        .replace("和", ",")
        .replace("再来", ",")
    )
    normalized = re.sub(r"(我要|我想|帮我|请|点餐|下单|来一份|来一单|来|点)", "", normalized)
    normalized = re.sub(r"\s+", "", normalized)
    items = [item.strip() for item in normalized.split(",") if item.strip()]
    cleaned = [item for item in items if item not in {"查询订单", "查询", "订单"}]
    return cleaned


def _extract_order_id(text: str) -> str:
    patterns = [
        r"(ORD[0-9A-Z_-]{4,})",
        r"(order_[0-9A-Za-z_-]{4,})",
        r"(?:订单号|订单)\s*[:：]?\s*([0-9A-Za-z_-]{4,})",
    ]
    for pattern in patterns:
        match = re.search(pattern, text, re.IGNORECASE)
        if match:
            return match.group(1)
    return ""


@agent(
    name="order_router_agent",
    description="识别用户是要点餐还是查询订单，并提取菜品列表或订单号。",
    input_type=str,
    input_description="用户输入的点餐或查单请求字符串",
    output_type=ComponentResponse,
    output_description="输出意图、菜品列表、订单号和原始问题等结构化结果",
)
def order_router_agent(request: ComponentRequest) -> ComponentResponse:
    """Parse one user message into a stable order intent payload."""
    input_text = request.inputs.get("input_text", "")
    if not isinstance(input_text, str):
        return ComponentResponse.failure("INVALID_INPUT", "input_text 必须是字符串")

    text = input_text.strip()
    if not text:
        return ComponentResponse(
            ok=True,
            data={
                "intent": "",
                "order_items": [],
                "query_order_id": "",
                "router_message": "请输入点餐内容或订单号。",
            },
        )

    if "查询" in text and "订单" in text:
        order_id = _extract_order_id(text)
        return ComponentResponse(
            ok=True,
            data={
                "intent": "查询订单",
                "order_items": [],
                "query_order_id": order_id,
                "router_message": "已识别为查询订单请求。",
            },
        )

    items = _extract_order_items(text)
    return ComponentResponse(
        ok=True,
        data={
            "intent": "点餐",
            "order_items": items,
            "query_order_id": "",
            "router_message": "已识别为点餐请求。",
        },
    )
