import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import { createInterface } from "node:readline";
import test from "node:test";
import { fileURLToPath } from "node:url";

const projectRoot = fileURLToPath(new URL("..", import.meta.url));
const bridgeScript = fileURLToPath(new URL("../scripts/uberbond-mcp.mjs", import.meta.url));

test("UberBond exposes a project-scoped no-secret Claude MCP bridge", async () => {
  const config = JSON.parse(await readFile(new URL("../.mcp.json", import.meta.url), "utf8"));
  const server = config.mcpServers.uberbond;
  assert.equal(server.type, "stdio");
  assert.equal(server.command, "node");
  assert.match(server.args[0], /CLAUDE_PROJECT_DIR/);

  const source = await readFile(new URL("../scripts/uberbond-mcp.mjs", import.meta.url), "utf8");
  const docs = await readFile(new URL("../docs/CLAUDE_UBERBOND_MCP.md", import.meta.url), "utf8");
  for (const tool of ["uberbond_get_state", "uberbond_read_relay_contract", "uberbond_prepare_task", "uberbond_run_verification"]) assert.match(source, new RegExp(tool));
  for (const suite of ["check:syntax", "test:deterministic", "check"]) assert.match(source, new RegExp(suite));
  for (const forbidden of ["deploy", "push", "merge", "credential change", "production mutation"]) assert.match(source, new RegExp(forbidden));
  assert.match(docs, /Approve the trusted project-scoped MCP server/);
  assert.doesNotMatch(source, /ANTHROPIC_API_KEY|CLAUDE_API_KEY/);
});

function startBridge() {
  const child = spawn("node", [bridgeScript], {
    cwd: projectRoot,
    stdio: ["pipe", "pipe", "pipe"],
  });
  const lines = createInterface({ input: child.stdout, crlfDelay: Infinity });
  const pending = new Map();
  let nextId = 1;
  lines.on("line", (line) => {
    if (!line.trim()) return;
    let message;
    try {
      message = JSON.parse(line);
    } catch {
      return;
    }
    const id = message.id ?? null;
    const waiter = pending.get(id);
    if (waiter) {
      pending.delete(id);
      waiter(message);
    }
  });
  function request(method, params) {
    const id = nextId++;
    const promise = new Promise((resolveRequest) => pending.set(id, resolveRequest));
    child.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", id, method, params })}\n`);
    return promise;
  }
  function raw(line) {
    child.stdin.write(`${line}\n`);
  }
  function stop() {
    lines.close();
    child.kill();
  }
  return { request, raw, stop };
}

test("hostile: uberbond_prepare_task rejects missing objective", async () => {
  const bridge = startBridge();
  try {
    await bridge.request("initialize", {});
    const response = await bridge.request("tools/call", { name: "uberbond_prepare_task", arguments: {} });
    assert.ok(response.error, "expected an error for a missing objective");
    assert.match(response.error.message, /objective is required/);
  } finally {
    bridge.stop();
  }
});

test("hostile: uberbond_prepare_task filters protected and traversal paths", async () => {
  const bridge = startBridge();
  try {
    await bridge.request("initialize", {});
    const response = await bridge.request("tools/call", {
      name: "uberbond_prepare_task",
      arguments: {
        objective: "review protected-path filtering",
        files: [
          ".env",
          ".env.production",
          "lite/lib/db.mjs",
          "lite",
          "credentials/keys.json",
          "../../etc/passwd",
          "/etc/passwd",
          "src/queue.mjs",
        ],
      },
    });
    assert.ok(!response.error, response.error?.message);
    const packet = JSON.parse(response.result.content[0].text);
    assert.deepEqual(packet.files, ["src/queue.mjs"]);
  } finally {
    bridge.stop();
  }
});

test("hostile: uberbond_run_verification rejects an unknown suite", async () => {
  const bridge = startBridge();
  try {
    await bridge.request("initialize", {});
    const response = await bridge.request("tools/call", { name: "uberbond_run_verification", arguments: { suite: "deploy-to-prod" } });
    assert.ok(response.error, "expected an error for an unknown suite");
    assert.match(response.error.message, /suite must be one of/);
  } finally {
    bridge.stop();
  }
});

test("hostile: unknown tool name and unsupported method return protocol errors", async () => {
  const bridge = startBridge();
  try {
    await bridge.request("initialize", {});
    const badTool = await bridge.request("tools/call", { name: "uberbond_delete_production", arguments: {} });
    assert.ok(badTool.error, "expected an error for an unknown tool");
    assert.match(badTool.error.message, /Unknown UberBond tool/);

    const badMethod = await bridge.request("prompts/list", {});
    assert.ok(badMethod.error, "expected an error for an unsupported method");
    assert.equal(badMethod.error.code, -32601);
  } finally {
    bridge.stop();
  }
});

test("hostile: malformed JSON-RPC input does not crash the bridge", async () => {
  const bridge = startBridge();
  try {
    const ready = await bridge.request("initialize", {});
    assert.ok(ready.result, "bridge failed to initialize before malformed input");
    bridge.raw("{not valid json");
    const response = await bridge.request("tools/list", {});
    assert.ok(Array.isArray(response.result.tools), "bridge should still answer requests after malformed input");
  } finally {
    bridge.stop();
  }
});
