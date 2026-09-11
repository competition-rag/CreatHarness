"""Create a dish list from the user's ordering request."""

# 输入：
# 用户点餐需求字符串。
#
# 输出：
# 由逗号分隔的菜品字符串。

from __future__ import annotations

from agent import agent
from run_context import ComponentRequest, ComponentResponse

@agent(name="thecreataget")
def thecreataget(request: ComponentRequest) -> ComponentResponse:
    """Extract a dish list from user input."""
    input_text = request.payload.get("input_text", "")
    if not isinstance(input_text, str):
        return ComponentResponse.failure("INVALID_INPUT", "input_text 必须是字符串")
    if not input_text.strip():
        return ComponentResponse(ok=True, data={"dish_list": []}, state_updates={"dish_list": []})

    qwen_chat = request.tool("qwen_chat")
    content = qwen_chat(
        system_prompt=(
            "根据用户问题输出菜品，多个菜品使用逗号或中文逗号分隔。"
            "例如：毛肚一份,牛肉一份,白菜 -> 毛肚,牛肉,白菜"
        ),
        prompt=input_text,
    )
    dishes = [
        item.strip()
        for item in content.replace("，", ",").split(",")
        if item.strip()
    ]
    return ComponentResponse(ok=True, data={"dish_list": dishes}, state_updates={"dish_list": dishes})


if __name__ == "__main__":
    import sys

    print(thecreataget(sys.stdin.read()))
