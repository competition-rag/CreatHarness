"""Policies controlling what may enter long-term memory."""

from __future__ import annotations

from memory.models import MemoryItem


class MemoryPolicy:
    """Conservative default policy for persistent memory."""

    def __init__(self, min_confidence: float = 0.8) -> None:
        self.min_confidence = min_confidence

    def can_persist(self, item: MemoryItem) -> bool:
        if not item.content.strip():
            return False
        if item.confidence < self.min_confidence:
            return False
        if item.metadata.get("sensitive"):
            return False
        return True

