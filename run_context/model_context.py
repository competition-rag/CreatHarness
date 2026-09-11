"""Context for one model request."""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

from .run_context import RunContext


@dataclass
class ModelContext:
    """Per-call model data linked to the parent RunContext."""

    run_context: RunContext
    model: str = ""
    messages: list[dict[str, Any]] = field(default_factory=list)
    request: dict[str, Any] = field(default_factory=dict)
    response: Any = None
    input_tokens: int = 0
    output_tokens: int = 0
    error: Exception | None = None

    @property
    def run_id(self) -> str:
        return self.run_context.run_id
