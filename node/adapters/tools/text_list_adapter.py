"""Example adapter that converts one text field into a string list."""

from __future__ import annotations

from adapter import adapter
from run_context import ComponentRequest, ComponentResponse


@adapter(name="text_list_adapter")
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
