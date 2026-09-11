"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import ReactFlow, {
  Background,
  Controls,
  Handle,
  MiniMap,
  Position,
  addEdge,
  applyEdgeChanges,
  applyNodeChanges,
} from "reactflow";
import "reactflow/dist/style.css";
import { validateLifecycle } from "../lib/lifecycle-validation";
import RulesPanel from "./components/RulesPanel";
import RunDrawer from "./components/RunDrawer";
import InspectorDrawer from "./components/InspectorDrawer";

const emptyNodeForm = {
  id: "",
  name: "",
  type: "agent",
  handler: "",
  description: "",
  inputRows: [{ key: "input_text", source: "input_text" }],
  inputType: "str",
  outputRows: [{ key: "result", source: "result" }],
  outputType: "str",
  harnessMode: "contains",
  harnessChildId: "",
  harnessTimeout: "30",
};

const SYSTEM_USER_INPUT_ID = "user_input";

const typeLabelMap = {
  rule: "Rule",
  rule_tool: "Rule",
  agent: "Agent",
  adapter: "Adapter",
  harness: "Harness",
  user_input: "用户输入",
};

const ruleCategoryOrder = ["rule", "agent", "adapter", "harness"];

const ruleCategoryTitleMap = {
  rule: "Rules",
  agent: "Agents",
  adapter: "Adapters",
  harness: "Harnesses",
};

function parseFieldList(value) {
  return String(value || "")
    .split(/[\n,，]+/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function parseIOConfig(fieldText, typeText) {
  const entries = parseFieldList(fieldText);
  const normalizedType = String(typeText || "").trim() || "str";

  if (entries.length <= 1 && !entries[0]?.includes(":")) {
    return {
      field: entries[0] || "result",
      type: normalizedType,
    };
  }

  const mapping = {};
  for (const entry of entries) {
    const [target, source] = entry.split(":").map((item) => item.trim());
    if (!target) continue;
    mapping[target] = source || target;
  }

  return {
    fields: mapping,
    type: normalizedType,
  };
}

function normalizeIORows(rows, fallbackKey = "result") {
  const normalized = Array.isArray(rows)
    ? rows
        .map((row) => ({
          key: String(row?.key || "").trim(),
          source: String(row?.source || "").trim(),
        }))
        .filter((row) => row.key)
    : [];
  return normalized.length ? normalized : [{ key: fallbackKey, source: fallbackKey }];
}

function parseIOConfigFromRows(rows, typeText, fallbackKey = "result") {
  const entries = normalizeIORows(rows, fallbackKey);
  const normalizedType = String(typeText || "").trim() || "str";
  if (entries.length === 1 && entries[0].key === entries[0].source) {
    return {
      field: entries[0].key || fallbackKey,
      type: normalizedType,
    };
  }
  const mapping = {};
  for (const entry of entries) {
    mapping[entry.key] = entry.source || entry.key;
  }
  return {
    fields: mapping,
    type: normalizedType,
  };
}

function ioConfigToRows(config, fallbackKey = "result") {
  if (!config || typeof config !== "object") {
    return [{ key: fallbackKey, source: fallbackKey }];
  }
  if (config.field) {
    return [{ key: String(config.field), source: String(config.field) }];
  }
  if (config.fields && typeof config.fields === "object") {
    const rows = Object.entries(config.fields).map(([key, source]) => ({
      key: String(key),
      source: String(source),
    }));
    return rows.length ? rows : [{ key: fallbackKey, source: fallbackKey }];
  }
  return [{ key: fallbackKey, source: fallbackKey }];
}

function describeIOConfig(config, fallbackField = "") {
  if (!config || typeof config !== "object") return fallbackField || "";
  if (config.field) return String(config.field);
  if (Array.isArray(config.fields)) return config.fields.join(", ");
  if (config.fields && typeof config.fields === "object") {
    return Object.entries(config.fields)
      .map(([target, source]) => (target === source ? target : `${target}:${source}`))
      .join(", ");
  }
  return fallbackField || "";
}

function describeIOType(config) {
  return config?.type || "?";
}

function derivePathPreview(lifecycle) {
  if (!lifecycle?.entrypoint || !Array.isArray(lifecycle?.nodes)) return [];
  const nodeMap = new Map((lifecycle.nodes || []).map((node) => [node.id, node]));
  const outgoing = new Map((lifecycle.nodes || []).map((node) => [node.id, []]));
  for (const edge of lifecycle.edges || []) {
    if (outgoing.has(edge.from) && nodeMap.has(edge.to)) {
      outgoing.get(edge.from).push(edge.to);
    }
  }

  const preview = [];
  const visited = new Set();
  let current = lifecycle.entrypoint;

  while (current && !visited.has(current) && preview.length < 12) {
    visited.add(current);
    const node = nodeMap.get(current);
    if (node) {
      preview.push(node.name || node.id);
    }
    const nextNodes = outgoing.get(current) || [];
    current = nextNodes[0] || "";
  }

  return preview;
}

function buildRunSummary(lifecycle) {
  if (!lifecycle || typeof lifecycle !== "object") return null;
  const nodes = Array.isArray(lifecycle.nodes) ? lifecycle.nodes : [];
  const edges = Array.isArray(lifecycle.edges) ? lifecycle.edges : [];
  const nodeMap = new Map(nodes.map((node) => [node.id, node]));
  return {
    entrypoint: lifecycle.entrypoint || "",
    exitpoint: lifecycle.exitpoint || "",
    entryName: nodeMap.get(lifecycle.entrypoint)?.name || lifecycle.entrypoint || "",
    exitName: nodeMap.get(lifecycle.exitpoint)?.name || lifecycle.exitpoint || "",
    nodeCount: nodes.length,
    edgeCount: edges.length,
    pathPreview: derivePathPreview(lifecycle),
  };
}

function buildValidationState(lifecycle) {
  const errors = validateLifecycle(lifecycle);
  const nodeErrors = {};
  const invalidEdgeKeys = new Set();
  const nodes = Array.isArray(lifecycle?.nodes) ? lifecycle.nodes : [];
  const edges = Array.isArray(lifecycle?.edges) ? lifecycle.edges : [];
  const nodeMap = new Map(nodes.map((node) => [node.id, node]));
  const outgoing = new Map(nodes.map((node) => [node.id, new Set()]));
  const incoming = new Map(nodes.map((node) => [node.id, new Set()]));

  for (const edge of edges) {
    if (nodeMap.has(edge?.from) && nodeMap.has(edge?.to)) {
      outgoing.get(edge.from).add(edge.to);
      incoming.get(edge.to).add(edge.from);
    } else {
      invalidEdgeKeys.add(`${edge?.from || ""}->${edge?.to || ""}`);
    }
  }

  for (const error of errors) {
    for (const node of nodes) {
      const nodeName = node?.name || "";
      const nodeId = node?.id || "";
      if (!nodeId) continue;
      if (
        error.includes(`「${nodeName}」`) ||
        error.includes(`「${nodeId}」`) ||
        error.includes(` ${nodeId} `) ||
        error.endsWith(nodeId)
      ) {
        if (!nodeErrors[nodeId]) nodeErrors[nodeId] = [];
        nodeErrors[nodeId].push(error);
      }
    }
  }

  const entrypoint = lifecycle?.entrypoint;
  const exitpoint = lifecycle?.exitpoint;
  if (entrypoint && exitpoint && nodeMap.has(entrypoint) && nodeMap.has(exitpoint)) {
    const reachableFromEntry = traverse(entrypoint, outgoing);
    const canReachExit = traverse(exitpoint, incoming);
    for (const edge of edges) {
      if (!nodeMap.has(edge?.from) || !nodeMap.has(edge?.to)) continue;
      if (
        !reachableFromEntry.has(edge.from) ||
        !reachableFromEntry.has(edge.to) ||
        !canReachExit.has(edge.from) ||
        !canReachExit.has(edge.to)
      ) {
        invalidEdgeKeys.add(`${edge.from}->${edge.to}`);
      }
    }
  }

  return {
    errors,
    nodeErrors,
    invalidNodeIds: Object.keys(nodeErrors),
    invalidEdgeKeys: [...invalidEdgeKeys],
  };
}

function buildConnectionMetrics(lifecycle) {
  const nodes = Array.isArray(lifecycle?.nodes) ? lifecycle.nodes : [];
  const edges = Array.isArray(lifecycle?.edges) ? lifecycle.edges : [];
  const metrics = {};
  for (const node of nodes) {
    metrics[node.id] = { incoming: 0, outgoing: 0 };
  }
  for (const edge of edges) {
    if (metrics[edge.from]) metrics[edge.from].outgoing += 1;
    if (metrics[edge.to]) metrics[edge.to].incoming += 1;
  }
  return metrics;
}

function traverse(start, graph) {
  const visited = new Set();
  const queue = [start];
  while (queue.length) {
    const current = queue.shift();
    if (visited.has(current)) continue;
    visited.add(current);
    for (const next of graph.get(current) || []) {
      if (!visited.has(next)) queue.push(next);
    }
  }
  return visited;
}

function toPascalCase(value) {
  return String(value || "")
    .split(/[^a-zA-Z0-9]+/)
    .filter(Boolean)
    .map((part) => part[0].toUpperCase() + part.slice(1))
    .join("");
}

function FlowNode({ data }) {
  return (
    <div className={`flow-node ${data.type || "agent"}`}>
      <Handle type="target" position={Position.Left} />
      <div className={`flow-node-badge ${data.type || "agent"}`}>
        {data.type === "user_input" ? "INPUT" : data.badge || data.type || "NODE"}
      </div>
      <div className="flow-node-title">{data.label}</div>
      <div className="flow-node-meta">{data.subtitle}</div>
      <div className="flow-node-ports">
        <span>IN {data.incomingCount || 0}</span>
        <span>OUT {data.outgoingCount || 0}</span>
      </div>
      <Handle type="source" position={Position.Right} />
    </div>
  );
}

function HarnessNode({ data }) {
  const child = data.harnessChild;
  const isContains = data.harnessMode === "contains";
  const isAttached = data.harnessAttached !== false && child;
  return (
    <div className="harness-node">
      <Handle type="target" position={Position.Left} />
      <div className="harness-node-label">HARNESS</div>
      <div className="harness-node-title">{data.label}</div>
      <div className="harness-node-mode">{data.harnessMode || "contains"}</div>
      {isContains ? (
        <div className="harness-node-slot">
          <div className="harness-slot-label">包含对象 · 可拖入 Agent</div>
          {isAttached ? (
            <div
              className={`harness-slot-child ${child.type || "subgraph"}`}
              draggable
              title="拖动拆出 Agent"
              onDragStart={(event) => {
                event.stopPropagation();
                event.dataTransfer.effectAllowed = "move";
                event.dataTransfer.setData("text/plain", child.id);
                data.onDetachChild?.(data.nodeId);
              }}
            >
              <div className="harness-slot-title">{child.label}</div>
              <div className="harness-slot-meta">{child.subtitle || child.type || "subgraph"}</div>
              <button
                type="button"
                className="slot-action"
                onClick={(event) => {
                  event.stopPropagation();
                  data.onDetachChild?.(data.nodeId);
                }}
              >
                拆出
              </button>
            </div>
          ) : (
            <div className="harness-slot-empty">
              <span>把画布中的 Agent 拖到这里</span>
            </div>
          )}
        </div>
      ) : (
        <div className="harness-before-after">
          <span className="harness-before-after-mark">↕</span>
          <span>前后置策略，不包含节点</span>
        </div>
      )}
      <Handle type="source" position={Position.Right} />
    </div>
  );
}

const nodeTypes = { flowNode: FlowNode, harnessNode: HarnessNode };

function getInitialNodePositions(nodes, edges) {
  const nodeIds = new Set(nodes.map((node) => node.id));
  const indexById = new Map(nodes.map((node, index) => [node.id, index]));
  const outgoing = new Map(nodes.map((node) => [node.id, []]));
  const indegree = new Map(nodes.map((node) => [node.id, 0]));
  const rank = new Map(nodes.map((node) => [node.id, 0]));

  for (const edge of edges || []) {
    if (!nodeIds.has(edge.from) || !nodeIds.has(edge.to)) continue;
    outgoing.get(edge.from).push(edge.to);
    indegree.set(edge.to, indegree.get(edge.to) + 1);
  }

  const queue = (edges || [])
    .filter((edge) => edge.from === "START" && nodeIds.has(edge.to))
    .map((edge) => edge.to);
  const visited = new Set(queue);

  while (queue.length) {
    const current = queue.shift();
    for (const next of outgoing.get(current) || []) {
      rank.set(next, Math.max(rank.get(next) || 0, (rank.get(current) || 0) + 1));
      if (!visited.has(next)) {
        visited.add(next);
        queue.push(next);
      }
    }
  }

  const ready = nodes
    .filter((node) => indegree.get(node.id) === 0)
    .sort((a, b) => (rank.get(a.id) - rank.get(b.id)) || (indexById.get(a.id) - indexById.get(b.id)));
  const ordered = [];

  while (ready.length) {
    const current = ready.shift();
    ordered.push(current);
    for (const next of outgoing.get(current.id) || []) {
      indegree.set(next, indegree.get(next) - 1);
      if (indegree.get(next) === 0) {
        ready.push(nodes.find((node) => node.id === next));
        ready.sort((a, b) => (rank.get(a.id) - rank.get(b.id)) || (indexById.get(a.id) - indexById.get(b.id)));
      }
    }
  }

  for (const node of nodes) {
    if (!ordered.some((item) => item.id === node.id)) ordered.push(node);
  }

  const positions = new Map();
  const rowsByRank = new Map();
  for (const node of ordered) {
    const nodeRank = rank.get(node.id) || 0;
    const row = rowsByRank.get(nodeRank) || 0;
    rowsByRank.set(nodeRank, row + 1);
    positions.set(node.id, {
      x: 80 + nodeRank * 250,
      y: 160 + row * 135,
    });
  }

  return positions;
}

export default function Home() {
  const [workspace, setWorkspace] = useState(null);
  const [rulesData, setRulesData] = useState(null);
  const [rfNodes, setRfNodes] = useState([]);
  const [rfEdges, setRfEdges] = useState([]);
  const [loading, setLoading] = useState(true);
  const [rulesLoading, setRulesLoading] = useState(true);
  const [error, setError] = useState("");
  const [rulesError, setRulesError] = useState("");
  const [activePage, setActivePage] = useState("rules");
  const [selectedId, setSelectedId] = useState("");
  const [selectedEdgeId, setSelectedEdgeId] = useState("");
  const [inspectorOpen, setInspectorOpen] = useState(false);
  const [inspectorWidth, setInspectorWidth] = useState(420);
  const [inspectorResizing, setInspectorResizing] = useState(false);
  const [selectedRuleId, setSelectedRuleId] = useState("");
  const [ruleModalOpen, setRuleModalOpen] = useState(false);
  const [ruleForm, setRuleForm] = useState({
    name: "",
    functionDescription: "",
    inputType: "str",
    inputDescription: "",
    outputType: "str",
    outputDescription: "",
    functionSource: "",
  });
  const [menu, setMenu] = useState(null);
  const [codeDraft, setCodeDraft] = useState("");
  const [codeSaving, setCodeSaving] = useState(false);
  const [runOpen, setRunOpen] = useState(false);
  const [runInput, setRunInput] = useState("");
  const [runMessages, setRunMessages] = useState([]);
  const [runLoading, setRunLoading] = useState(false);
  const [runPreparing, setRunPreparing] = useState(false);
  const [runReady, setRunReady] = useState(false);
  const [runError, setRunError] = useState("");
  const [ruleSearch, setRuleSearch] = useState("");
  const [createModal, setCreateModal] = useState(null);
  const [nodeForm, setNodeForm] = useState(emptyNodeForm);
  const [linkSourceId, setLinkSourceId] = useState("");
  const flowRef = useRef(null);
  const rfNodesRef = useRef([]);
  const inspectorResizeRef = useRef(null);
  const harnessActionsRef = useRef({});

  const lifecycle = workspace?.lifecycle || { name: "Workspace", nodes: [], edges: [] };
  const metrics = workspace?.metrics || {
    nodeCount: 0,
    edgeCount: 0,
    agentCount: 0,
    ruleCount: 0,
  };
  const validationState = useMemo(() => buildValidationState(lifecycle), [lifecycle]);
  const validationErrors = validationState.errors;
  const connectionMetrics = useMemo(() => buildConnectionMetrics(lifecycle), [lifecycle]);
  const lastRunSummary = useMemo(() => buildRunSummary(lifecycle), [lifecycle]);

  const selectedNode = useMemo(
    () => workspace?.nodes?.find((node) => node.id === selectedId) || null,
    [workspace, selectedId]
  );

  const selectedRule = useMemo(
    () => rulesData?.rules?.find((rule) => rule.id === selectedRuleId) || null,
    [rulesData, selectedRuleId]
  );

  const selectedNodeRule = useMemo(() => {
    if (!selectedNode || !rulesData?.rules) return null;
    const moduleName = (selectedNode.handler || "").split(".")[0];
    return rulesData.rules.find(
      (rule) =>
        rule.id === moduleName ||
        rule.id === selectedNode.id ||
        rule.name === moduleName
    ) || null;
  }, [selectedNode, rulesData]);

  const selectedNodeErrors = useMemo(
    () => (selectedNode ? validationState.nodeErrors[selectedNode.id] || [] : []),
    [selectedNode, validationState.nodeErrors]
  );

  const selectedNodeConnections = useMemo(
    () => (selectedNode ? connectionMetrics[selectedNode.id] || { incoming: 0, outgoing: 0 } : { incoming: 0, outgoing: 0 }),
    [connectionMetrics, selectedNode]
  );

  const updateNodeFormRows = useCallback((group, index, patch) => {
    setNodeForm((current) => {
      const key = group === "input" ? "inputRows" : "outputRows";
      const rows = [...(current[key] || [])];
      rows[index] = { ...rows[index], ...patch };
      return { ...current, [key]: rows };
    });
  }, []);

  const addNodeFormRow = useCallback((group) => {
    setNodeForm((current) => {
      const key = group === "input" ? "inputRows" : "outputRows";
      const rows = [...(current[key] || []), { key: "", source: "" }];
      return { ...current, [key]: rows };
    });
  }, []);

  const removeNodeFormRow = useCallback((group, index) => {
    setNodeForm((current) => {
      const key = group === "input" ? "inputRows" : "outputRows";
      const fallbackKey = group === "input" ? "input_text" : "result";
      const rows = (current[key] || []).filter((_, rowIndex) => rowIndex !== index);
      return {
        ...current,
        [key]: rows.length ? rows : [{ key: fallbackKey, source: fallbackKey }],
      };
    });
  }, []);

  const reusableRules = useMemo(
    () => (rulesData?.rules || []).filter((rule) => rule.category === "rule"),
    [rulesData]
  );

  const reusableAdapters = useMemo(
    () => (rulesData?.rules || []).filter((rule) => rule.category === "adapter"),
    [rulesData]
  );

  const reusableHarnesses = useMemo(
    () => (rulesData?.rules || []).filter((rule) => rule.category === "harness"),
    [rulesData]
  );

  const ruleGroups = useMemo(
    () =>
      ruleCategoryOrder.map((category) => ({
        category,
        title: ruleCategoryTitleMap[category] || category,
        items: (rulesData?.rules || []).filter((rule) => {
          if (rule.category !== category) return false;
          const query = ruleSearch.trim().toLowerCase();
          if (!query) return true;
          const haystack = [
            rule.name,
            rule.category,
            rule.protocol?.descript,
            rule.protocol?.description,
            rule.protocol?.input?.type,
            rule.protocol?.output?.type,
          ]
            .filter(Boolean)
            .join(" ")
            .toLowerCase();
          return haystack.includes(query);
        }),
      })),
    [ruleSearch, rulesData]
  );

  useEffect(() => {
    if (activePage === "rules") {
      setCodeDraft(selectedRule?.functionSource || "");
      return;
    }
    setCodeDraft(selectedNodeRule?.functionSource || "");
  }, [activePage, selectedNodeRule, selectedRule]);

  useEffect(() => {
    if (!inspectorResizing) return undefined;

    const handlePointerMove = (event) => {
      const resizeState = inspectorResizeRef.current;
      if (!resizeState) return;
      const rightOffset = 18;
      const minWidth = 320;
      const maxWidth = Math.min(760, window.innerWidth - rightOffset * 2);
      const nextWidth = window.innerWidth - rightOffset - event.clientX;
      setInspectorWidth(Math.max(minWidth, Math.min(maxWidth, nextWidth)));
    };
    const stopResizing = () => {
      inspectorResizeRef.current = null;
      setInspectorResizing(false);
    };

    document.addEventListener("pointermove", handlePointerMove);
    document.addEventListener("pointerup", stopResizing);
    document.body.classList.add("is-resizing-inspector");

    return () => {
      document.removeEventListener("pointermove", handlePointerMove);
      document.removeEventListener("pointerup", stopResizing);
      document.body.classList.remove("is-resizing-inspector");
    };
  }, [inspectorResizing]);

  const startInspectorResize = useCallback((event) => {
    event.preventDefault();
    event.stopPropagation();
    inspectorResizeRef.current = { pointerId: event.pointerId };
    setInspectorResizing(true);
  }, []);

  const syncFromWorkspace = useCallback((data) => {
    const sourceNodes = data.nodes || [];
    const nodesById = new Map(sourceNodes.map((node) => [node.id, node]));
    const lifecycleSnapshot = data.lifecycle || { nodes: sourceNodes, edges: data.edges || [] };
    const snapshotValidation = buildValidationState(lifecycleSnapshot);
    const invalidNodeIds = new Set(snapshotValidation.invalidNodeIds);
    const invalidEdgeKeys = new Set(snapshotValidation.invalidEdgeKeys);
    const connectionSnapshot = buildConnectionMetrics(lifecycleSnapshot);
    const currentPositions = new Map(
      rfNodesRef.current.map((node) => [node.id, node.position])
    );
    const nodes = sourceNodes
      .filter((node) => node.visible !== false)
      .map((node, index) => ({
      id: node.id,
      type: node.type === "harness" ? "harnessNode" : "flowNode",
      className: invalidNodeIds.has(node.id) ? "flow-node-invalid" : "",
      position:
        node.position && (node.position.x !== 0 || node.position.y !== 0)
          ? node.position
          : currentPositions.get(node.id) || { x: 80 + index * 250, y: 160 },
      data: {
        label: node.name || node.id,
        subtitle:
          node.type === "rule_tool"
            ? `${describeIOType(node.input)} → ${describeIOType(node.output)}`
            : node.type === "adapter"
              ? `适配 ${describeIOType(node.input)} → ${describeIOType(node.output)}`
              : node.type === "user_input"
                ? `输出 ${describeIOConfig(node.output, "input_text") || "input_text"}`
            : node.handler || node.description || "",
        type: node.type,
        badge: typeLabelMap[node.type] || node.type,
        incomingCount: connectionSnapshot[node.id]?.incoming || 0,
        outgoingCount: connectionSnapshot[node.id]?.outgoing || 0,
        nodeId: node.id,
        harnessMode: node.harness?.mode || "contains",
        harnessChild:
          node.type === "harness" &&
          node.harness?.attached !== false &&
          node.harness?.child?.type === "node"
            ? (() => {
                const child = nodesById.get(node.harness.child.ref);
                return child
                  ? {
                      id: child.id,
                      label: child.name || child.id,
                      subtitle: child.handler || child.description || child.type,
                      type: child.type,
                    }
                  : null;
              })()
            : null,
        harnessAttached: node.harness?.attached !== false,
        onDetachChild: () => harnessActionsRef.current.detach?.(node.id),
      },
    }));

    const edges = (data.edges || []).map((edge, index) => {
      const edgeId = edge.id || `e-${edge.from}-${edge.to}-${index}`;
      const invalid = invalidEdgeKeys.has(`${edge.from}->${edge.to}`);
      return {
        id: edgeId,
        source: edge.from,
        target: edge.to,
        type: "smoothstep",
        className: invalid ? "lifecycle-edge lifecycle-edge-invalid" : "lifecycle-edge",
        data: {
          invalid,
        },
      };
    });

    rfNodesRef.current = nodes;
    setRfNodes(nodes);
    setRfEdges(edges);
  }, []);

  const loadWorkspace = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/workspace", { cache: "no-store" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "读取失败");
      setWorkspace(data);
      setSelectedId(data.nodes?.[0]?.id || "");
      syncFromWorkspace(data);
      return data;
    } catch (err) {
      setError(err.message || "读取失败");
    } finally {
      setLoading(false);
    }
  }, [syncFromWorkspace]);

  const loadRules = useCallback(async () => {
    setRulesLoading(true);
    setRulesError("");
    try {
      const response = await fetch("/api/rules", { cache: "no-store" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "读取规则失败");
      setRulesData(data);
      setSelectedRuleId(data.rules?.[0]?.id || "");
    } catch (err) {
      setRulesError(err.message || "读取规则失败");
    } finally {
      setRulesLoading(false);
    }
  }, []);

  const createRule = useCallback(async () => {
    setRulesError("");
    try {
      const response = await fetch("/api/rules", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(ruleForm),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "创建规则失败");
      setRuleModalOpen(false);
      await loadRules();
      setSelectedRuleId(data.name);
    } catch (err) {
      setRulesError(err.message || "创建规则失败");
    }
  }, [ruleForm, loadRules]);

  const deleteRule = useCallback(async (name) => {
    if (!name) return;
    setRulesError("");
    try {
      const response = await fetch(`/api/rules?name=${encodeURIComponent(name)}`, {
        method: "DELETE",
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "删除规则失败");
      await loadRules();
    } catch (err) {
      setRulesError(err.message || "删除规则失败");
    }
  }, [loadRules]);

  useEffect(() => {
    loadWorkspace();
  }, [loadWorkspace]);

  useEffect(() => {
    loadRules();
  }, [loadRules]);

  const onNodesChange = useCallback((changes) => {
    setRfNodes((current) => {
      const next = applyNodeChanges(changes, current);
      rfNodesRef.current = next;
      return next;
    });
  }, []);

  const onEdgesChange = useCallback((changes) => {
    setRfEdges((current) => applyEdgeChanges(changes, current));
  }, []);

  const persistLifecycle = useCallback(async (nextLifecycle) => {
    setRunReady(false);
    const response = await fetch("/api/workspace", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ lifecycle: nextLifecycle }),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "保存编排失败");
  }, []);

  const commitLifecycle = useCallback(
    (mutate) => {
      if (!workspace) return;
      const next = structuredClone(workspace);
      mutate(next.lifecycle);
      next.nodes = next.lifecycle.nodes || [];
      next.edges = next.lifecycle.edges || [];
      next.metrics = {
        ...next.metrics,
        nodeCount: next.nodes.length,
        edgeCount: next.edges.length,
        agentCount: next.nodes.filter((item) => item.type === "agent").length,
        ruleCount: next.nodes.filter((item) => item.type === "rule_tool").length,
      };
      setWorkspace(next);
      syncFromWorkspace(next);
      persistLifecycle(next.lifecycle).catch((saveError) => setError(saveError.message));
    },
    [persistLifecycle, syncFromWorkspace, workspace]
  );

  const detachHarnessChild = useCallback(
    (harnessId) => {
      commitLifecycle((nextLifecycle) => {
        const harness = (nextLifecycle.nodes || []).find((node) => node.id === harnessId);
        const childId = harness?.harness?.child?.ref;
        if (!harness || harness.type !== "harness" || !childId) return;
        harness.harness.attached = false;
        const child = (nextLifecycle.nodes || []).find((node) => node.id === childId);
        if (child) {
          const canvasHarness = rfNodes.find((node) => node.id === harnessId);
          const harnessPosition = canvasHarness?.position || harness.position || { x: 120, y: 120 };
          const harnessWidth =
            canvasHarness?.measured?.width ||
            canvasHarness?.width ||
            260;
          child.visible = true;
          child.position = {
            x: harnessPosition.x + harnessWidth + 48,
            y: harnessPosition.y,
          };
        }
      });
      setSelectedId("");
    },
    [commitLifecycle, rfNodes]
  );

  const insertAgentIntoHarness = useCallback(
    (harnessId, agentId) => {
      commitLifecycle((nextLifecycle) => {
        const harness = (nextLifecycle.nodes || []).find((node) => node.id === harnessId);
        const agent = (nextLifecycle.nodes || []).find((node) => node.id === agentId);
        if (!harness || harness.type !== "harness" || harness.harness?.mode !== "contains") return;
        if (!agent || agent.type !== "agent" || harness.harness.attached !== false) return;

        const oldHarness = (nextLifecycle.nodes || []).find(
          (node) =>
            node.type === "harness" &&
            node.harness?.mode === "contains" &&
            node.harness?.attached !== false &&
            node.harness?.child?.ref === agentId
        );
        if (oldHarness) oldHarness.harness.attached = false;

        harness.harness = {
          ...(harness.harness || {}),
          mode: "contains",
          attached: true,
          child: { type: "node", ref: agentId },
        };
        agent.visible = false;
      });
      setSelectedId(harnessId);
      setInspectorOpen(true);
    },
    [commitLifecycle]
  );

  useEffect(() => {
    harnessActionsRef.current = {
      detach: detachHarnessChild,
      insert: insertAgentIntoHarness,
    };
  }, [detachHarnessChild, insertAgentIntoHarness]);

  const onConnect = useCallback((connection) => {
    const edge = {
      ...connection,
      id: `e-${connection.source}-${connection.target}-${Date.now()}`,
      type: "smoothstep",
      className: "lifecycle-edge",
    };
    setRfEdges((current) => addEdge(edge, current));
    setWorkspace((current) => {
      if (!current) return current;
      const next = structuredClone(current);
      next.lifecycle.edges = [
        ...(next.lifecycle.edges || []),
        { id: edge.id, from: edge.source, to: edge.target },
      ];
      next.edges = next.lifecycle.edges.map((item) => ({ ...item }));
      next.metrics = { ...next.metrics, edgeCount: next.edges.length };
      persistLifecycle(next.lifecycle).catch((error) => setError(error.message));
      return next;
    });
  }, [persistLifecycle]);

  const deleteEdge = useCallback((edgeId) => {
    setRfEdges((current) => current.filter((edge) => edge.id !== edgeId));
    setWorkspace((current) => {
      if (!current) return current;
      const next = structuredClone(current);
      const edge = (next.edges || []).find(
        (item, index) => (item.id || `e-${item.from}-${item.to}-${index}`) === edgeId
      );
      if (!edge) return next;
      next.lifecycle.edges = (next.lifecycle.edges || []).filter(
        (item) => !(item.from === edge.from && item.to === edge.to)
      );
      next.edges = next.lifecycle.edges.map((item) => ({ ...item }));
      next.metrics = { ...next.metrics, edgeCount: next.edges.length };
      persistLifecycle(next.lifecycle).catch((error) => setError(error.message));
      return next;
    });
    setSelectedEdgeId("");
    setMenu(null);
  }, [persistLifecycle]);

  const onEdgeContextMenu = useCallback((event, edge) => {
    event.preventDefault();
    setRfEdges((current) =>
      current.map((item) => ({ ...item, selected: item.id === edge.id }))
    );
    setSelectedEdgeId(edge.id);
    setSelectedId("");
    setInspectorOpen(false);
    setMenu({ x: event.clientX, y: event.clientY, edgeId: edge.id });
  }, []);

  const onEdgeClick = useCallback((event, edge) => {
    event.stopPropagation();
    setRfEdges((current) =>
      current.map((item) => ({ ...item, selected: item.id === edge.id }))
    );
    setSelectedEdgeId(edge.id);
    setSelectedId("");
    setInspectorOpen(false);
    setMenu(null);
  }, []);

  const saveNodeCode = useCallback(async () => {
    if (!selectedNodeRule) return;
    setCodeSaving(true);
    setRulesError("");
    try {
      const response = await fetch(
        `/api/rules?name=${encodeURIComponent(selectedNodeRule.id)}`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ functionSource: codeDraft }),
        }
      );
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "保存规则代码失败");
      await loadRules();
    } catch (err) {
      setRulesError(err.message || "保存规则代码失败");
    } finally {
      setCodeSaving(false);
    }
  }, [codeDraft, loadRules, selectedNodeRule]);

  const saveRuleCode = useCallback(async () => {
    if (!selectedRule) return;
    setCodeSaving(true);
    setRulesError("");
    try {
      const response = await fetch(
        `/api/rules?name=${encodeURIComponent(selectedRule.id)}`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ functionSource: codeDraft }),
        }
      );
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "保存组件代码失败");
      await loadRules();
      setSelectedRuleId(selectedRule.id);
    } catch (err) {
      setRulesError(err.message || "保存组件代码失败");
    } finally {
      setCodeSaving(false);
    }
  }, [codeDraft, loadRules, selectedRule]);

  const submitRun = useCallback(async () => {
    const input = runInput.trim();
    if (!input || runLoading || runPreparing || !runReady) return;
    setRunInput("");
    setRunError("");
    setRunMessages((current) => [...current, { role: "user", content: input }]);
    setRunLoading(true);
    try {
      const response = await fetch("/api/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ input }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "运行失败");
      setRunMessages((current) => [
        ...current,
        { role: "assistant", content: data.answer || "没有返回内容。" },
      ]);
    } catch (err) {
      setRunError(err.message || "运行失败");
    } finally {
      setRunLoading(false);
    }
  }, [runInput, runLoading, runPreparing, runReady]);

  const openRunPanel = useCallback(async () => {
    setRunOpen(true);
    setRunPreparing(true);
    setRunReady(false);
    setRunError("");
    setRunMessages([]);
    setRunInput("");
    try {
      const latestWorkspace = await loadWorkspace();
      const validationErrors = validateLifecycle(latestWorkspace?.lifecycle);
      if (validationErrors.length) {
        if (latestWorkspace?.nodes?.length) {
          const firstInvalidNode = latestWorkspace.nodes.find((node) =>
            validationErrors.some(
              (message) =>
                message.includes(`「${node.name}」`) || message.includes(`「${node.id}」`)
            )
          );
          if (firstInvalidNode) {
            setSelectedId(firstInvalidNode.id);
            setInspectorOpen(true);
          }
        }
        throw new Error(`当前编排无法运行：\n${validationErrors.join("\n")}`);
      }
      const response = await fetch("/api/run", { method: "PUT" });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || "重新装配当前编排失败");
      }
      setRunReady(true);
    } catch (err) {
      setRunError(err.message || "重新加载当前编排失败");
    } finally {
      setRunPreparing(false);
    }
  }, [loadWorkspace]);

  const openCreateMenu = useCallback(
    (type, x, y, extra = {}) => {
      setCreateModal({ type, x, y, extra });
      setNodeForm({
        ...emptyNodeForm,
        type: extra.nodeType || "agent",
        handler: extra.nodeType === "harness" ? "timeout_harness.TimeoutHarness" : "",
        name: "",
        description: "",
      });
    },
    []
  );

  const appendLifecycleNode = useCallback((node) => {
    const initialChild =
      node.harness?.attached && workspace?.nodes
        ? workspace.nodes.find((item) => item.id === node.harness.child.ref)
        : null;
    if (node.harness?.attached && !initialChild) {
      node.harness.attached = false;
      delete node.harness.child;
    }

    setRfNodes((current) => [
      ...current,
      {
        id: node.id,
        type: node.type === "harness" ? "harnessNode" : "flowNode",
        position: node.position,
        data: {
          nodeId: node.id,
          label: node.name,
          subtitle:
            node.type === "rule_tool"
              ? `${describeIOType(node.input)} → ${describeIOType(node.output)}`
              : node.type === "user_input"
                ? `输出到 ${describeIOConfig(node.output, "input_text") || "input_text"}`
              : node.handler || node.description,
          type: node.type,
          harnessMode: node.harness?.mode || "contains",
          harnessAttached: node.harness?.attached !== false,
          harnessChild: initialChild
            ? {
                id: initialChild.id,
                label: initialChild.name || initialChild.id,
                subtitle: initialChild.handler || initialChild.description || initialChild.type,
                type: initialChild.type,
              }
            : null,
          onDetachChild: () => harnessActionsRef.current.detach?.(node.id),
        },
      },
    ]);

    setWorkspace((current) => {
      if (!current) return current;
      const next = structuredClone(current);
      next.lifecycle.nodes = [...(next.lifecycle.nodes || []), node];
      if (node.harness?.attached && node.harness.child?.ref) {
        next.lifecycle.nodes = next.lifecycle.nodes.map((item) =>
          item.id === node.harness.child.ref
            ? { ...item, visible: false }
            : item
        );
      }
      next.nodes = next.lifecycle.nodes.map((item) => ({ ...item }));
      next.metrics = {
        nodeCount: next.nodes.length,
        edgeCount: next.edges.length,
        agentCount: next.nodes.filter((item) => item.type === "agent").length,
        ruleCount: next.nodes.filter((item) => item.type === "rule_tool").length,
      };
      persistLifecycle(next.lifecycle).catch((error) => setError(error.message));
      return next;
    });

    setSelectedId(node.id);
    setInspectorOpen(true);
  }, [persistLifecycle, workspace]);

  const insertExistingNode = useCallback((template) => {
    if (!createModal) return;
    const baseName = template.name || template.id || "node";
    const id = `${baseName}_${Date.now()}`;
    const isHarness = template.category === "harness";
    const isAdapter = template.category === "adapter";
    const node = {
      id,
      type: isHarness ? "harness" : isAdapter ? "adapter" : "rule_tool",
      name: baseName,
      handler: isHarness ? `${baseName}.${toPascalCase(baseName)}` : `${baseName}.${baseName}`,
      description: template.protocol?.descript || template.protocol?.description || "",
      input: isHarness
        ? {}
        : {
            field: "input_text",
            type: template.protocol?.input?.type || "str",
          },
      output: isHarness
        ? {}
        : {
            field: "result",
            type: template.protocol?.output?.type || "str",
          },
      position: createModal.extra.position || { x: 120, y: 120 },
    };

    if (isHarness) {
      node.harness = {
        mode: template.protocol?.modes?.[0] || "contains",
        attached: false,
        config: {
          timeout_seconds: 30,
        },
      };
    }

    appendLifecycleNode(node);
    setCreateModal(null);
  }, [appendLifecycleNode, createModal]);

  const onPaneContextMenu = useCallback((event) => {
    event.preventDefault();
    const bounds = flowRef.current?.getBoundingClientRect();
    if (!bounds) return;
    setMenu({
      x: event.clientX,
      y: event.clientY,
      position: {
        x: event.clientX - bounds.left,
        y: event.clientY - bounds.top,
      },
    });
  }, []);

  const onNodeContextMenu = useCallback((event, node) => {
    event.preventDefault();
    setSelectedId(node.id);
    setInspectorOpen(true);
    setMenu({
      x: event.clientX,
      y: event.clientY,
      nodeId: node.id,
    });
  }, []);

  const createNode = useCallback(() => {
    if (!createModal) return;
    const id = nodeForm.id.trim() || `node_${Date.now()}`;
    const inputConfig = parseIOConfigFromRows(nodeForm.inputRows, nodeForm.inputType, "input_text");
    const outputConfig = parseIOConfigFromRows(nodeForm.outputRows, nodeForm.outputType, "result");
    const node = {
      id,
      type: nodeForm.type,
      name: nodeForm.name.trim() || id,
      handler: nodeForm.type === "user_input" ? "" : nodeForm.handler.trim() || "",
      description: nodeForm.description.trim() || "",
      input: inputConfig,
      output: outputConfig,
      position: createModal.extra.position || { x: 120, y: 120 },
    };
    if (node.type === "harness") {
      node.harness = {
        mode: nodeForm.harnessMode,
        attached: nodeForm.harnessMode === "contains" && Boolean(nodeForm.harnessChildId.trim()),
        config: {
          timeout_seconds: Number(nodeForm.harnessTimeout) || 30,
        },
      };
      if (node.harness.attached) {
        node.harness.child = {
          type: "node",
          ref: nodeForm.harnessChildId.trim(),
        };
      }
    }
    appendLifecycleNode(node);
    setCreateModal(null);
    setNodeForm(emptyNodeForm);
  }, [appendLifecycleNode, createModal, nodeForm]);

  const deleteNode = useCallback((nodeId) => {
    if (nodeId === SYSTEM_USER_INPUT_ID) {
      setError("用户输入节点是系统固定入口，不能删除。");
      setMenu(null);
      return;
    }
    setRfNodes((current) => current.filter((node) => node.id !== nodeId));
    setRfEdges((current) => current.filter((edge) => edge.source !== nodeId && edge.target !== nodeId));
    setWorkspace((current) => {
      if (!current) return current;
      const next = structuredClone(current);
      next.lifecycle.nodes = (next.lifecycle.nodes || []).filter((node) => node.id !== nodeId);
      next.lifecycle.nodes = next.lifecycle.nodes.map((node) => {
        if (
          node.type === "harness" &&
          node.harness?.child?.ref === nodeId
        ) {
          return {
            ...node,
            harness: {
              ...node.harness,
              attached: false,
            },
          };
        }
        return node;
      });
      next.lifecycle.edges = (next.lifecycle.edges || []).filter(
        (edge) => edge.from !== nodeId && edge.to !== nodeId
      );
      next.nodes = next.lifecycle.nodes.map((node) => ({ ...node }));
      next.edges = next.lifecycle.edges.map((edge) => ({ ...edge }));
      next.metrics = {
        nodeCount: next.nodes.length,
        edgeCount: next.edges.length,
        agentCount: next.nodes.filter((item) => item.type === "agent").length,
        ruleCount: next.nodes.filter((item) => item.type === "rule_tool").length,
      };
      persistLifecycle(next.lifecycle).catch((error) => setError(error.message));
      return next;
    });
    setSelectedId("");
    setMenu(null);
    setInspectorOpen(false);
  }, [persistLifecycle]);

  const startLink = useCallback((nodeId) => {
    setLinkSourceId(nodeId);
    setMenu(null);
  }, []);

  const linkTo = useCallback(
    (targetId) => {
      if (!linkSourceId || linkSourceId === targetId) return;
      setRfEdges((current) => {
        const exists = current.some(
          (edge) => edge.source === linkSourceId && edge.target === targetId
        );
        if (exists) return current;
        return addEdge({ source: linkSourceId, target: targetId, type: "smoothstep" }, current);
      });
      setWorkspace((current) => {
        if (!current) return current;
        const next = structuredClone(current);
        const exists = (next.lifecycle.edges || []).some(
          (edge) => edge.from === linkSourceId && edge.to === targetId
        );
        if (!exists) {
          next.lifecycle.edges = [
            ...(next.lifecycle.edges || []),
            { from: linkSourceId, to: targetId },
          ];
          next.edges = next.lifecycle.edges.map((item) => ({ ...item }));
          next.metrics = { ...next.metrics, edgeCount: next.edges.length };
          persistLifecycle(next.lifecycle).catch((error) => setError(error.message));
        }
        return next;
      });
      setMenu(null);
      setLinkSourceId("");
    },
    [linkSourceId, persistLifecycle]
  );

  const onNodeDragStop = useCallback((event, node) => {
    if (node.data?.type !== "agent") return;

    const harnessWrappers = Array.from(
      document.querySelectorAll(".react-flow__node")
    );
    const target = harnessWrappers.find((wrapper) => {
      const harnessId = wrapper.getAttribute("data-id");
      const slot = wrapper.querySelector(".harness-node-slot");
      if (!harnessId || !slot) return false;
      const harness = workspace?.nodes?.find((item) => item.id === harnessId);
      if (
        !harness ||
        harness.type !== "harness" ||
        harness.harness?.mode !== "contains" ||
        harness.harness?.attached !== false
      ) {
        return false;
      }
      const bounds = slot.getBoundingClientRect();
      const centerX = event.clientX;
      const centerY = event.clientY;
      return (
        centerX >= bounds.left &&
        centerX <= bounds.right &&
        centerY >= bounds.top &&
        centerY <= bounds.bottom
      );
    });

    if (!target) return;
    const harnessId = target.getAttribute("data-id");
    if (harnessId) {
      insertAgentIntoHarness(harnessId, node.id);
    }
  }, [insertAgentIntoHarness, workspace]);

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark">C</div>
          <div>
            <div className="brand-title">CreatHarness</div>
            <div className="brand-subtitle">Agent Rules Studio</div>
          </div>
        </div>

        <nav className="nav nav-compact">
          <a
            className={`nav-item ${activePage === "rules" ? "active" : ""}`}
            href="#"
            onClick={(e) => {
              e.preventDefault();
              setActivePage("rules");
            }}
          >
            规则管理
          </a>
          <a
            className={`nav-item ${activePage === "flow" ? "active" : ""}`}
            href="#"
            onClick={(e) => {
              e.preventDefault();
              setActivePage("flow");
            }}
          >
            智能体编排
          </a>
          <a className="nav-item" href="#">工具中心</a>
          <a className="nav-item" href="#">运行日志</a>
        </nav>
      </aside>

      <main className="main">
        {activePage === "rules" ? (
          <RulesPanel
            ruleGroups={ruleGroups}
            rulesLoading={rulesLoading}
            rulesError={rulesError}
            selectedRule={selectedRule}
            selectedRuleId={selectedRuleId}
            setSelectedRuleId={setSelectedRuleId}
            setRuleModalOpen={setRuleModalOpen}
            deleteRule={deleteRule}
            codeDraft={codeDraft}
            setCodeDraft={setCodeDraft}
            saveRuleCode={saveRuleCode}
            codeSaving={codeSaving}
            typeLabelMap={typeLabelMap}
            ruleSearch={ruleSearch}
            setRuleSearch={setRuleSearch}
            hasUnsavedCode={codeDraft !== (selectedRule?.functionSource || "")}
          />
        ) : (
          <>
            {loading ? <div className="panel-card">正在读取后端规则...</div> : null}
            {error ? <div className="panel-card" style={{ color: "#ff9aa6" }}>{error}</div> : null}

            <section className="workspace workspace-full">
              <button className="run-fab" onClick={openRunPanel} disabled={runPreparing}>
                <span className="run-fab-dot" />
                {runPreparing ? "加载当前编排..." : "开始运行"}
              </button>
              <div className="center-col full-canvas">
                <div className="flow-stage flow-stage-full" ref={flowRef} onContextMenu={(e) => e.preventDefault()}>
                  <ReactFlow
                    nodes={rfNodes}
                    edges={rfEdges}
                    nodeTypes={nodeTypes}
                    onNodesChange={onNodesChange}
                    onEdgesChange={onEdgesChange}
                    onConnect={onConnect}
                    onNodeClick={(_, node) => {
                      setSelectedId(node.id);
                      setSelectedEdgeId("");
                      setInspectorOpen(true);
                      setMenu(null);
                      if (linkSourceId && linkSourceId !== node.id) {
                        linkTo(node.id);
                      }
                    }}
                    onNodeContextMenu={onNodeContextMenu}
                    onNodeDragStop={onNodeDragStop}
                    onEdgeClick={onEdgeClick}
                    onEdgeContextMenu={onEdgeContextMenu}
                    onPaneClick={() => {
                      setSelectedEdgeId("");
                      setMenu(null);
                    }}
                    onPaneContextMenu={onPaneContextMenu}
                  >
                    <Background gap={18} size={1} color="rgba(255,255,255,0.08)" />
                    <Controls />
                    <MiniMap zoomable pannable />
                  </ReactFlow>
                </div>
              </div>
            </section>
            <RunDrawer
              open={runOpen}
              onClose={() => setRunOpen(false)}
              runPreparing={runPreparing}
              runLoading={runLoading}
              runReady={runReady}
              runMessages={runMessages}
              runError={runError}
              runInput={runInput}
              setRunInput={setRunInput}
              submitRun={submitRun}
              lastRunSummary={lastRunSummary}
              validationErrors={validationErrors}
            />
          </>
        )}
      </main>

      {ruleModalOpen ? (
        <div className="modal" onClick={() => setRuleModalOpen(false)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="section-head compact">
              <h2>新建规则</h2>
              <button className="icon-btn" onClick={() => setRuleModalOpen(false)}>×</button>
            </div>
            <div className="form-grid">
              <label className="full">
                规则名
                <input value={ruleForm.name} onChange={(e) => setRuleForm({ ...ruleForm, name: e.target.value })} />
              </label>
              <label>
                输入类型
                <input value={ruleForm.inputType} onChange={(e) => setRuleForm({ ...ruleForm, inputType: e.target.value })} />
              </label>
              <label>
                输出类型
                <input value={ruleForm.outputType} onChange={(e) => setRuleForm({ ...ruleForm, outputType: e.target.value })} />
              </label>
              <label className="full">
                函数描述
                <textarea
                  rows="3"
                  value={ruleForm.functionDescription}
                  onChange={(e) => setRuleForm({ ...ruleForm, functionDescription: e.target.value })}
                  placeholder="描述这个函数的主要功能和用途"
                />
              </label>
              <label>
                输入说明
                <textarea rows="3" value={ruleForm.inputDescription} onChange={(e) => setRuleForm({ ...ruleForm, inputDescription: e.target.value })} />
              </label>
              <label className="full">
                输出说明
                <textarea rows="3" value={ruleForm.outputDescription} onChange={(e) => setRuleForm({ ...ruleForm, outputDescription: e.target.value })} />
              </label>
              <label className="full">
                函数源码
                <textarea
                  rows="10"
                  value={ruleForm.functionSource}
                  onChange={(e) => setRuleForm({ ...ruleForm, functionSource: e.target.value })}
                  placeholder={"def your_rule(input_text):\n    return input_text"}
                />
              </label>
            </div>
            <div className="modal-actions">
              <button className="secondary-btn" onClick={() => setRuleModalOpen(false)}>取消</button>
              <button className="primary-btn" onClick={createRule}>创建</button>
            </div>
          </div>
        </div>
      ) : null}

      {menu ? (
        <div
          className="context-menu"
          style={{ left: menu.x, top: menu.y }}
          onMouseLeave={() => setMenu(null)}
        >
          <button onClick={() => openCreateMenu("pane", menu.x, menu.y, { position: menu.position })}>
            在此创建节点
          </button>
          <button onClick={() => openCreateMenu("existing_rule", menu.x, menu.y, { position: menu.position })}>
            插入已有 Rule
          </button>
          <button onClick={() => openCreateMenu("existing_adapter", menu.x, menu.y, { position: menu.position })}>
            插入已有 Adapter
          </button>
          <button onClick={() => openCreateMenu("existing_harness", menu.x, menu.y, { position: menu.position })}>
            插入已有 Harness
          </button>
          {menu.nodeId ? (
            <>
              <button onClick={() => startLink(menu.nodeId)}>开始连线</button>
              <button onClick={() => linkTo(menu.nodeId)}>连接到这里</button>
              <button
                onClick={() => deleteNode(menu.nodeId)}
                disabled={menu.nodeId === SYSTEM_USER_INPUT_ID}
              >
                删除节点
              </button>
            </>
          ) : null}
          {menu.edgeId ? (
            <>
              <button
                onClick={() => {
                  setRfEdges((current) =>
                    current.map((item) => ({ ...item, selected: item.id === menu.edgeId }))
                  );
                  setSelectedEdgeId(menu.edgeId);
                  setMenu(null);
                }}
              >
                选中连线
              </button>
              <button onClick={() => deleteEdge(menu.edgeId)}>删除连线</button>
            </>
          ) : null}
        </div>
      ) : null}

      <InspectorDrawer
        open={inspectorOpen}
        inspectorResizing={inspectorResizing}
        inspectorWidth={inspectorWidth}
        startInspectorResize={startInspectorResize}
        onClose={() => setInspectorOpen(false)}
        selectedNode={selectedNode}
        selectedNodeRule={selectedNodeRule}
        codeDraft={codeDraft}
        setCodeDraft={setCodeDraft}
        saveNodeCode={saveNodeCode}
        codeSaving={codeSaving}
        deleteNode={deleteNode}
        systemUserInputId={SYSTEM_USER_INPUT_ID}
        describeIOConfig={describeIOConfig}
        nodeValidationErrors={selectedNodeErrors}
        incomingCount={selectedNodeConnections.incoming}
        outgoingCount={selectedNodeConnections.outgoing}
        hasUnsavedCode={codeDraft !== (selectedNodeRule?.functionSource || "")}
      />

      {createModal ? (
        <div className="modal" onClick={() => setCreateModal(null)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="section-head compact">
              <h2>
                {createModal.type === "existing_rule"
                  ? "插入已有 Rule"
                  : createModal.type === "existing_adapter"
                    ? "插入已有 Adapter"
                  : createModal.type === "existing_harness"
                    ? "插入已有 Harness"
                    : "新建编排节点"}
              </h2>
              <button className="icon-btn" onClick={() => setCreateModal(null)}>×</button>
            </div>
            {createModal.type === "existing_rule" || createModal.type === "existing_adapter" || createModal.type === "existing_harness" ? (
              <div className="template-picker">
                {(createModal.type === "existing_rule"
                  ? reusableRules
                  : createModal.type === "existing_adapter"
                    ? reusableAdapters
                    : reusableHarnesses).map((item) => (
                  <button
                    key={`${createModal.type}-${item.id}`}
                    type="button"
                    className="template-item"
                    onClick={() => insertExistingNode(item)}
                  >
                    <div className="template-item-name">{item.name}</div>
                    <div className="template-item-meta">
                      {(typeLabelMap[item.category] || item.category)} · {item.protocol?.descript || item.protocol?.output?.description || "可插入到当前画布"}
                    </div>
                  </button>
                ))}
                {(createModal.type === "existing_rule"
                  ? reusableRules
                  : createModal.type === "existing_adapter"
                    ? reusableAdapters
                    : reusableHarnesses).length === 0 ? (
                  <div className="panel-card">当前没有可插入的{createModal.type === "existing_rule" ? " Rule" : createModal.type === "existing_adapter" ? " Adapter" : " Harness"}。</div>
                ) : null}
              </div>
            ) : (
            <div className="form-grid">
              <label>
                节点 ID
                <input value={nodeForm.id} onChange={(e) => setNodeForm({ ...nodeForm, id: e.target.value })} />
              </label>
              <label>
                节点类型
                <select value={nodeForm.type} onChange={(e) => setNodeForm({ ...nodeForm, type: e.target.value })}>
                  <option value="agent">agent</option>
                  <option value="rule_tool">rule_tool</option>
                  <option value="builtin">builtin</option>
                  <option value="adapter">adapter</option>
                  <option value="harness">harness</option>
                </select>
              </label>
              <label>
                名称
                <input value={nodeForm.name} onChange={(e) => setNodeForm({ ...nodeForm, name: e.target.value })} />
              </label>
              <label>
                Handler
                <input
                  value={nodeForm.handler}
                  onChange={(e) => setNodeForm({ ...nodeForm, handler: e.target.value })}
                  placeholder={
                    nodeForm.type === "harness"
                      ? "timeout_harness.TimeoutHarness"
                      : nodeForm.type === "user_input"
                        ? "用户输入节点无需 handler"
                        : ""
                  }
                  disabled={nodeForm.type === "user_input"}
                />
              </label>
              {nodeForm.type === "harness" ? (
                <>
                  <label>
                    Harness 模式
                    <select value={nodeForm.harnessMode} onChange={(e) => setNodeForm({ ...nodeForm, harnessMode: e.target.value })}>
                      <option value="contains">包含式</option>
                      <option value="before_after">前后置式</option>
                    </select>
                  </label>
                  {nodeForm.harnessMode === "contains" ? (
                    <label>
                      初始 Agent ID（可留空）
                      <input value={nodeForm.harnessChildId} onChange={(e) => setNodeForm({ ...nodeForm, harnessChildId: e.target.value })} placeholder="留空后从画布拖入 Agent" />
                    </label>
                  ) : (
                    <div className="form-note">
                      前后置型 Harness 不包含节点，创建后可作为画布上的独立策略节点。
                    </div>
                  )}
                  <label>
                    配置秒数
                    <input type="number" min="1" value={nodeForm.harnessTimeout} onChange={(e) => setNodeForm({ ...nodeForm, harnessTimeout: e.target.value })} />
                  </label>
                </>
              ) : null}
              <div className="full io-structured-panel">
                <div className="io-structured-head">
                  <span>输入映射</span>
                  <button type="button" className="secondary-btn io-row-add" onClick={() => addNodeFormRow("input")}>
                    + 添加输入字段
                  </button>
                </div>
                <div className="io-structured-list">
                  {(nodeForm.inputRows || []).map((row, index) => (
                    <div className="io-structured-row" key={`input-${index}`}>
                      <input
                        value={row.key}
                        onChange={(e) => updateNodeFormRows("input", index, { key: e.target.value })}
                        placeholder="目标字段名"
                      />
                      <input
                        value={row.source}
                        onChange={(e) => updateNodeFormRows("input", index, { source: e.target.value })}
                        placeholder="来源字段名"
                      />
                      <button type="button" className="icon-btn io-row-remove" onClick={() => removeNodeFormRow("input", index)}>
                        ×
                      </button>
                    </div>
                  ))}
                </div>
                <div className="io-structured-tip">左边是当前节点接收字段，右边是从上游读取的字段名。</div>
              </div>
              <label>
                输入类型
                <input value={nodeForm.inputType} onChange={(e) => setNodeForm({ ...nodeForm, inputType: e.target.value })} />
              </label>
              <div className="full io-structured-panel">
                <div className="io-structured-head">
                  <span>输出映射</span>
                  <button type="button" className="secondary-btn io-row-add" onClick={() => addNodeFormRow("output")}>
                    + 添加输出字段
                  </button>
                </div>
                <div className="io-structured-list">
                  {(nodeForm.outputRows || []).map((row, index) => (
                    <div className="io-structured-row" key={`output-${index}`}>
                      <input
                        value={row.key}
                        onChange={(e) => updateNodeFormRows("output", index, { key: e.target.value })}
                        placeholder="输出字段名"
                      />
                      <input
                        value={row.source}
                        onChange={(e) => updateNodeFormRows("output", index, { source: e.target.value })}
                        placeholder="写入状态字段名"
                      />
                      <button type="button" className="icon-btn io-row-remove" onClick={() => removeNodeFormRow("output", index)}>
                        ×
                      </button>
                    </div>
                  ))}
                </div>
                <div className="io-structured-tip">左边是当前节点产出字段，右边是写入运行状态时使用的字段名。</div>
              </div>
              <label>
                输出类型
                <input value={nodeForm.outputType} onChange={(e) => setNodeForm({ ...nodeForm, outputType: e.target.value })} />
              </label>
              <label className="full">
                说明
                <textarea rows="3" value={nodeForm.description} onChange={(e) => setNodeForm({ ...nodeForm, description: e.target.value })} />
              </label>
            </div>
            )}
            <div className="modal-actions">
              <button className="secondary-btn" onClick={() => setCreateModal(null)}>取消</button>
              {createModal.type === "pane" ? (
                <button className="primary-btn" onClick={createNode}>添加节点</button>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
