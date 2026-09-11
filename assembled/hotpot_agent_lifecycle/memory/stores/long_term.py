"""SQLite-backed long-term memory store."""

from __future__ import annotations

import json
import sqlite3
from pathlib import Path

from memory.models import MemoryItem, MemoryQuery


class LongTermMemoryStore:
    """Persist user memories locally with simple text search."""

    def __init__(self, database_path: str | Path) -> None:
        self.database_path = Path(database_path)
        self.database_path.parent.mkdir(parents=True, exist_ok=True)
        self._initialize()

    def _connect(self) -> sqlite3.Connection:
        connection = sqlite3.connect(self.database_path)
        connection.row_factory = sqlite3.Row
        return connection

    def _initialize(self) -> None:
        connection = self._connect()
        try:
            connection.execute(
                """
                CREATE TABLE IF NOT EXISTS memories (
                    memory_id TEXT PRIMARY KEY,
                    content TEXT NOT NULL,
                    user_id TEXT,
                    session_id TEXT,
                    source TEXT,
                    memory_type TEXT NOT NULL,
                    importance REAL NOT NULL,
                    confidence REAL NOT NULL,
                    created_at TEXT NOT NULL,
                    expires_at TEXT,
                    metadata TEXT NOT NULL
                )
                """
            )
            connection.commit()
        finally:
            connection.close()

    def save(self, item: MemoryItem) -> MemoryItem:
        connection = self._connect()
        try:
            connection.execute(
                """
                INSERT OR REPLACE INTO memories
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    item.memory_id,
                    item.content,
                    item.user_id,
                    item.session_id,
                    item.source,
                    item.memory_type,
                    item.importance,
                    item.confidence,
                    item.created_at,
                    item.expires_at,
                    json.dumps(item.metadata, ensure_ascii=False),
                ),
            )
            connection.commit()
        finally:
            connection.close()
        return item

    def search(self, query: MemoryQuery) -> list[MemoryItem]:
        clauses = []
        values: list[object] = []
        if query.user_id is not None:
            clauses.append("user_id = ?")
            values.append(query.user_id)
        if query.session_id is not None:
            clauses.append("session_id = ?")
            values.append(query.session_id)
        if query.query:
            clauses.append("content LIKE ?")
            values.append(f"%{query.query}%")

        where = f"WHERE {' AND '.join(clauses)}" if clauses else ""
        values.append(max(1, query.limit))
        connection = self._connect()
        try:
            rows = connection.execute(
                f"""
                SELECT * FROM memories
                {where}
                ORDER BY importance DESC, created_at DESC
                LIMIT ?
                """,
                values,
            ).fetchall()
        finally:
            connection.close()
        return [self._from_row(row) for row in rows]

    def delete(self, memory_id: str) -> None:
        connection = self._connect()
        try:
            connection.execute(
                "DELETE FROM memories WHERE memory_id = ?",
                (memory_id,),
            )
            connection.commit()
        finally:
            connection.close()

    @staticmethod
    def _from_row(row: sqlite3.Row) -> MemoryItem:
        return MemoryItem(
            memory_id=row["memory_id"],
            content=row["content"],
            user_id=row["user_id"],
            session_id=row["session_id"],
            source=row["source"],
            memory_type=row["memory_type"],
            importance=row["importance"],
            confidence=row["confidence"],
            created_at=row["created_at"],
            expires_at=row["expires_at"],
            metadata=json.loads(row["metadata"]),
        )
