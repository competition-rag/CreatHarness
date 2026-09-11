"""Synchronous timeout harness for a child node or subgraph."""

from __future__ import annotations

from run_context import ComponentRequest, ComponentResponse
from harness import harness


@harness(name="timeout_harness")
class TimeoutHarness:
    """Measure child execution time without creating worker threads.

    Python cannot interrupt an already-running synchronous function safely.
    The manager therefore executes the child normally and ``end`` raises when
    the configured deadline was exceeded. This keeps Harness composition
    deterministic and leaves cancellation to the underlying agent/tool.
    """

    def __init__(self, timeout_seconds: float = 30, message: str = ""):
        self.timeout_seconds = float(timeout_seconds)
        self.message = message or f"执行超过 {self.timeout_seconds:g} 秒"
        self._started_at: float | None = None

    def start(self, request: ComponentRequest) -> ComponentResponse:
        _inputs = request.inputs
        monotonic_clock = request.tool("monotonic_clock")
        self._started_at = monotonic_clock()
        return ComponentResponse(ok=True)

    def end(
        self,
        request: ComponentRequest,
        response: ComponentResponse,
    ) -> ComponentResponse:
        if self._started_at is None:
            raise RuntimeError("TimeoutHarness.end() called before start()")
        _child_outputs = response.outputs
        monotonic_clock = request.tool("monotonic_clock")
        elapsed = monotonic_clock() - self._started_at
        self._started_at = None
        if elapsed > self.timeout_seconds:
            return ComponentResponse.failure(
                "TIMEOUT",
                f"{self.message}（实际耗时 {elapsed:.2f} 秒）",
            )
        return response
