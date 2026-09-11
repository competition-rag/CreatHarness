"""Data models shared by short-term and long-term memory."""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any
from uuid import uuid4


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


@dataclass
class MemoryItem:
    """One piece of memory with ownership and retention metadata."""

    content: str
    memory_id: str = field(default_factory=lambda: uuid4().hex)
    user_id: str | None = None
    session_id: str | None = None
    source: str = ""
    memory_type: str = "conversation"
    importance: float = 0.5
    confidence: float = 1.0
    created_at: str = field(default_factory=utc_now)
    expires_at: str | None = None
    metadata: dict[str, Any] = field(default_factory=dict)


@dataclass(frozen=True)
class MemoryQuery:
    """Scope and filtering conditions for a memory lookup."""

    query: str = ""
    user_id: str | None = None
    session_id: str | None = None
    limit: int = 10

