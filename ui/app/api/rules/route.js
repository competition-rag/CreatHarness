import { NextResponse } from "next/server";
import fs from "node:fs/promises";
import path from "node:path";

const PROJECT_ROOT = process.env.CREATHARNESS_ROOT || path.resolve(process.cwd(), "..");
const NODE_DIR = process.env.CREATHARNESS_NODE_DIR || path.join(PROJECT_ROOT, "node");
const RULES_DIR = path.join(NODE_DIR, "rules");
const AGENTS_DIR = path.join(NODE_DIR, "agents");
const ADAPTERS_DIR = path.join(NODE_DIR, "adapters");
const HARNESS_DIR = path.join(NODE_DIR, "harness");
const RULE_PROTOCOLS_DIR = path.join(RULES_DIR, "protocols");
const RULE_TOOLS_DIR = path.join(RULES_DIR, "tools");
const AGENT_PROTOCOLS_DIR = path.join(AGENTS_DIR, "protocols");
const AGENT_TOOLS_DIR = path.join(AGENTS_DIR, "tools");
const ADAPTER_PROTOCOLS_DIR = path.join(ADAPTERS_DIR, "protocols");
const ADAPTER_TOOLS_DIR = path.join(ADAPTERS_DIR, "tools");
const HARNESS_PROTOCOLS_DIR = path.join(HARNESS_DIR, "protocols");
const HARNESS_TOOLS_DIR = path.join(HARNESS_DIR, "tools");

async function readJsonFile(filePath) {
  const raw = await fs.readFile(filePath, "utf8");
  return JSON.parse(raw);
}

function safeRuleName(name) {
  return String(name || "")
    .trim()
    .replace(/[^a-zA-Z0-9_\u4e00-\u9fa5]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function indentBlock(text, spaces = 4) {
  const prefix = " ".repeat(spaces);
  return String(text || "")
    .split(/\r?\n/)
    .map((line) => (line ? `${prefix}${line}` : ""))
    .join("\n");
}

function normalizeFunctionSource(name, source) {
  const trimmed = String(source || "").trim();
  if (!trimmed) {
    return `def ${name}(request):
    raise NotImplementedError("请在这里实现组件逻辑")`;
  }

  if (!/^(async\s+def|def)\s+[a-zA-Z_][a-zA-Z0-9_]*\s*\(/.test(trimmed)) {
    return `def ${name}(input_text):
${indentBlock(trimmed)}`;
  }

  return trimmed.replace(
    /^(async\s+def|def)\s+[a-zA-Z_][a-zA-Z0-9_]*\s*\(/,
    (match, keyword) => `${keyword} ${name}(`
  );
}

function buildComponentSource({
  name,
  functionSource,
  decoratorName = "rule",
}) {
  return `"""Auto-generated component implementation.

协议单源说明：
- 组件协议以 node/*/protocols/*.json 为准
- 本文件只负责注册组件名称和实现逻辑
"""

from __future__ import annotations

from ${decoratorName} import ${decoratorName}


@${decoratorName}(
    name="${name}",
)
${normalizeFunctionSource(name, functionSource)}
`;
}

function normalizeProtocol(protocol, category, fallbackName) {
  const name = protocol?.name || fallbackName;
  const normalized = {
    protocolVersion: protocol?.protocolVersion || "1.0",
    sourceOfTruth: "json",
    category,
    name,
    descript: protocol?.descript || protocol?.description || "",
    input: {
      type: protocol?.input?.type || "dict",
      description: protocol?.input?.description || "",
    },
    output: {
      type: protocol?.output?.type || "ComponentResponse",
      description: protocol?.output?.description || "",
    },
  };
  if (Array.isArray(protocol?.modes)) normalized.modes = protocol.modes;
  if (protocol?.configSchema) normalized.configSchema = protocol.configSchema;
  if (protocol?.transform) normalized.transform = protocol.transform;
  if (protocol?.config) normalized.config = protocol.config;
  return normalized;
}

export async function GET() {
  try {
    const groups = [
      { protocolsDir: RULE_PROTOCOLS_DIR, toolsDir: RULE_TOOLS_DIR, category: "rule" },
      { protocolsDir: AGENT_PROTOCOLS_DIR, toolsDir: AGENT_TOOLS_DIR, category: "agent" },
      { protocolsDir: ADAPTER_PROTOCOLS_DIR, toolsDir: ADAPTER_TOOLS_DIR, category: "adapter" },
      { protocolsDir: HARNESS_PROTOCOLS_DIR, toolsDir: HARNESS_TOOLS_DIR, category: "harness" },
    ];
    const rules = [];

    for (const group of groups) {
      const files = await fs.readdir(group.protocolsDir, { withFileTypes: true }).catch(() => []);
      for (const entry of files) {
        if (!entry.isFile() || !entry.name.endsWith(".json")) continue;
        const protocolPath = path.join(group.protocolsDir, entry.name);
        const protocol = normalizeProtocol(
          await readJsonFile(protocolPath),
          group.category,
          path.basename(entry.name, ".json")
        );
        const toolPath = path.join(group.toolsDir, `${path.basename(entry.name, ".json")}.py`);

        rules.push({
          id: protocol.name || path.basename(entry.name, ".json"),
          name: protocol.name || path.basename(entry.name, ".json"),
          category: group.category,
          protocol,
          toolPath: await fileExists(toolPath) ? toolPath : "",
          functionSource: await readOptionalFile(toolPath),
        });
      }
    }

    rules.sort((a, b) => a.name.localeCompare(b.name, "zh-CN"));

    return NextResponse.json({
      rules,
      count: rules.length,
      source: {
        nodeDir: NODE_DIR,
        rulesDir: RULES_DIR,
        agentsDir: AGENTS_DIR,
        adaptersDir: ADAPTERS_DIR,
        harnessDir: HARNESS_DIR,
        ruleProtocolsDir: RULE_PROTOCOLS_DIR,
        ruleToolsDir: RULE_TOOLS_DIR,
        agentProtocolsDir: AGENT_PROTOCOLS_DIR,
        agentToolsDir: AGENT_TOOLS_DIR,
        adapterProtocolsDir: ADAPTER_PROTOCOLS_DIR,
        adapterToolsDir: ADAPTER_TOOLS_DIR,
        harnessProtocolsDir: HARNESS_PROTOCOLS_DIR,
        harnessToolsDir: HARNESS_TOOLS_DIR,
      },
    });
  } catch (error) {
    return NextResponse.json(
      { error: error.message || "Unable to read rules." },
      { status: 500 }
    );
  }
}

export async function POST(request) {
  try {
    const body = await request.json();
    const rawName = body?.name;
    const name = safeRuleName(rawName);
    const descript = body?.descript || body?.functionDescription || "";
    const inputType = body?.inputType || "str";
    const outputType = body?.outputType || "str";
    const inputDescription = body?.inputDescription || "";
    const outputDescription = body?.outputDescription || "";
    const functionSource = body?.functionSource || "";

    if (!name) {
      return NextResponse.json({ error: "Missing rule name." }, { status: 400 });
    }

    const protocolPath = path.join(RULE_PROTOCOLS_DIR, `${name}.json`);
    const toolPath = path.join(RULE_TOOLS_DIR, `${name}.py`);

    if (await fileExists(protocolPath) || await fileExists(toolPath)) {
      return NextResponse.json({ error: "Rule already exists." }, { status: 409 });
    }

    const protocol = {
      protocolVersion: "1.0",
      sourceOfTruth: "json",
      category: "rule",
      name,
      descript,
      input: {
        type: inputType,
        description: inputDescription,
      },
      output: {
        type: outputType,
        description: outputDescription,
      },
    };

    await fs.writeFile(protocolPath, JSON.stringify(protocol, null, 2), "utf8");
    await fs.writeFile(
      toolPath,
      buildComponentSource({
        name,
        functionSource,
      }),
      "utf8"
    );

    return NextResponse.json({ ok: true, name, protocolPath, toolPath });
  } catch (error) {
    return NextResponse.json(
      { error: error.message || "Unable to create rule." },
      { status: 500 }
    );
  }
}

export async function PUT(request) {
  try {
    const url = new URL(request.url);
    const name = safeRuleName(url.searchParams.get("name"));
    const body = await request.json();
    const source = String(body?.functionSource ?? body?.source ?? "");

    if (!name) {
      return NextResponse.json({ error: "Missing rule name." }, { status: 400 });
    }
    if (!source.trim()) {
      return NextResponse.json({ error: "Rule source cannot be empty." }, { status: 400 });
    }

    const component = await resolveComponentPaths(name);
    if (!component || !(await fileExists(component.toolPath))) {
      return NextResponse.json({ error: "Rule implementation not found." }, { status: 404 });
    }

    await fs.writeFile(component.toolPath, source, "utf8");
    return NextResponse.json({ ok: true, name, toolPath: component.toolPath });
  } catch (error) {
    return NextResponse.json(
      { error: error.message || "Unable to save rule source." },
      { status: 500 }
    );
  }
}

export async function DELETE(request) {
  try {
    const url = new URL(request.url);
    const name = safeRuleName(url.searchParams.get("name"));
    if (!name) {
      return NextResponse.json({ error: "Missing rule name." }, { status: 400 });
    }

    const component = await resolveComponentPaths(name);
    if (component) {
      if (await fileExists(component.protocolPath)) {
        await fs.unlink(component.protocolPath);
      }
      if (await fileExists(component.toolPath)) {
        await fs.unlink(component.toolPath);
      }
    }

    return NextResponse.json({ ok: true, name });
  } catch (error) {
    return NextResponse.json(
      { error: error.message || "Unable to delete rule." },
      { status: 500 }
    );
  }
}

async function fileExists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function resolveComponentPaths(name) {
  const candidates = [
    { protocolsDir: RULE_PROTOCOLS_DIR, toolsDir: RULE_TOOLS_DIR, category: "rule" },
    { protocolsDir: AGENT_PROTOCOLS_DIR, toolsDir: AGENT_TOOLS_DIR, category: "agent" },
    { protocolsDir: ADAPTER_PROTOCOLS_DIR, toolsDir: ADAPTER_TOOLS_DIR, category: "adapter" },
    { protocolsDir: HARNESS_PROTOCOLS_DIR, toolsDir: HARNESS_TOOLS_DIR, category: "harness" },
  ];

  for (const candidate of candidates) {
    const protocolPath = path.join(candidate.protocolsDir, `${name}.json`);
    const toolPath = path.join(candidate.toolsDir, `${name}.py`);
    if (await fileExists(protocolPath) || await fileExists(toolPath)) {
      return { ...candidate, protocolPath, toolPath };
    }
  }

  return null;
}

async function readOptionalFile(filePath) {
  try {
    return await fs.readFile(filePath, "utf8");
  } catch {
    return "";
  }
}
