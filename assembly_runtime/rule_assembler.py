"""Assemble a Rules package into a runnable LangGraph agent package."""

from __future__ import annotations

import json
import re
import shutil
from pathlib import Path
from typing import Any

import yaml

class RuleAssemblyError(RuntimeError):
    """Raised when a Rules package cannot be assembled safely."""


class RuleAssembler:
    """Build an isolated runnable package from a node directory."""

    COPY_DIRS = (
        "rules",
        "agents",
        "adapters",
        "harness",
        "lifecycle_graphs",
        "assembly_workflows",
        "prompts",
        "contexts",
        "schemas",
    )

    def __init__(self):
        self.adapter_source_dir = Path(__file__).resolve().parent / "adapt_rules"

    def assemble(
        self,
        rules_dir: str | Path,
        output_dir: str | Path,
        lifecycle_file: str | Path | None = None,
        force: bool = False,
    ) -> Path:
        """Assemble Rules into output_dir and return the generated package path."""
        rules_path = Path(rules_dir).resolve()
        output_path = Path(output_dir).resolve()
        self._validate_rules_dir(rules_path)

        lifecycle_path = self._select_lifecycle_file(
            rules_path,
            lifecycle_file,
        )
        lifecycle = self._load_yaml(lifecycle_path)
        self._validate_lifecycle(lifecycle)

        package_name = self._safe_name(lifecycle["name"])
        package_path = output_path / package_name

        if package_path.exists():
            if not force:
                raise RuleAssemblyError(
                    f"Output already exists: {package_path}. Use force=True to replace it."
                )
            shutil.rmtree(package_path)

        package_path.mkdir(parents=True, exist_ok=False)
        self._copy_rule_assets(rules_path, package_path)
        self._copy_adapters(package_path)
        (package_path / "lifecycle.yaml").write_text(
            yaml.safe_dump(lifecycle, allow_unicode=True, sort_keys=False),
            encoding="utf-8",
        )

        manifest = {
            "name": lifecycle["name"],
            "version": lifecycle.get("version", "0.0.0"),
            "source_rules": rules_path.name,
            "lifecycle": "lifecycle.yaml",
            "entrypoint": "run.py",
            "generated_by": "RuleAssembler",
            "adapter_mode": "manual",
        }
        (package_path / "assembly_manifest.json").write_text(
            json.dumps(manifest, ensure_ascii=False, indent=2),
            encoding="utf-8",
        )
        (package_path / "graph_runtime.py").write_text(
            self._graph_runtime_source(lifecycle),
            encoding="utf-8",
        )
        (package_path / "run.py").write_text(
            self._runner_source(),
            encoding="utf-8",
        )
        return package_path

    def _copy_adapters(self, package_path: Path) -> None:
        target = package_path / "adapt_rules"
        if self.adapter_source_dir.is_dir():
            shutil.copytree(
                self.adapter_source_dir,
                target,
                ignore=shutil.ignore_patterns("__pycache__", "*.pyc"),
            )

    def _validate_rules_dir(self, rules_path: Path) -> None:
        if not rules_path.is_dir():
            raise RuleAssemblyError(f"Rules directory does not exist: {rules_path}")
        lifecycle_dir = rules_path / "lifecycle_graphs"
        if not lifecycle_dir.is_dir():
            raise RuleAssemblyError(
                f"Missing lifecycle_graphs directory: {lifecycle_dir}"
            )

    def _select_lifecycle_file(
        self,
        rules_path: Path,
        lifecycle_file: str | Path | None,
    ) -> Path:
        lifecycle_dir = rules_path / "lifecycle_graphs"
        if lifecycle_file:
            candidate = Path(lifecycle_file)
            if not candidate.is_absolute():
                candidate = lifecycle_dir / candidate
            if not candidate.is_file():
                raise RuleAssemblyError(f"Lifecycle file does not exist: {candidate}")
            return candidate.resolve()

        files = sorted(lifecycle_dir.glob("*.yaml"))
        if len(files) != 1:
            raise RuleAssemblyError(
                "Specify lifecycle_file when lifecycle_graphs contains "
                f"{len(files)} YAML files."
            )
        return files[0].resolve()

    def _load_yaml(self, path: Path) -> dict[str, Any]:
        try:
            data = yaml.safe_load(path.read_text(encoding="utf-8"))
        except yaml.YAMLError as exc:
            raise RuleAssemblyError(f"Invalid YAML: {path}") from exc
        if not isinstance(data, dict):
            raise RuleAssemblyError(f"Lifecycle must be a YAML object: {path}")
        return data

    def _validate_lifecycle(self, lifecycle: dict[str, Any]) -> None:
        for field in ("name", "nodes", "edges"):
            if field not in lifecycle:
                raise RuleAssemblyError(f"Lifecycle is missing field: {field}")

        user_input_nodes = [
            node
            for node in lifecycle["nodes"]
            if isinstance(node, dict) and node.get("type") == "user_input"
        ]
        node_ids = {
            node.get("id")
            for node in lifecycle["nodes"]
            if isinstance(node, dict)
        }
        if None in node_ids:
            raise RuleAssemblyError("Every lifecycle node must have an id.")

        for node in lifecycle["nodes"]:
            if not isinstance(node, dict):
                raise RuleAssemblyError("Every lifecycle node must be an object.")
            if node.get("type") in {"agent", "rule_tool", "adapter", "harness"} and not node.get("handler"):
                raise RuleAssemblyError(
                    f"Node '{node['id']}' needs an explicit handler, for example "
                    "'module.ClassName'."
                )
            input_config = node.get("input")
            if input_config is not None:
                if not isinstance(input_config, dict):
                    raise RuleAssemblyError(
                        f"Node '{node['id']}' input must be an object."
                    )
                has_field = "field" in input_config
                has_fields = "fields" in input_config
                if has_field == has_fields:
                    raise RuleAssemblyError(
                        f"Node '{node['id']}' input must define exactly one of "
                        "'field' or 'fields'."
                    )
                if has_field and (
                    not isinstance(input_config["field"], str)
                    or not input_config["field"].strip()
                ):
                    raise RuleAssemblyError(
                        f"Node '{node['id']}' input.field must be a non-empty string."
                    )
                if has_fields:
                    fields_config = input_config["fields"]
                    if isinstance(fields_config, list):
                        if not fields_config or not all(
                            isinstance(field, str) and field.strip()
                            for field in fields_config
                        ):
                            raise RuleAssemblyError(
                                f"Node '{node['id']}' input.fields must be a non-empty "
                                "list of strings."
                            )
                    elif isinstance(fields_config, dict):
                        if not fields_config or not all(
                            isinstance(target, str)
                            and target.strip()
                            and isinstance(source, str)
                            and source.strip()
                            for target, source in fields_config.items()
                        ):
                            raise RuleAssemblyError(
                                f"Node '{node['id']}' input.fields must be a non-empty "
                                "mapping of payload keys to state keys."
                            )
                    else:
                        raise RuleAssemblyError(
                            f"Node '{node['id']}' input.fields must be a list or mapping."
                        )
            if node.get("type") in {"agent", "rule_tool", "adapter"}:
                output_config = node.get("output")
                if not isinstance(output_config, dict):
                    raise RuleAssemblyError(
                        f"Node '{node['id']}' needs an output configuration."
                    )
                has_field = "field" in output_config
                has_fields = "fields" in output_config
                if has_field == has_fields:
                    raise RuleAssemblyError(
                        f"Node '{node['id']}' output must define exactly one of "
                        "'field' or 'fields'."
                    )
                if has_field and (
                    not isinstance(output_config["field"], str)
                    or not output_config["field"].strip()
                ):
                    raise RuleAssemblyError(
                        f"Node '{node['id']}' output.field must be a non-empty string."
                    )
                if has_fields:
                    fields_config = output_config["fields"]
                    if isinstance(fields_config, list):
                        if not fields_config or not all(
                            isinstance(field, str) and field.strip()
                            for field in fields_config
                        ):
                            raise RuleAssemblyError(
                                f"Node '{node['id']}' output.fields must be a non-empty "
                                "list of strings."
                            )
                    elif isinstance(fields_config, dict):
                        if not fields_config or not all(
                            isinstance(target, str)
                            and target.strip()
                            and isinstance(source, str)
                            and source.strip()
                            for target, source in fields_config.items()
                        ):
                            raise RuleAssemblyError(
                                f"Node '{node['id']}' output.fields must be a non-empty "
                                "mapping of state keys to response keys."
                            )
                    else:
                        raise RuleAssemblyError(
                            f"Node '{node['id']}' output.fields must be a list or mapping."
                        )
            if node.get("type") == "harness":
                harness_config = node.get("harness")
                if not isinstance(harness_config, dict):
                    raise RuleAssemblyError(
                        f"Harness node '{node['id']}' needs a harness configuration."
                    )
                if harness_config.get("mode", "contains") not in {
                    "contains",
                    "before_after",
                }:
                    raise RuleAssemblyError(
                        f"Harness node '{node['id']}' has an unsupported mode."
                    )
                child = harness_config.get("child")
                if harness_config.get("attached", True) and not isinstance(child, dict):
                    raise RuleAssemblyError(
                        f"Harness node '{node['id']}' needs a child."
                    )

        entrypoint = lifecycle.get("entrypoint")
        exitpoint = lifecycle.get("exitpoint")
        if len(user_input_nodes) != 1:
            raise RuleAssemblyError(
                "Lifecycle must contain exactly one user_input node."
            )
        if entrypoint != user_input_nodes[0].get("id"):
            raise RuleAssemblyError(
                "Lifecycle entrypoint must be the user_input node."
            )
        if entrypoint and entrypoint not in node_ids:
            raise RuleAssemblyError(f"Unknown lifecycle entrypoint: {entrypoint}")
        if exitpoint and exitpoint not in node_ids:
            raise RuleAssemblyError(f"Unknown lifecycle exitpoint: {exitpoint}")

        for edge in lifecycle["edges"]:
            source = edge.get("from")
            target = edge.get("to")
            if source not in node_ids and source not in {"START", "END"}:
                raise RuleAssemblyError(f"Unknown edge source: {source}")
            if target not in node_ids and target not in {"START", "END"}:
                raise RuleAssemblyError(f"Unknown edge target: {target}")

    def _copy_rule_assets(self, rules_path: Path, package_path: Path) -> None:
        for directory in self.COPY_DIRS:
            source = rules_path / directory
            if source.is_dir():
                shutil.copytree(
                    source,
                    package_path / directory,
                    ignore=self._copy_ignore_for(directory),
                )

        # Shared runtime dependencies live beside node/, not inside it.
        for runtime_directory in ("run_context", "memory", "runtime", "tools"):
            source = rules_path.parent / runtime_directory
            if source.is_dir():
                shutil.copytree(
                    source,
                    package_path / runtime_directory,
                    ignore=shutil.ignore_patterns("__pycache__", "*.pyc"),
                )

    @staticmethod
    def _copy_ignore_for(directory: str):
        if directory in {"rules", "agents", "adapters", "harness"}:
            return shutil.ignore_patterns("__pycache__", "*.pyc", "protocols")
        return shutil.ignore_patterns("__pycache__", "*.pyc")

    @staticmethod
    def _safe_name(value: str) -> str:
        name = re.sub(r"[^a-zA-Z0-9_.-]+", "_", value).strip("._")
        if not name:
            raise RuleAssemblyError("Lifecycle name cannot be empty.")
        return name

    @staticmethod
    def _graph_runtime_source(lifecycle: dict[str, Any]) -> str:
        state_fields = lifecycle.get("state", {})
        state_lines = []
        for field_name, field_config in state_fields.items():
            python_type = str((field_config or {}).get("type", "Any"))
            python_type = {
                "str": "str",
                "list[str]": "list[str]",
                "int": "int",
                "float": "float",
                "bool": "bool",
            }.get(python_type, "Any")
            state_lines.append(f"    {field_name}: {python_type}")
        state_definition = "\n".join(state_lines) or "    _placeholder: Any"

        return f'''"""Generated LangGraph runtime for an assembled Rules package."""

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
{state_definition}


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
    input_config = node.get("input", {{}})
    output_config = node.get("output", {{}})

    def run(state: dict[str, Any]):
        payload = _build_payload(input_config, state)
        print(f"[生命周期] 开始节点: {{node['id']}}", flush=True)
        print(f"[生命周期] 输入: {{payload}}", flush=True)
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
        return {{}}
    if "field" in input_config:
        field = input_config["field"]
        return {{field: state.get(field)}}
    fields = input_config.get("fields", [])
    if isinstance(fields, dict):
        return {{
            output_name: state.get(source_name)
            for output_name, source_name in fields.items()
        }}
    return {{field: state.get(field) for field in fields}}


def _normalize_state_updates(
    output_config: dict[str, Any],
    result: ComponentResponse,
) -> dict[str, Any]:
    current_updates = dict(result.state_updates or {{}})
    if not output_config:
        return current_updates

    source = dict(result.data or {{}})
    source.update(current_updates)

    if "field" in output_config:
        target_field = output_config["field"]
        if target_field in current_updates:
            return current_updates
        return {{**current_updates, target_field: source.get(target_field)}}

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
            f"Component '{{request.component.name}}' must return ComponentResponse"
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
    node_by_id = {{node["id"]: node for node in definition["nodes"]}}
    runners: dict[str, Any] = {{}}

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
        raise ValueError(f"Unsupported harness child type: {{child_type}}")

    def apply_harness(runner, harness_config):
        configs = harness_config if isinstance(harness_config, list) else [harness_config]
        for config in reversed(configs):
            if not isinstance(config, dict) or not config.get("handler"):
                raise ValueError("Harness configuration needs a handler")
            runner = HarnessManager.compose(
                mode=config.get("mode", "contains"),
                harness_factory=_load_handler(config["handler"]),
                child=runner,
                config=config.get("config", {{}}),
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
            raise ValueError(f"Harness cycle detected: {{cycle}}")
        node = node_by_id.get(node_id)
        if not node:
            raise ValueError(f"Unknown harness child node: {{node_id}}")

        if node["type"] == "harness":
            harness_config = node.get("harness", {{}})
            child_spec = harness_config.get("child")
            if harness_config.get("attached", True) is False:
                runner = lambda state: state
                runners[node_id] = runner
                return runner
            if child_spec is None and harness_config.get("target"):
                child_spec = {{"type": "node", "ref": harness_config["target"]}}
            if not child_spec:
                raise ValueError(f"Harness node '{{node_id}}' needs a child")
            child_runner, child_target = resolve_child(
                child_spec,
                (*stack, node_id),
            )
            runner = HarnessManager.compose(
                mode=harness_config.get("mode", "contains"),
                harness_factory=_load_handler(node["handler"]),
                child=child_runner,
                child_target=child_target,
                config=harness_config.get("config", {{}}),
                tool_manager=tool_manager,
                caller_id=node_id,
                permissions=set(harness_config.get("tools", [])),
                runtime_services=runtime_services,
            )
        elif node["type"] in {{"agent", "rule_tool", "adapter"}}:
            runner = _make_node(node, runtime_services)
            if node.get("harness"):
                runner = apply_harness(runner, node["harness"])
        elif node["type"] == "user_input":
            runner = lambda state: state
        elif node["type"] == "builtin":
            runner = lambda state: state
        else:
            raise ValueError(f"Unsupported node type: {{node['type']}}")

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
'''

    @staticmethod
    def _runner_source() -> str:
        return '''"""Run the assembled Agent."""

import contextlib
import json
from os import environ
from pathlib import Path
import sys
from uuid import uuid4

from graph_runtime import build_graph


def _sanitize_text(value: str) -> str:
    """Replace invalid UTF-16 surrogate code points before network/file I/O."""
    return "".join(
        character if not 0xD800 <= ord(character) <= 0xDFFF else "\\ufffd"
        for character in str(value)
    )


def _load_project_env() -> None:
    env_path = Path(__file__).resolve().parents[2] / ".env"
    if not env_path.is_file():
        return
    for raw_line in env_path.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        key = key.strip()
        value = value.strip().strip('"').strip("'")
        if key:
            environ.setdefault(key, value)


def _run_once(graph, user_input: str):
    return graph._runtime_manager.invoke(
        graph,
        {"input_text": user_input},
    )


def _worker() -> None:
    """Keep one compiled graph alive and serve newline-delimited JSON requests."""
    _load_project_env()
    lifecycle_path = Path(__file__).parent / "lifecycle.yaml"
    graph = None
    graph_signature = None

    stdin = getattr(sys.stdin, "buffer", sys.stdin)
    for raw_line in stdin:
        if isinstance(raw_line, bytes):
            line = raw_line.decode("utf-8", errors="replace").strip()
        else:
            line = raw_line.strip()
        if not line:
            continue

        try:
            request = json.loads(line)
            request_id = request.get("id")
            user_input = _sanitize_text(request.get("input") or "").strip()
            if not user_input:
                raise ValueError("请输入要发送的内容。")

            current_signature = lifecycle_path.stat().st_mtime_ns
            if graph is None or graph_signature != current_signature:
                print("[生命周期] 初始化 LangGraph", file=sys.stderr, flush=True)
                with contextlib.redirect_stdout(sys.stderr):
                    graph = build_graph(lifecycle_path)
                graph_signature = current_signature

            with contextlib.redirect_stdout(sys.stderr):
                result = _run_once(graph, user_input)

            print(
                json.dumps(
                    {
                        "id": request_id,
                        "ok": True,
                        "answer": result.get("final_answer", result),
                    },
                    # Escape non-ASCII characters so unpaired surrogates cannot
                    # break UTF-8 encoding on the worker protocol stream.
                    ensure_ascii=True,
                ),
                flush=True,
            )
        except Exception as error:
            print(
                json.dumps(
                    {
                        "id": request.get("id") if "request" in locals() else None,
                        "ok": False,
                        "error": _sanitize_text(error),
                    },
                    ensure_ascii=True,
                ),
                flush=True,
            )


def main() -> None:
    _load_project_env()
    if "--worker" in sys.argv:
        _worker()
        return

    user_input = " ".join(sys.argv[1:]).strip()
    if not user_input:
        user_input = input("请输入问题：").strip()

    print("[生命周期] 开始", flush=True)
    graph = build_graph(Path(__file__).parent / "lifecycle.yaml")
    result = _run_once(graph, user_input)
    print("[生命周期] 结束", flush=True)
    print(result.get("final_answer", result))


if __name__ == "__main__":
    main()
'''


if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser(description="Assemble a Rules package.")
    parser.add_argument("rules_dir")
    parser.add_argument("output_dir")
    parser.add_argument("--lifecycle-file")
    parser.add_argument("--force", action="store_true")
    args = parser.parse_args()

    result = RuleAssembler().assemble(
        rules_dir=args.rules_dir,
        output_dir=args.output_dir,
        lifecycle_file=args.lifecycle_file,
        force=args.force,
    )
    print(result)
