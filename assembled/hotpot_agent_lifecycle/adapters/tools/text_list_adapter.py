"""Example adapter that converts one text field into a string list."""

from __future__ import annotations

from adapter import adapter
from run_context import ComponentRequest, ComponentResponse


@adapter(
    name="text_list_adapter",
    description="将字符串按逗号、顿号或换行拆分为列表。",
    input_type=str,
    input_description="待拆分的字符串输入",
    output_type=ComponentResponse,
    output_description="转换后的字符串列表输出",
    transform_from="str",
    transform_to="list[str]",
)
def text_list_adapter(request: ComponentRequest) -> ComponentResponse:
    """Split a text-like input into a cleaned string list."""
    inputs = request.inputs
    raw_value = None
    if len(inputs) == 1:
        raw_value = next(iter(inputs.values()))
    else:
        raw_value = inputs.get("input_text")
    if raw_value is None:
        return ComponentResponse(ok=True, data={"result": []})
    if isinstance(raw_value, list):
        items = [str(item).strip() for item in raw_value if str(item).strip()]
        return ComponentResponse(ok=True, data={"result": items})
    if not isinstance(raw_value, str):
        return ComponentResponse.failure("INVALID_INPUT", "adapter 输入必须是字符串或字符串列表")

    normalized = (
        raw_value.replace("，", ",")
        .replace("、", ",")
        .replace("\r\n", "\n")
        .replace("\n", ",")
    )
    items = [item.strip() for item in normalized.split(",") if item.strip()]
    return ComponentResponse(ok=True, data={"result": items})
