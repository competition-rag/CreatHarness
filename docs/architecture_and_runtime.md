# CreatHarness Architecture and Runtime

This document explains how CreatHarness is organized, how source definitions are assembled into a runnable package, and how the UI invokes the Python runtime.

## 1. Overall Architecture

```mermaid
flowchart TB
    UI["Next.js Studio<br/>ui/"]
    WorkspaceAPI["Workspace API<br/>/api/workspace"]
    RulesAPI["Rules API<br/>/api/rules"]
    RunAPI["Run API<br/>/api/run"]
    Assembler["RuleAssembler<br/>assembly_runtime/"]
    Source["Source Components<br/>node/"]
    Package["Assembled Package<br/>assembled/hotpot_agent_lifecycle"]
    Worker["Python Worker<br/>run.py --worker"]
    Graph["Generated Graph Runtime<br/>graph_runtime.py"]
    Runtime["RuntimeManager<br/>runtime/"]
    Context["RunContext / ToolContext<br/>run_context/"]
    Tools["ToolManager / ToolRegistry<br/>tools/"]
    Memory["MemoryManager<br/>memory/"]

    UI --> WorkspaceAPI
    UI --> RulesAPI
    UI --> RunAPI
    WorkspaceAPI --> Source
    RulesAPI --> Source
    RunAPI --> Assembler
    Assembler --> Package
    RunAPI --> Worker
    Worker --> Graph
    Graph --> Runtime
    Runtime --> Context
    Runtime --> Tools
    Runtime --> Memory
    Source --> Assembler
```

## 2. Directory Responsibilities

| Directory | Responsibility |
|---|---|
| `ui/` | Visual studio for rule management, lifecycle editing, and workflow execution. |
| `node/` | Source of truth for lifecycle YAML, agent implementations, rule tools, adapters, and harnesses. |
| `assembly_runtime/` | Builds an isolated runnable package from `node/` and shared runtime modules. |
| `assembled/` | Generated packages with `run.py`, `graph_runtime.py`, copied components, and manifest files. |
| `runtime/` | Coordinates graph execution, node execution, lifecycle events, and shared services. |
| `run_context/` | Defines component requests/responses, run metadata, event models, and tool-call records. |
| `tools/` | Provides tool registration, tool authorization, and built-in business tools. |
| `memory/` | Provides short-term and long-term memory stores. |
| `data/` | Stores demo runtime data such as order JSON records. |

## 3. Source-to-Package Assembly

```mermaid
flowchart LR
    Lifecycle["node/lifecycle_graphs/*.yaml"]
    Agents["node/agents"]
    Rules["node/rules"]
    Harnesses["node/harness"]
    Adapters["node/adapters"]
    Shared["runtime + run_context + memory + tools"]
    Assembler["assembly_runtime/rule_assembler.py"]
    Output["assembled/<lifecycle_name>/"]

    Lifecycle --> Assembler
    Agents --> Assembler
    Rules --> Assembler
    Harnesses --> Assembler
    Adapters --> Assembler
    Shared --> Assembler
    Assembler --> Output
```

The assembler validates the lifecycle YAML, copies component files, copies shared runtime modules, writes `lifecycle.yaml`, creates `assembly_manifest.json`, and generates `graph_runtime.py` plus `run.py`.

Recommended assembly command:

```powershell
python assembly_runtime/rule_assembler.py node assembled --lifecycle-file hotpot_agent_lifecycle.yaml --force
```

## 4. Current Lifecycle

The current source lifecycle is `node/lifecycle_graphs/hotpot_agent_lifecycle.yaml`.

```mermaid
flowchart LR
    UserInput["user_input<br/>用户输入"]
    Router["order_router<br/>点餐路由 Agent"]
    Create["create_order<br/>创建订单 Rule Tool"]
    Query["query_order<br/>查询订单 Rule Tool"]
    Response["order_response<br/>结果汇总 Agent"]

    UserInput --> Router
    Router --> Create
    Router --> Query
    Create --> Response
    Query --> Response
```

The state fields include user text, detected intent, order items, query order id, create/query results, created/queried order records, and the final answer.

## 5. Runtime Request Flow

```mermaid
sequenceDiagram
    participant User as User
    participant UI as Next.js UI
    participant API as /api/run
    participant Worker as Python Worker
    participant Graph as LangGraph
    participant Runtime as RuntimeManager
    participant Tool as ToolManager
    participant File as Order JSON Files

    User->>UI: Enter a message
    UI->>API: POST /api/run
    API->>API: Validate lifecycle
    API->>Worker: Start or reuse run.py --worker
    Worker->>Graph: Build graph if lifecycle changed
    Graph->>Runtime: Execute user_input
    Graph->>Runtime: Execute order_router
    alt Create order
        Graph->>Runtime: Execute create_order
        Runtime->>Tool: create_order_record
        Tool->>File: Write order JSON
    else Query order
        Graph->>Runtime: Execute query_order
        Runtime->>Tool: query_order_record
        Tool->>File: Read order JSON
    end
    Graph->>Runtime: Execute order_response
    Runtime-->>Worker: final_answer
    Worker-->>API: JSON response
    API-->>UI: Display answer
```

## 6. Tool Permission Chain

```mermaid
flowchart LR
    Node["Lifecycle Node"] --> Allowed["Node-level tools whitelist"]
    Allowed --> Manager["ToolManager.call"]
    Manager --> Registry["ToolRegistry"]
    Registry --> Caller["Caller type check"]
    Caller --> Tool["Decorated @tool function"]
    Tool --> Record["Tool call record + runtime event"]
```

Tool calls pass two checks before execution:

- The lifecycle node must list the tool name in its `tools` field.
- The tool decorator must allow the normalized caller type, such as `agent`, `rule`, or `harness`.

## 7. UI and Worker Relationship

```mermaid
flowchart TB
    Browser["Browser"] --> Next["Next.js Dev Server"]
    Next --> Workspace["Read/write lifecycle YAML"]
    Next --> Rules["Read/write protocol and Python tool files"]
    Next --> Run["Run API"]
    Run --> Env["Load local .env"]
    Run --> Python["Long-lived Python worker"]
    Python --> Cached["Cached compiled graph"]
    Cached --> Reload["Reload when lifecycle.yaml changes"]
```

The worker mode keeps a compiled graph alive and accepts newline-delimited JSON requests. This avoids rebuilding the graph for every UI request while still allowing reloads when the lifecycle file changes.

## 8. Safe Publishing Checklist

- Keep `.env` private and publish only `.env.example`.
- Exclude `node_modules/`, `.next/`, `__pycache__/`, `.pyc`, sqlite databases, and logs.
- Review generated data under `data/` before publishing.
- Decide whether `assembled/` should be committed as a ready-to-run example or regenerated by users.
- Add a `LICENSE` file if the repository will be public.
