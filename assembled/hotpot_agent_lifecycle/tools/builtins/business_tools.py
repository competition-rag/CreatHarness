"""Business tools for payment checks and the ordering demo."""

from __future__ import annotations

import json
from datetime import datetime
from pathlib import Path
from typing import Any

from tools.core.tool_registry import tool


ORDER_LIBRARY_DIR = Path(__file__).resolve().parents[2] / "data" / "orders"


@tool(
    name="check_user_payment",
    description="判断用户是否已经支付，当前示例始终返回已支付。",
    allowed_callers={"agent", "rule", "harness"},
)
def check_user_payment(arguments: dict[str, Any], context: Any) -> bool:
    """Return whether the user has paid."""
    return True


@tool(
    name="check_available_tables",
    description="查询当前是否还有空桌，当前示例返回还有三张桌子。",
    allowed_callers={"agent", "rule", "harness"},
)
def check_available_tables(arguments: dict[str, Any], context: Any) -> int:
    """Return the number of available tables."""
    return 3


@tool(
    name="create_order_record",
    description="将点餐内容写入订单库目录并返回订单信息。",
    allowed_callers={"rule"},
    side_effect=True,
)
def create_order_record(arguments: dict[str, Any], context: Any) -> dict[str, Any]:
    """Persist one order as a JSON file under the local order library."""
    items = arguments.get("items", [])
    original_input = str(arguments.get("original_input", "") or "")
    if not isinstance(items, list) or not all(isinstance(item, str) for item in items):
        raise TypeError("items must be a list[str]")
    normalized_items = [item.strip() for item in items if item.strip()]
    if not normalized_items:
        raise ValueError("items cannot be empty")

    ORDER_LIBRARY_DIR.mkdir(parents=True, exist_ok=True)
    timestamp = datetime.now().strftime("%Y%m%d%H%M%S")
    order_id = f"ORD{timestamp}"
    file_path = ORDER_LIBRARY_DIR / f"{order_id}.json"
    suffix = 1
    while file_path.exists():
        order_id = f"ORD{timestamp}_{suffix}"
        file_path = ORDER_LIBRARY_DIR / f"{order_id}.json"
        suffix += 1

    record = {
        "order_id": order_id,
        "items": normalized_items,
        "status": "created",
        "created_at": datetime.now().isoformat(timespec="seconds"),
        "original_input": original_input,
    }
    file_path.write_text(
        json.dumps(record, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    return record


@tool(
    name="query_order_record",
    description="根据订单号在订单库目录中查询订单信息。",
    allowed_callers={"rule"},
)
def query_order_record(arguments: dict[str, Any], context: Any) -> dict[str, Any]:
    """Read one order record from the local order library."""
    order_id = str(arguments.get("order_id", "") or "").strip()
    if not order_id:
        raise ValueError("order_id is required")

    file_path = ORDER_LIBRARY_DIR / f"{order_id}.json"
    if not file_path.is_file():
        return {"found": False, "order_id": order_id, "order": None}

    record = json.loads(file_path.read_text(encoding="utf-8"))
    return {"found": True, "order_id": order_id, "order": record}
