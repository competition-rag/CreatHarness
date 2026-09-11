import { NextResponse } from "next/server";
import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import YAML from "yaml";
import { validateLifecycle } from "../../../lib/lifecycle-validation";
const PROJECT_ROOT = process.env.CREATHARNESS_ROOT || path.resolve(process.cwd(), "..");
const ASSEMBLED_DIR =
  process.env.CREATHARNESS_ASSEMBLED_DIR ||
  path.join(PROJECT_ROOT, "assembled", "hotpot_agent_lifecycle");
const ASSEMBLER =
  process.env.CREATHARNESS_ASSEMBLER ||
  path.join(PROJECT_ROOT, "assembly_runtime", "rule_assembler.py");
const NODE_DIR =
  process.env.CREATHARNESS_NODE_DIR || path.join(PROJECT_ROOT, "node");
const LIFECYCLE_FILE =
  process.env.CREATHARNESS_LIFECYCLE_FILE ||
  path.join(NODE_DIR, "lifecycle_graphs", "hotpot_agent_lifecycle.yaml");
const PYTHON = process.env.CREATHARNESS_PYTHON || "python";
const SYSTEM_USER_INPUT_ID = "user_input";
let worker = null;
let workerBuffer = "";
let requestSequence = 0;
const pendingRequests = new Map();

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

async function readCurrentLifecycle() {
  const raw = await fs.readFile(LIFECYCLE_FILE, "utf8");
  const lifecycle = ensureSystemUserInput(YAML.parse(raw));
  await fs.writeFile(LIFECYCLE_FILE, YAML.stringify(lifecycle), "utf8");
  return lifecycle;
}

function stopWorker() {
  if (!worker) return;
  worker.kill();
  worker = null;
  workerBuffer = "";
  rejectPendingRequests(new Error("运行图已刷新，当前请求已取消。"));
}

function assembleCurrentGraph() {
  return new Promise((resolve, reject) => {
    const assemblyProcess = spawn(
      PYTHON,
      [
        ASSEMBLER,
        NODE_DIR,
        path.join(PROJECT_ROOT, "assembled"),
        "--lifecycle-file",
        path.basename(LIFECYCLE_FILE),
        "--force",
      ],
      {
        cwd: PROJECT_ROOT,
        env: {
          ...process.env,
          PYTHONUTF8: "1",
          PYTHONIOENCODING: "utf-8",
        },
        windowsHide: true,
        stdio: ["ignore", "pipe", "pipe"],
      }
    );
    let output = "";
    let errorOutput = "";
    assemblyProcess.stdout.on("data", (chunk) => {
      output += chunk.toString();
    });
    assemblyProcess.stderr.on("data", (chunk) => {
      errorOutput += chunk.toString();
    });
    assemblyProcess.on("error", reject);
    assemblyProcess.on("exit", (code) => {
      if (code === 0) {
        resolve(output.trim());
        return;
      }
      reject(
        new Error(
          errorOutput.trim() ||
            output.trim() ||
            `装配当前生命周期失败（code=${code}）。`
        )
      );
    });
  });
}

async function loadProjectEnv() {
  try {
    const raw = await fs.readFile(path.join(PROJECT_ROOT, ".env"), "utf8");
    const env = {};
    for (const rawLine of raw.split(/\r?\n/)) {
      const line = rawLine.trim();
      if (!line || line.startsWith("#") || !line.includes("=")) continue;
      const separator = line.indexOf("=");
      const key = line.slice(0, separator).trim();
      const value = line
        .slice(separator + 1)
        .trim()
        .replace(/^['"]|['"]$/g, "");
      if (key) env[key] = value;
    }
    return env;
  } catch {
    return {};
  }
}

function rejectPendingRequests(error) {
  for (const { reject } of pendingRequests.values()) {
    reject(error);
  }
  pendingRequests.clear();
}

function ensureWorker() {
  if (worker && !worker.killed) return worker;

  worker = spawn(
    PYTHON,
    [path.join(ASSEMBLED_DIR, "run.py"), "--worker"],
    {
      cwd: ASSEMBLED_DIR,
      env: {
        ...process.env,
        PYTHONUTF8: "1",
        PYTHONIOENCODING: "utf-8",
      },
      windowsHide: true,
      stdio: ["pipe", "pipe", "pipe"],
    }
  );
  workerBuffer = "";

  worker.stdout.on("data", (chunk) => {
    workerBuffer += chunk.toString();
    const lines = workerBuffer.split(/\r?\n/);
    workerBuffer = lines.pop() || "";

    for (const line of lines) {
      if (!line.trim()) continue;
      try {
        const response = JSON.parse(line);
        const pending = pendingRequests.get(response.id);
        if (!pending) continue;
        pendingRequests.delete(response.id);
        if (response.ok) {
          pending.resolve(response);
        } else {
          pending.reject(new Error(response.error || "运行生命周期失败。"));
        }
      } catch (error) {
        rejectPendingRequests(new Error(`解析生命周期响应失败：${error.message}`));
      }
    }
  });

  worker.stderr.on("data", (chunk) => {
    console.error(`[LangGraph worker] ${chunk.toString().trim()}`);
  });

  worker.on("error", (error) => {
    worker = null;
    rejectPendingRequests(error);
  });

  worker.on("exit", (code, signal) => {
    worker = null;
    if (code !== 0) {
      rejectPendingRequests(
        new Error(`LangGraph worker 已退出（code=${code}, signal=${signal || "none"}）。`)
      );
    }
  });

  return worker;
}

async function invokeCachedGraph(input) {
  const process = ensureWorker();
  const id = String(++requestSequence);

  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      pendingRequests.delete(id);
      reject(new Error("运行生命周期超时。"));
    }, 120000);

    pendingRequests.set(id, {
      resolve: (response) => {
        clearTimeout(timeout);
        resolve(response);
      },
      reject: (error) => {
        clearTimeout(timeout);
        reject(error);
      },
    });

    process.stdin.write(`${JSON.stringify({ id, input })}\n`, (error) => {
      if (!error) return;
      clearTimeout(timeout);
      pendingRequests.delete(id);
      reject(error);
    });
  });
}

export async function POST(request) {
  try {
    const body = await request.json();
    const input = String(body?.input || "").trim();
    if (!input) {
      return NextResponse.json({ error: "请输入要发送的内容。" }, { status: 400 });
    }

    const lifecycle = await readCurrentLifecycle();
    const validationErrors = validateLifecycle(lifecycle);
    if (validationErrors.length) {
      return NextResponse.json(
        {
          error: `当前编排无法运行：\n${validationErrors.join("\n")}`,
          validationErrors,
        },
        { status: 400 }
      );
    }

    const projectEnv = await loadProjectEnv();
    Object.assign(process.env, projectEnv);
    const result = await invokeCachedGraph(input);

    return NextResponse.json({
      ok: true,
      answer: result.answer || "生命周期没有返回内容。",
    });
  } catch (error) {
    const detail = error?.stderr?.trim() || error?.message || "运行生命周期失败。";
    return NextResponse.json({ error: detail }, { status: 500 });
  }
}

export async function PUT() {
  try {
    const lifecycle = await readCurrentLifecycle();
    const validationErrors = validateLifecycle(lifecycle);
    if (validationErrors.length) {
      return NextResponse.json(
        {
          error: `当前编排无法运行：\n${validationErrors.join("\n")}`,
          validationErrors,
        },
        { status: 400 }
      );
    }

    stopWorker();
    const packagePath = await assembleCurrentGraph();
    return NextResponse.json({
      ok: true,
      refreshed: true,
      packagePath: packagePath || ASSEMBLED_DIR,
      lifecycleFile: LIFECYCLE_FILE,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error.message || "重新装配当前生命周期失败。" },
      { status: 500 }
    );
  }
}
