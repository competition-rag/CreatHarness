"""Import-time registration hook for adapter modules."""

from __future__ import annotations

import importlib


for module_name in (
    "text_list_adapter",
):
    try:
        importlib.import_module(module_name)
    except ImportError:
        continue
