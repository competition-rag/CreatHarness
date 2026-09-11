"""Build the final user-facing response for the ordering flow."""

from __future__ import annotations

from agent import agent
from run_context import ComponentRequest, ComponentResponse


@agent(
    name="order_response_agent",
    description="根据意图识别结果和规则执行结果，生成最终返回给用户的订单系统回答。",
    input_type=dict,
    input_description="包含意图、菜品、订单号、创建订单结果和查询订单结果的完整状态",
    output_type=ComponentResponse,
    output_description="输出给用户的最终自然语言结果",
)
def order_response_agent(request: ComponentRequest) -> ComponentResponse:
    """Return the relevant branch result as the final answer."""
    inputs = request.inputs
    intent = inputs.get("intent", "")
    created_message = inputs.get("create_order_result", "")
    queried_message = inputs.get("query_order_result", "")
    router_message = inputs.get("router_message", "")
    order_items = inputs.get("order_items", [])
    query_order_id = inputs.get("query_order_id", "")

    if intent == "点餐":
        if created_message:
            final_answer = str(created_message)
        elif order_items:
            final_answer = f"已识别点餐请求，但订单尚未创建。菜品：{', '.join(map(str, order_items))}"
        else:
            final_answer = "已识别点餐请求，但没有提取到菜品内容。"
    elif intent == "查询订单":
        if queried_message:
            final_answer = str(queried_message)
        elif query_order_id:
            final_answer = f"已识别查询订单请求，但还没有查到订单号 {query_order_id} 的结果。"
        else:
            final_answer = "已识别查询订单请求，但没有提取到订单号。"
    else:
        final_answer = str(router_message or "暂时无法识别你的请求，请输入点餐内容或订单号。")

    return ComponentResponse(
        ok=True,
        data={"final_answer": final_answer},
    )
