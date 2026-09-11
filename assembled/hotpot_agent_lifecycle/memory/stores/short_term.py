"""In-process short-term memory store."""

from __future__ import annotations

from memory.models import MemoryItem, MemoryQuery


class ShortTermMemoryStore:
    """Keep recent session memories in process memory."""

    def __init__(self, max_items_per_session: int = 50) -> None:
        self.max_items_per_session = max_items_per_session
        self._items: dict[str, list[MemoryItem]] = {}

    def save(self, item: MemoryItem) -> MemoryItem:
        key = item.session_id or item.user_id or "anonymous"
        bucket = self._items.setdefault(key, [])
        bucket.append(item)
        del bucket[:-self.max_items_per_session]
        return item

    def search(self, query: MemoryQuery) -> list[MemoryItem]:
        key = query.session_id or query.user_id or "anonymous"
        items = self._items.get(key, [])
        if not query.query:
            return list(reversed(items[-query.limit :]))
        terms = query.query.lower().split()
        matches = [
            item
            for item in reversed(items)
            if all(term in item.content.lower() for term in terms)
        ]
        return matches[: query.limit]

    def delete(self, memory_id: str) -> None:
        for bucket in self._items.values():
            bucket[:] = [item for item in bucket if item.memory_id != memory_id]

