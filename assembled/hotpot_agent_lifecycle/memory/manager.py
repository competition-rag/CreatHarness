"""Unified management API for short-term and long-term memory."""

from __future__ import annotations

from pathlib import Path

from memory.models import MemoryItem, MemoryQuery
from memory.policies import MemoryPolicy
from memory.stores.long_term import LongTermMemoryStore
from memory.stores.short_term import ShortTermMemoryStore


class MemoryManager:
    """Route memory operations without exposing storage details to callers."""

    def __init__(
        self,
        *,
        database_path: str | Path = Path("memory") / "data" / "long_term.sqlite3",
        short_term: ShortTermMemoryStore | None = None,
        long_term: LongTermMemoryStore | None = None,
        policy: MemoryPolicy | None = None,
    ) -> None:
        self.short_term = short_term or ShortTermMemoryStore()
        self.long_term = long_term or LongTermMemoryStore(database_path)
        self.policy = policy or MemoryPolicy()

    def save_short_term(self, item: MemoryItem) -> MemoryItem:
        return self.short_term.save(item)

    def search_short_term(self, query: MemoryQuery) -> list[MemoryItem]:
        return self.short_term.search(query)

    def save_long_term(self, item: MemoryItem) -> MemoryItem:
        if not self.policy.can_persist(item):
            raise PermissionError("Memory policy rejected persistent memory")
        return self.long_term.save(item)

    def search_long_term(self, query: MemoryQuery) -> list[MemoryItem]:
        return self.long_term.search(query)

    def delete_long_term(self, memory_id: str) -> None:
        self.long_term.delete(memory_id)

