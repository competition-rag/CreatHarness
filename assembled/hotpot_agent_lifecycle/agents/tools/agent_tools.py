"""Example tools available to Agents."""

from __future__ import annotations

import os
from typing import Any

from tools.core.tool_registry import tool


@tool(
    name="qwen_chat",
    description="调用千问兼容 API 生成文本回答。",
    allowed_callers={"agent"},
)
def qwen_chat(arguments: dict[str, Any], context: Any) -> str:
    """Call Qwen through the centralized Agent tool registry."""
    try:
        from openai import OpenAI
    except ImportError as exc:
        raise RuntimeError(
            "The openai package is required. Install it with: pip install openai"
        ) from exc

    api_key = os.getenv("QWEN_API_KEY") or os.getenv("DASHSCOPE_API_KEY")
    if not api_key:
        raise ValueError(
            "Missing Qwen API key. Set the QWEN_API_KEY or DASHSCOPE_API_KEY environment variable."
        )

    client = OpenAI(
        api_key=api_key,
        base_url=os.getenv(
            "QWEN_BASE_URL",
            "https://dashscope.aliyuncs.com/compatible-mode/v1",
        ),
    )
    response = client.chat.completions.create(
        model=os.getenv("QWEN_MODEL", "qwen-plus"),
        messages=[
            {
                "role": "system",
                "content": arguments.get("system_prompt", ""),
            },
            {"role": "user", "content": arguments["prompt"]},
        ],
    )
    content = response.choices[0].message.content or ""
    context.usage["model_calls"] = context.usage.get("model_calls", 0) + 1
    return content
