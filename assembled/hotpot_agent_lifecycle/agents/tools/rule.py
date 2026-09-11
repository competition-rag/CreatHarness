"""Compatibility import for the shared @rule decorator.

Some legacy modules still import ``rule`` from the Agent tools directory.
Keep this shim compatible with the unified component protocol.
"""

from run_context import rule

__all__ = ["rule"]
