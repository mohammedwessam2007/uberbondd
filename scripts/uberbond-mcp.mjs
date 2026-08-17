#!/usr/bin/env node

import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createInterface } from "node:readline";

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(process.env.CLAUDE_PROJECT_DIR || join(scriptDirectory, ".."));
const protocolVersion = "2024-11-05";

const tools = [
  {
    name: "uberbond_get_state",
    description: "Read safe, non-secret UberBond checkout state and current safety boundaries.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "uberbond_read_relay_contract",
    description: "Read UberBond's explicit Claude relay contract and return obligations.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "uberbond_prepare_task",
    description: "Turn a bounded repair or review request into a structured UberBond task packet without executing it.",
    inputSchema: {
      type: "object",
      properties: {
        objective: { type: "string", minLength: 1, maxLength: 500 },
        files: { type: "array", items: { type: "string", maxLength: 240 }, maxItems: 20 },
        acceptance: { type: "array", items: { type: "string", maxLength: 300 }, maxItems: 12 },
      },
      required: ["objective"],
      additionalProperties: false,
    },
  },
  {
    name: "uberbond_run_verification",
    description: "Run only an allowlisted local UberBond verification suite; no network, deployment, push, merge, or production action is exposed.",
    inputSchema: {
      type: "object",
      properties: { suite: { type: "string", enum: ["syntax", "deterministic", "check", "all"] } },
      required: ["suite"],
      additionalProperties: false,
    },
  },
];

function reply(id, result) {
  process.stdout.write(`${JSON.stringify({ jsonrpc: "2.0", id, result })}\n`);
}

function failure(id, code, message) {
  process.stdout.write(`${JSON.stringify({ jsonrpc: "2.0", id, error: { code, message } })}\n`);
}

function textResult(value) {
  return { content: [{ type: "text", text: typeof value === "string" ? value : JSON.stringify(value, null, 2) }] };
}

async function command(commandName, args, extraEnv = {}) {
  return new Promise((resolveCommand, rejectCommand) => {
    execFile(commandName, args, { cwd: projectRoot, env: { ...process.env, ...extraEnv }, timeout: 180_000, maxBuffer: 2_000_000 }, (error, stdout, stderr) => {
      if (error) {
        const detail = [stderr.trim(), stdout.trim(), error.message].filter(Boolean).join("\n");
        rejectCommand(new Error(detail.slice(0, 12_000)));
        return;
      }
      resolveCommand({ stdout, stderr });
    });
  });
}

function safeRelativeFiles(files) {
  return (Array.isArray(files) ? files : []).filter((file) => {
    if (typeof file !== "string" || !file.trim() || isAbsolute(file)) return false;
    const normalized = resolve(projectRoot, file);
    const relativePath = relative(projectRoot, normalized).replaceAll("\\", "/");
    const sensitive = relativePath === ".env" || relativePath.startsWith(".env.") || relativePath === "lite" || relativePath.startsWith("lite/") || relativePath.startsWith("credentials/");
    return relativePath && !relativePath.startsWith("..") && !file.includes("node_modules") && !sensitive;
  }).slice(0, 20);
}

async function callTool(name, args) {
  if (name === "uberbond_get_state") {
    const [branch, status] = await Promise.all([
      command("git", ["branch", "--show-current"]),
      command("git", ["status", "--short"]),
    ]);
    return textResult({
      provider: "uberbond",
      bridge: { transport: "stdio-mcp", connected: true, externalCalls: 0, spendCents: 0, outboundEnabled: false },
      projectRoot,
      branch: branch.stdout.trim(),
      worktree: status.stdout.trim().split("\n").filter(Boolean),
      protectedPaths: ["lite/", ".env", ".env.*", "credentials", "production secrets"],
      forbiddenActions: ["send", "purchase", "deploy", "push", "merge", "credential change", "DNS change", "production mutation"],
    });
  }

  if (name === "uberbond_read_relay_contract") {
    return textResult(await readFile(join(projectRoot, "docs", "CLAUDE_AGENT_RELAY.md"), "utf8"));
  }

  if (name === "uberbond_prepare_task") {
    const objective = typeof args?.objective === "string" ? args.objective.trim().slice(0, 500) : "";
    if (!objective) throw new Error("objective is required");
    return textResult({
      taskType: "claude-review-or-repair",
      objective,
      files: safeRelativeFiles(args?.files),
      acceptance: (Array.isArray(args?.acceptance) ? args.acceptance : []).filter((item) => typeof item === "string").slice(0, 12),
      authority: "local owner only",
      execution: "Claude may inspect and prepare local changes; external effects remain disabled.",
      requiredReceipt: ["outcome", "changedArtifacts", "testsActuallyRun", "truthTable", "externalEffectLedger", "risks", "decision"],
    });
  }

  if (name === "uberbond_run_verification") {
    const suite = args?.suite;
    const suites = {
      syntax: ["npm", ["run", "check:syntax"]],
      deterministic: ["npm", ["run", "test:deterministic"]],
      check: ["npm", ["run", "check"]],
    };
    if (suite === "all") {
      const results = [];
      for (const name of ["syntax", "deterministic", "check"]) {
        const [binary, argsForCommand] = suites[name];
        const result = await command(binary, argsForCommand, { NODE_ENV: "test" });
        results.push({ suite: name, status: "passed", output: `${result.stdout}${result.stderr}`.slice(-4_000) });
      }
      return textResult({ projectRoot, results, externalCalls: 0, spendCents: 0 });
    }
    if (!Object.hasOwn(suites, suite)) throw new Error("suite must be one of syntax, deterministic, check, all");
    const [binary, argsForCommand] = suites[suite];
    const result = await command(binary, argsForCommand, { NODE_ENV: "test" });
    return textResult({ projectRoot, suite, status: "passed", output: `${result.stdout}${result.stderr}`.slice(-8_000), externalCalls: 0, spendCents: 0 });
  }

  throw new Error(`Unknown UberBond tool: ${name}`);
}

async function handle(message) {
  if (!message || typeof message !== "object" || message.jsonrpc !== "2.0") return;
  if (message.method === "notifications/initialized") return;
  if (message.method === "ping") { reply(message.id, {}); return; }
  if (message.method === "initialize") {
    reply(message.id, { protocolVersion, capabilities: { tools: { listChanged: false } }, serverInfo: { name: "uberbond", version: "0.1.0" } });
    return;
  }
  if (message.method === "tools/list") { reply(message.id, { tools }); return; }
  if (message.method === "tools/call") {
    try {
      const name = message.params?.name;
      if (typeof name !== "string") throw new Error("tool name is required");
      reply(message.id, await callTool(name, message.params?.arguments ?? {}));
    } catch (error) {
      failure(message.id, -32000, error instanceof Error ? error.message : "UberBond MCP tool failed");
    }
    return;
  }
  if (message.id !== undefined) failure(message.id, -32601, `Unsupported MCP method: ${String(message.method)}`);
}

const input = createInterface({ input: process.stdin, crlfDelay: Infinity });
for await (const line of input) {
  if (!line.trim()) continue;
  try { await handle(JSON.parse(line)); } catch (error) { failure(null, -32700, error instanceof Error ? error.message : "Invalid JSON"); }
}
