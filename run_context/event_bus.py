"""Synchronous event distribution for runtime observers."""

from __future__ import annotations

from typing import Any, Protocol

from .events import RuntimeEvent


class EventObserver(Protocol):
    def on_event(self, event: RuntimeEvent) -> None:
        ...


class EventBus:
    """Dispatch events synchronously in registration order."""

    def __init__(self, observers: list[EventObserver] | None = None) -> None:
        self.observers = observers or []
        self.history: list[RuntimeEvent] = []

    def subscribe(self, observer: EventObserver) -> None:
        self.observers.append(observer)

    def emit(
        self,
        event_type: str,
        context: Any,
        *,
        scope: str = "",
        payload: dict[str, Any] | None = None,
    ) -> RuntimeEvent:
        run_context = getattr(context, "run_context", context)
        event = RuntimeEvent(
            event_type=event_type,
            context=run_context,
            scope=scope,
            payload=payload or {},
        )
        self.history.append(event)
        for observer in self.observers:
            observer.on_event(event)
        return event
