"""Answer user questions with the Qwen API."""

# 输入：用户问题或需要处理的自然语言字符串。
# 输出：千问 API 生成的用户答案字符串。

from __future__ import annotations

import json

from agent import agent
from run_context import ComponentRequest, ComponentResponse

@agent(name="qwen_answer_agent")
def qwen_answer_agent(request: ComponentRequest) -> ComponentResponse:
    """Use Alibaba Cloud DashScope's OpenAI-compatible Qwen API."""
    inputs = dict(request.inputs)
    prompt = inputs.get("input_text", "")
    if prompt is not None and not isinstance(prompt, str):
        return ComponentResponse.failure("INVALID_INPUT", "input_text 必须是字符串")
    if not inputs or not str(prompt or "").strip():
        return ComponentResponse(
            ok=True,
            data={"final_answer": "请输入问题"},
            state_updates={"final_answer": "请输入问题"},
        )

    all_inputs = json.dumps(
        inputs,
        ensure_ascii=False,
        default=str,
        indent=2,
    )
    model_prompt = (
        f"用户问题：{str(prompt).strip()}\n\n"
        "以下是当前节点收到的全部输入，请结合所有字段生成最终回答：\n"
        f"{all_inputs}"
    )
    qwen_chat = request.tool("qwen_chat")
    answer = qwen_chat(
        system_prompt="你是一个餐饮服务员，根据提出的问题和工具给与的提示进行回答。",
        prompt=model_prompt,
    )
    return ComponentResponse(
        ok=True,
        data={"final_answer": answer},
        state_updates={"final_answer": answer},
    )


if __name__ == "__main__":
    import sys

    print(qwen_answer_agent(sys.stdin.read()))
