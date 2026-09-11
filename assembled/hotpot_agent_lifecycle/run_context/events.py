"""Runtime events emitted for observation and auditing."""

from __future__ import annotations

from dataclasses import dataclass, field
from time import monotonic
from typing import Any

from .run_context import RunContext


@dataclass(frozen=True)
class RuntimeEvent:
    """A read-only event describing a runtime transition."""

    event_type: str
    context: RunContext
    timestamp: float = field(default_factory=monotonic)
    scope: str = ""
    payload: dict[str, Any] = field(default_factory=dict)
