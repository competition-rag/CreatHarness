"""Storage interfaces for memory implementations."""

from __future__ import annotations

from typing import Protocol

from memory.models import MemoryItem, MemoryQuery


class MemoryStore(Protocol):
    def save(self, item: MemoryItem) -> MemoryItem:
        ...

    def search(self, query: MemoryQuery) -> list[MemoryItem]:
        ...

    def delete(self, memory_id: str) -> None:
        ...

