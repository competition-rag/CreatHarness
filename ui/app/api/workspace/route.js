import { NextResponse } from "next/server";
import fs from "node:fs/promises";
import path from "node:path";
import YAML from "yaml";

const PROJECT_ROOT = process.env.CREATHARNESS_ROOT || path.resolve(process.cwd(), "..");
const NODE_DIR = process.env.CREATHARNESS_NODE_DIR || path.join(PROJECT_ROOT, "node");
const RULES_DIR = path.join(NODE_DIR, "rules");
const AGENTS_DIR = path.join(NODE_DIR, "agents");
const ADAPTERS_DIR = path.join(NODE_DIR, "adapters");
const LIFECYCLE_FILE = path.join(
  NODE_DIR,
  "lifecycle_graphs",
  "hotpot_agent_lifecycle.yaml"
);

const SYSTEM_USER_INPUT_ID = "user_input";

function ensureSystemUserInput(lifecycle) {
  const next = lifecycle && typeof lifecycle === "object" ? structuredClone(lifecycle) : {};
  const nodes = Array.isArray(next.nodes) ? next.nodes.filter(Boolean) : [];
  const edges = Array.isArray(next.edges) ? next.edges.filter(Boolean) : [];
  const userInputNode = {
    id: SYSTEM_USER_INPUT_ID,
    type: "user_input",
    name: "用户输入",
    handler: "",
    description: "当前流程的系统入口节点",
    input: {
      field: "input_text",
      type: "str",
    },
    output: {
      field: "input_text",
      type: "str",
    },
    position: { x: 80, y: 160 },
    visible: true,
  };

  const preservedNodes = nodes.filter((node) => node.id !== SYSTEM_USER_INPUT_ID);
  const previousEntrypoint =
    typeof next.entrypoint === "string" &&
    next.entrypoint &&
    next.entrypoint !== SYSTEM_USER_INPUT_ID
      ? next.entrypoint
      : preservedNodes[0]?.id || "";

  next.nodes = [userInputNode, ...preservedNodes];
  next.entrypoint = SYSTEM_USER_INPUT_ID;
  next.edges = edges;

  const hasUserInputOutput = next.edges.some(
    (edge) => edge?.from === SYSTEM_USER_INPUT_ID
  );
  if (
    !hasUserInputOutput &&
    previousEntrypoint &&
    previousEntrypoint !== SYSTEM_USER_INPUT_ID &&
    next.nodes.some((node) => node.id === previousEntrypoint)
  ) {
    next.edges.unshift({
      id: `e-${SYSTEM_USER_INPUT_ID}-${previousEntrypoint}`,
      from: SYSTEM_USER_INPUT_ID,
      to: previousEntrypoint,
    });
  }

  return next;
}

function normalizeNode(node) {
  return {
    id: node.id,
    type: node.type,
    name: node.name || node.id,
    handler: node.handler || "",
    description: node.description || "",
    input: node.input || {},
    output: node.output || {},
    on_error: node.on_error || "",
    action: node.action || "",
    position: node.position || { x: 0, y: 0 },
    width: node.width,
    height: node.height,
    visible: node.visible !== false,
    harness: node.harness || null,
  };
}

async function readLifecycle() {
  const raw = await fs.readFile(LIFECYCLE_FILE, "utf8");
  return ensureSystemUserInput(YAML.parse(raw));
}

async function readRuleCatalog() {
  const [ruleToolFiles, agentToolFiles, adapterToolFiles, ruleProtocolFiles, agentProtocolFiles, adapterProtocolFiles] =
    await Promise.all([
      fs.readdir(path.join(RULES_DIR, "tools"), { withFileTypes: true }),
      fs.readdir(path.join(AGENTS_DIR, "tools"), { withFileTypes: true }),
      fs.readdir(path.join(ADAPTERS_DIR, "tools"), { withFileTypes: true }).catch(() => []),
      fs.readdir(path.join(RULES_DIR, "protocols"), { withFileTypes: true }).catch(() => []),
      fs.readdir(path.join(AGENTS_DIR, "protocols"), { withFileTypes: true }).catch(() => []),
      fs.readdir(path.join(ADAPTERS_DIR, "protocols"), { withFileTypes: true }).catch(() => []),
  ]);

  return {
    ruleFiles: [...ruleToolFiles, ...agentToolFiles, ...adapterToolFiles]
      .filter((entry) => entry.isFile() && entry.name.endsWith(".py"))
      .map((entry) => entry.name),
    protocolFiles: [...ruleProtocolFiles, ...agentProtocolFiles, ...adapterProtocolFiles]
      .filter((entry) => entry.isFile() && entry.name.endsWith(".json"))
      .map((entry) => entry.name),
  };
}

export async function GET() {
  try {
    const [lifecycle, catalog] = await Promise.all([readLifecycle(), readRuleCatalog()]);
    await fs.writeFile(LIFECYCLE_FILE, YAML.stringify(lifecycle), "utf8");
    const nodes = Array.isArray(lifecycle.nodes) ? lifecycle.nodes.map(normalizeNode) : [];
    const edges = Array.isArray(lifecycle.edges) ? lifecycle.edges : [];

    return NextResponse.json({
      source: {
        rulesDir: RULES_DIR,
        agentsDir: AGENTS_DIR,
        lifecycleFile: LIFECYCLE_FILE,
      },
      catalog,
      lifecycle,
      nodes,
      edges,
      metrics: {
        nodeCount: nodes.length,
        edgeCount: edges.length,
        agentCount: nodes.filter((node) => node.type === "agent").length,
        ruleCount: nodes.filter((node) => node.type === "rule_tool").length,
      },
    });
  } catch (error) {
    return NextResponse.json(
      { error: error.message || "Unable to read workspace." },
      { status: 500 }
    );
  }
}

export async function PUT(request) {
  try {
    const body = await request.json();
    const lifecycle = ensureSystemUserInput(body.lifecycle);
    if (!lifecycle || typeof lifecycle !== "object") {
      return NextResponse.json({ error: "Missing lifecycle payload." }, { status: 400 });
    }

    await fs.writeFile(LIFECYCLE_FILE, YAML.stringify(lifecycle), "utf8");
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { error: error.message || "Unable to save workspace." },
      { status: 500 }
    );
  }
}
