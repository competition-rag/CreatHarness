"""State shared by one complete graph execution."""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any
from uuid import uuid4


@dataclass
class RunContext:
    """Global runtime context shared by nodes, models, tools, and observers."""

    run_id: str = field(default_factory=lambda: uuid4().hex)
    graph_id: str = ""
    session_id: str | None = None
    user_id: str | None = None
    tenant_id: str | None = None

    current_node_id: str = ""
    caller_type: str = ""
    caller_id: str = ""
    permissions: set[str] = field(default_factory=set)
    metadata: dict[str, Any] = field(default_factory=dict)
    usage: dict[str, Any] = field(default_factory=dict)
    status: str = "running"
    error: Exception | None = None

