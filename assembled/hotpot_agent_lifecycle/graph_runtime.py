"""Generated LangGraph runtime for an assembled Rules package."""

from __future__ import annotations

import importlib
import sys
from pathlib import Path
from typing import Any, TypedDict

import yaml
from langgraph.graph import END, START, StateGraph

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
if hasattr(sys.stderr, "reconfigure"):
    sys.stderr.reconfigure(encoding="utf-8", errors="replace")
sys.path.insert(0, str(Path(__file__).parent / "harness" / "tools"))
sys.path.insert(0, str(Path(__file__).parent / "adapters" / "tools"))
sys.path.insert(0, str(Path(__file__).parent))
sys.path.insert(0, str(Path(__file__).parent / "memory" / "tools"))
sys.path.insert(0, str(Path(__file__).parent / "tools" / "core"))
from harness_manager import HarnessManager
from run_context import (
    ComponentRequest,
    ComponentResponse,
    ComponentRef,
    ExecutionTarget,
    RunContext,
)
from runtime import RuntimeManager, RuntimeServices
from tools.core import ToolManager


class AgentState(TypedDict, total=False):
    input_text: str
    intent: str
    order_items: list[str]
    query_order_id: str
    router_message: str
    create_order_result: str
    created_order_id: str
    created_order_record: Any
    query_order_result: str
    queried_order_record: Any
    final_answer: str


def _load_handler(handler: str):
    module_name, attr_name = handler.rsplit(".", 1)
    sys.path.insert(0, str(Path(__file__).parent))
    sys.path.insert(0, str(Path(__file__).parent / "rules" / "tools"))
    sys.path.insert(0, str(Path(__file__).parent / "agents" / "tools"))
    sys.path.insert(0, str(Path(__file__).parent / "adapters" / "tools"))
    sys.path.insert(0, str(Path(__file__).parent / "harness" / "tools"))
    sys.path.insert(0, str(Path(__file__).parent / "adapt_rules"))
    module = importlib.import_module(module_name)
    return getattr(module, attr_name)


def _load_tools() -> None:
    """Import decorated tools so they register before graph execution."""
    sys.path.insert(0, str(Path(__file__).parent / "agents" / "tools"))
    sys.path.insert(0, str(Path(__file__).parent / "rules" / "tools"))
    sys.path.insert(0, str(Path(__file__).parent / "adapters" / "tools"))
    sys.path.insert(0, str(Path(__file__).parent / "harness" / "tools"))
    sys.path.insert(0, str(Path(__file__).parent / "memory" / "tools"))
    sys.path.insert(0, str(Path(__file__).parent))
    importlib.import_module("agent_tools")
    importlib.import_module("rule_tools")
    importlib.import_module("adapter_tools")
    importlib.import_module("harness_tools")
    importlib.import_module("tools.builtins.business_tools")
    importlib.import_module("memory_tools")


def _make_node(node: dict[str, Any], runtime_services: RuntimeServices):
    component = _load_handler(node["handler"])
    input_config = node.get("input", {})
    output_config = node.get("output", {})

    def run(state: dict[str, Any]):
        payload = _build_payload(input_config, state)
        print(f"[生命周期] 开始节点: {node['id']}", flush=True)
        print(f"[生命周期] 输入: {payload}", flush=True)
        return runtime_services.runtime_manager.execute_node(
            node_id=node["id"],
            node_type=node["type"],
            caller_id=node["handler"],
            operation=lambda request: _execute_component(
                component,
                request,
                output_config,
            ),
            state=state,
            payload=payload,
            allowed_tools=set(node.get("tools", [])),
        )

    return run


def _make_managed_runner(
    node: dict[str, Any],
    runner,
    runtime_services: RuntimeServices,
):
    def managed(state: dict[str, Any]):
        return runtime_services.runtime_manager.execute_node(
            node_id=node["id"],
            node_type=node["type"],
            caller_id=node.get("handler", node["id"]),
            operation=runner,
            state=state,
            allowed_tools=set(node.get("tools", [])),
        )

    return managed


def _build_payload(input_config: dict[str, Any], state: dict[str, Any]) -> dict[str, Any]:
    if not input_config:
        return {}
    if "field" in input_config:
        field = input_config["field"]
        return {field: state.get(field)}
    fields = input_config.get("fields", [])
    if isinstance(fields, dict):
        return {
            output_name: state.get(source_name)
            for output_name, source_name in fields.items()
        }
    return {field: state.get(field) for field in fields}


def _normalize_state_updates(
    output_config: dict[str, Any],
    result: ComponentResponse,
) -> dict[str, Any]:
    current_updates = dict(result.state_updates or {})
    if not output_config:
        return current_updates

    source = dict(result.data or {})
    source.update(current_updates)

    if "field" in output_config:
        target_field = output_config["field"]
        if target_field in current_updates:
            return current_updates
        return {**current_updates, target_field: source.get(target_field)}

    fields = output_config.get("fields", [])
    resolved_updates = dict(current_updates)
    if isinstance(fields, dict):
        for target_field, source_field in fields.items():
            if target_field in resolved_updates:
                continue
            resolved_updates[target_field] = source.get(source_field)
        return resolved_updates
    for field in fields:
        if field in resolved_updates:
            continue
        resolved_updates[field] = source.get(field)
    return resolved_updates


def _execute_component(
    component: Any,
    request: ComponentRequest,
    output_config: dict[str, Any],
) -> ComponentResponse:
    request.component.instance = component
    if callable(component):
        result = component(request)
    elif hasattr(component, "run"):
        result = component().run(request)
    else:
        raise TypeError("Loaded component must be callable")
    if not isinstance(result, ComponentResponse):
        raise TypeError(
            f"Component '{request.component.name}' must return ComponentResponse"
        )
    result.state_updates = _normalize_state_updates(output_config, result)
    return result


def _build_graph_from_definition(
    definition: dict[str, Any],
    tool_manager: ToolManager | None = None,
    runtime_services: RuntimeServices | None = None,
):
    _load_tools()
    runtime_services = runtime_services or RuntimeServices.create(
        graph_id=str(definition.get("name", "")),
    )
    tool_manager = tool_manager or runtime_services.tool_manager
    builder = StateGraph(AgentState)
    node_by_id = {node["id"]: node for node in definition["nodes"]}
    runners: dict[str, Any] = {}

    def resolve_child(child_spec: dict[str, Any], stack: tuple[str, ...]):
        child_type = child_spec.get("type", "node")
        if child_type == "node":
            child_id = child_spec.get("ref")
            if not child_id:
                raise ValueError("Harness child node needs a ref")
            child_runner = make_runner(child_id, stack)
            child_node = node_by_id[child_id]
            return child_runner, ExecutionTarget(
                kind="node",
                node_id=child_id,
                component=ComponentRef(
                    id=child_id,
                    name=child_node.get("name", child_id),
                    kind=RuntimeManager.normalize_caller_type(child_node["type"]),
                ),
                executor=child_runner,
            )
        if child_type == "subgraph":
            graph_definition = child_spec.get("graph")
            if not isinstance(graph_definition, dict):
                raise ValueError("Harness child subgraph needs a graph definition")
            child_graph = _build_graph_from_definition(
                graph_definition,
                tool_manager,
                runtime_services,
            )
            return (
                lambda state: child_graph.invoke(state),
                ExecutionTarget(
                    kind="subgraph",
                    graph_id=str(graph_definition.get("name", "")),
                    executor=lambda state: child_graph.invoke(state),
                ),
            )
        raise ValueError(f"Unsupported harness child type: {child_type}")

    def apply_harness(runner, harness_config):
        configs = harness_config if isinstance(harness_config, list) else [harness_config]
        for config in reversed(configs):
            if not isinstance(config, dict) or not config.get("handler"):
                raise ValueError("Harness configuration needs a handler")
            runner = HarnessManager.compose(
                mode=config.get("mode", "contains"),
                harness_factory=_load_handler(config["handler"]),
                child=runner,
                config=config.get("config", {}),
                tool_manager=tool_manager,
                caller_id=config["handler"],
                permissions=set(config.get("tools", [])),
                runtime_services=runtime_services,
            )
        return runner

    def make_runner(node_id: str, stack: tuple[str, ...] = ()):
        if node_id in runners:
            return runners[node_id]
        if node_id in stack:
            cycle = " -> ".join((*stack, node_id))
            raise ValueError(f"Harness cycle detected: {cycle}")
        node = node_by_id.get(node_id)
        if not node:
            raise ValueError(f"Unknown harness child node: {node_id}")

        if node["type"] == "harness":
            harness_config = node.get("harness", {})
            child_spec = harness_config.get("child")
            if harness_config.get("attached", True) is False:
                runner = lambda state: state
                runners[node_id] = runner
                return runner
            if child_spec is None and harness_config.get("target"):
                child_spec = {"type": "node", "ref": harness_config["target"]}
            if not child_spec:
                raise ValueError(f"Harness node '{node_id}' needs a child")
            child_runner, child_target = resolve_child(
                child_spec,
                (*stack, node_id),
            )
            runner = HarnessManager.compose(
                mode=harness_config.get("mode", "contains"),
                harness_factory=_load_handler(node["handler"]),
                child=child_runner,
                child_target=child_target,
                config=harness_config.get("config", {}),
                tool_manager=tool_manager,
                caller_id=node_id,
                permissions=set(harness_config.get("tools", [])),
                runtime_services=runtime_services,
            )
        elif node["type"] in {"agent", "rule_tool", "adapter"}:
            runner = _make_node(node, runtime_services)
            if node.get("harness"):
                runner = apply_harness(runner, node["harness"])
        elif node["type"] == "user_input":
            runner = lambda state: state
        elif node["type"] == "builtin":
            runner = lambda state: state
        else:
            raise ValueError(f"Unsupported node type: {node['type']}")

        runners[node_id] = runner
        return runner

    for node in definition["nodes"]:
        builder.add_node(node["id"], make_runner(node["id"]))

    entrypoint = definition.get("entrypoint")
    exitpoint = definition.get("exitpoint")
    if entrypoint:
        builder.set_entry_point(entrypoint)
    if exitpoint:
        builder.set_finish_point(exitpoint)

    for edge in definition["edges"]:
        source = START if edge["from"] == "START" else edge["from"]
        target = END if edge["to"] == "END" else edge["to"]
        builder.add_edge(source, target)

    return builder.compile()


def build_graph(lifecycle_path: str | Path):
    lifecycle = yaml.safe_load(Path(lifecycle_path).read_text(encoding="utf-8"))
    runtime_manager = RuntimeManager.create(
        graph_id=str(lifecycle.get("name", "")),
    )
    graph = _build_graph_from_definition(
        lifecycle,
        runtime_services=runtime_manager.services,
    )
    graph._runtime_manager = runtime_manager
    return graph
