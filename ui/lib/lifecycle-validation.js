function edgeSource(edge) {
  return edge?.from ?? edge?.source;
}

function edgeTarget(edge) {
  return edge?.to ?? edge?.target;
}

function formatNodeName(node) {
  return node?.name || node?.id || "未命名节点";
}

function hasValidFieldBinding(config) {
  if (!config || typeof config !== "object") return false;
  if (typeof config.field === "string" && config.field.trim()) return true;
  if (Array.isArray(config.fields)) {
    return (
      config.fields.length > 0 &&
      config.fields.every((field) => typeof field === "string" && field.trim())
    );
  }
  if (config.fields && typeof config.fields === "object") {
    const entries = Object.entries(config.fields);
    return (
      entries.length > 0 &&
      entries.every(
        ([target, source]) =>
          typeof target === "string" &&
          target.trim() &&
          typeof source === "string" &&
          source.trim()
      )
    );
  }
  return false;
}

export function validateLifecycle(lifecycle) {
  const errors = [];
  if (!lifecycle || typeof lifecycle !== "object") {
    return ["当前编排为空，无法运行。"];
  }

  const nodes = Array.isArray(lifecycle.nodes) ? lifecycle.nodes : [];
  const edges = Array.isArray(lifecycle.edges) ? lifecycle.edges : [];
  const nodeMap = new Map();
  const userInputNodes = nodes.filter((node) => node?.type === "user_input");

  if (!nodes.length) {
    errors.push("当前编排没有节点，无法运行。");
  }

  for (const node of nodes) {
    if (!node || typeof node !== "object" || !node.id) {
      errors.push("存在没有 ID 的节点。");
      continue;
    }
    if (nodeMap.has(node.id)) {
      errors.push(`节点 ID「${node.id}」重复。`);
    } else {
      nodeMap.set(node.id, node);
    }

    if (node.type !== "user_input" && node.input && !hasValidFieldBinding(node.input)) {
      errors.push(`节点「${formatNodeName(node)}」的输入配置无效。`);
    }
    if (
      ["agent", "rule_tool", "adapter", "user_input"].includes(node.type) &&
      node.output &&
      !hasValidFieldBinding(node.output)
    ) {
      errors.push(`节点「${formatNodeName(node)}」的输出配置无效。`);
    }
  }

  const entrypoint = lifecycle.entrypoint;
  const exitpoint = lifecycle.exitpoint;
  if (userInputNodes.length !== 1) {
    errors.push("系统入口节点 user_input 必须且只能存在一个。");
  }
  if (!entrypoint) errors.push("没有配置入口节点。");
  if (!exitpoint) errors.push("没有配置出口节点。");
  if (entrypoint && !nodeMap.has(entrypoint)) {
    errors.push(`入口节点「${entrypoint}」不存在。`);
  }
  if (exitpoint && !nodeMap.has(exitpoint)) {
    errors.push(`出口节点「${exitpoint}」不存在。`);
  }
  if (userInputNodes.length === 1 && entrypoint && entrypoint !== userInputNodes[0].id) {
    errors.push("入口节点必须固定为 user_input。");
  }

  const containedChildIds = new Set();
  for (const node of nodes) {
    if (node?.type !== "harness") continue;
    const config = node.harness;
    const mode = config?.mode || "contains";
    if (!config || typeof config !== "object") {
      errors.push(`Harness「${formatNodeName(node)}」缺少 Harness 配置。`);
      continue;
    }
    if (!["contains", "before_after"].includes(mode)) {
      errors.push(`Harness「${formatNodeName(node)}」的类型不受支持。`);
    }
    if (mode !== "contains") continue;

    const child = config.child;
    if (
      child &&
      typeof child === "object" &&
      (child.type || "node") === "node" &&
      child.ref &&
      nodeMap.has(child.ref)
    ) {
      containedChildIds.add(child.ref);
    }
    if (config.attached === false) {
      errors.push(
        `Harness「${formatNodeName(node)}」的包含凹槽为空，请重新插入 Agent 或子图。`
      );
      continue;
    }

    if (!child || typeof child !== "object") {
      errors.push(`Harness「${formatNodeName(node)}」没有包含 Agent 或子图。`);
      continue;
    }
    if ((child.type || "node") === "node") {
      if (!child.ref || !nodeMap.has(child.ref)) {
        errors.push(
          `Harness「${formatNodeName(node)}」包含的节点不存在，请重新绑定。`
        );
      }
    } else if (child.type === "subgraph") {
      if (!child.graph || typeof child.graph !== "object") {
        errors.push(`Harness「${formatNodeName(node)}」包含的子图定义为空。`);
      }
    } else {
      errors.push(`Harness「${formatNodeName(node)}」包含了未知类型的子对象。`);
    }
  }

  const outgoing = new Map(nodes.map((node) => [node.id, new Set()]));
  const incoming = new Map(nodes.map((node) => [node.id, new Set()]));
  for (const edge of edges) {
    const source = edgeSource(edge);
    const target = edgeTarget(edge);
    if (!source || !target) {
      errors.push("存在缺少起点或终点的连线。");
      continue;
    }
    if (!nodeMap.has(source) && source !== "START") {
      errors.push(`连线起点「${source}」不存在。`);
      continue;
    }
    if (!nodeMap.has(target) && target !== "END") {
      errors.push(`连线终点「${target}」不存在。`);
      continue;
    }
    if (nodeMap.has(source) && nodeMap.has(target)) {
      outgoing.get(source).add(target);
      incoming.get(target).add(source);
    }
  }

  if (entrypoint && exitpoint && nodeMap.has(entrypoint) && nodeMap.has(exitpoint)) {
    const reachableFromEntry = traverse(entrypoint, outgoing);
    const canReachExit = traverse(exitpoint, incoming);
    for (const node of nodes) {
      if (!node?.id || containedChildIds.has(node.id)) continue;
      if (!reachableFromEntry.has(node.id) || !canReachExit.has(node.id)) {
        errors.push(
          `节点「${formatNodeName(node)}」不在入口到出口的完整链条上，请检查连线。`
        );
      }
    }
    if (!reachableFromEntry.has(exitpoint)) {
      errors.push(`入口节点「${entrypoint}」无法到达出口节点「${exitpoint}」。`);
    }
  }

  return [...new Set(errors)];
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
