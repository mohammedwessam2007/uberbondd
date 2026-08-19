import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import { readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
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
  for (const tool of ["uberbond_get_state", "uberbond_read_relay_contract", "uberbond_prepare_task", "uberbond_relay_poll", "uberbond_relay_claim", "uberbond_relay_heartbeat", "uberbond_relay_submit", "uberbond_run_verification"]) assert.match(source, new RegExp(tool));
  for (const suite of ["check:syntax", "test:deterministic", "check"]) assert.match(source, new RegExp(suite));
  for (const forbidden of ["deploy", "push", "merge", "credential change", "production mutation"]) assert.match(source, new RegExp(forbidden));
  assert.match(docs, /Approve the trusted project-scoped MCP server/);
  assert.doesNotMatch(source, /ANTHROPIC_API_KEY|CLAUDE_API_KEY/);
});

function startBridge(envOverrides = {}) {
  const child = spawn("node", [bridgeScript], {
    cwd: projectRoot,
    stdio: ["pipe", "pipe", "pipe"],
    env: {
      ...process.env,
      UBERBOND_AGENT_RELAY_ENABLED: "false", UBERBOND_AGENT_RELAY_URL: "", UBERBOND_AGENT_RELAY_TOKEN: "",
      ...envOverrides
    },
  });
  const lines = createInterface({ input: child.stdout, crlfDelay: Infinity });
  const pending = new Map();
  let nextId = 1;
  let stdout = "";
  let stderr = "";
  child.stdout.on("data", (chunk) => { stdout += chunk; });
  child.stderr.on("data", (chunk) => { stderr += chunk; });
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
  return { request, raw, stop, capturedOutput: () => `${stdout}\n${stderr}` };
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
          "credentials",
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

test("hostile: cloud relay tools fail closed when not configured", async () => {
  const bridge = startBridge();
  try {
    await bridge.request("initialize", {});
    const response = await bridge.request("tools/call", { name: "uberbond_relay_poll", arguments: {} });
    assert.ok(response.error, "expected the disabled relay to fail closed");
    assert.match(response.error.message, /cloud relay disabled or not configured/);
  } finally {
    bridge.stop();
  }
});

test("hostile: cloud relay refuses to send a bearer token over non-loopback HTTP", async () => {
  const bridge = startBridge({
    UBERBOND_AGENT_RELAY_ENABLED: "true",
    UBERBOND_AGENT_RELAY_URL: "http://example.com",
    UBERBOND_AGENT_RELAY_TOKEN: "fixture-token-never-sent",
  });
  try {
    await bridge.request("initialize", {});
    const response = await bridge.request("tools/call", { name: "uberbond_relay_poll", arguments: {} });
    assert.ok(response.error, "expected insecure relay transport to fail closed");
    assert.match(response.error.message, /must use https except for loopback/);
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

// End-to-end proof: a real local HTTP server (server.mjs, JSON store) and a
// real local MCP process (scripts/uberbond-mcp.mjs) driven over actual stdio
// JSON-RPC, wired together through the real HTTP relay -- not mocked at any
// layer. Exercises the exact sequence the mission's Wave 4/8 require: init,
// tool list, disabled-fails-closed (covered above), enabled poll, claim, a
// heartbeat implied by the lease, submit, replay rejection, and a scan of
// every byte the bridge process wrote to stdout/stderr for the raw relay
// token.
test("end-to-end: real MCP process polls, claims, and submits through a real local HTTP relay; a replay is rejected; the token never appears in bridge output", async () => {
  const relayToken = "e2e-test-relay-token-do-not-reuse";
  const port = 25000 + Math.floor(Math.random() * 4000);
  const dataDir = await fs.mkdtemp(path.join(os.tmpdir(), "uberbond-mcp-e2e-"));
  const web = spawn(process.execPath, ["server.mjs"], {
    cwd: projectRoot,
    env: {
      ...process.env,
      PORT: String(port),
      APP_BASE_URL: `http://127.0.0.1:${port}`,
      PROCESS_ROLE: "web",
      STORE_BACKEND: "json",
      DATA_DIR: dataDir,
      SCREENSHOT_DIR: path.join(dataDir, "screenshots"),
      ADMIN_TOKEN: "e2e-admin-token",
      TOKEN_ENCRYPTION_KEY: "a".repeat(64),
      AGENT_RELAY_ENABLED: "true",
      UBERBOND_AGENT_RELAY_TOKEN: relayToken,
      ALLOW_LOCAL_FIXTURES: "true"
    },
    stdio: ["ignore", "pipe", "pipe"]
  });
  let webLogs = "";
  web.stdout.on("data", (chunk) => { webLogs += chunk; });
  web.stderr.on("data", (chunk) => { webLogs += chunk; });
  const bridge = startBridge({
    UBERBOND_AGENT_RELAY_ENABLED: "true",
    UBERBOND_AGENT_RELAY_URL: `http://127.0.0.1:${port}`,
    UBERBOND_AGENT_RELAY_TOKEN: relayToken
  });
  try {
    for (let attempt = 0; attempt < 100; attempt += 1) {
      try {
        const health = await fetch(`http://127.0.0.1:${port}/api/health`);
        if (health.ok) break;
      } catch {}
      await new Promise((resolveWait) => setTimeout(resolveWait, 100));
    }

    const initResponse = await bridge.request("initialize", {});
    assert.ok(initResponse.result, `bridge failed to initialize: ${JSON.stringify(initResponse)} logs=${webLogs}`);

    const toolList = await bridge.request("tools/list", {});
    const toolNames = toolList.result.tools.map((tool) => tool.name);
    assert.ok(toolNames.includes("uberbond_relay_poll"));
    assert.ok(toolNames.includes("uberbond_relay_claim"));
    assert.ok(toolNames.includes("uberbond_relay_submit"));

    // The producer side (ChatGPT / an approved worker) creates the task over
    // the same authenticated HTTP relay -- the MCP bridge exposes no "create"
    // tool by design (Claude Code only consumes, never originates, relay tasks).
    const created = await fetch(`http://127.0.0.1:${port}/api/agent-relay/tasks`, {
      method: "POST",
      headers: { authorization: `Bearer ${relayToken}`, "content-type": "application/json" },
      body: JSON.stringify({
        taskId: `e2e-task-${Date.now()}`,
        objective: "End-to-end MCP relay proof: inspect repository state",
        originAgent: "chatgpt",
        targetAgent: "claude-code",
        requiredOutputs: ["outcome"],
        acceptanceTests: ["e2e proof completes"],
        evidenceRefs: ["test:e2e"],
        consequenceClass: "LOCAL_PREPARATION"
      })
    }).then((response) => response.json());
    assert.equal(created.status, "QUEUED", `task creation failed: ${JSON.stringify(created)}`);

    const pollResponse = await bridge.request("tools/call", { name: "uberbond_relay_poll", arguments: {} });
    assert.ok(!pollResponse.error, pollResponse.error?.message);
    const polled = JSON.parse(pollResponse.result.content[0].text);
    assert.equal(polled.count, 1, `expected exactly one queued task visible to the poll: ${JSON.stringify(polled)}`);
    assert.equal(polled.tasks[0].taskId, created.taskId);

    const claimResponse = await bridge.request("tools/call", {
      name: "uberbond_relay_claim",
      arguments: { workerId: "claude-code:e2e-test" }
    });
    assert.ok(!claimResponse.error, claimResponse.error?.message);
    const claimed = JSON.parse(claimResponse.result.content[0].text);
    assert.equal(claimed.status, "CLAIMED");
    assert.equal(claimed.taskId, created.taskId);
    assert.ok(claimed.lease?.lockedAt, "claim did not establish a lease");

    // A real heartbeat, over the real relay, extends the same lease claim
    // established -- proving item 6 of the mission's Wave 4 checklist for
    // real (not implied by claim alone).
    await new Promise((resolveWait) => setTimeout(resolveWait, 20));
    const heartbeatResponse = await bridge.request("tools/call", {
      name: "uberbond_relay_heartbeat",
      arguments: { taskId: claimed.taskId, workerId: "claude-code:e2e-test" }
    });
    assert.ok(!heartbeatResponse.error, heartbeatResponse.error?.message);
    const heartbeat = JSON.parse(heartbeatResponse.result.content[0].text);
    assert.equal(heartbeat.status, "HEARTBEAT_ACCEPTED");
    assert.ok(
      Date.parse(heartbeat.lease.heartbeatAt) > Date.parse(claimed.lease.heartbeatAt),
      `heartbeat did not advance heartbeatAt: claim=${claimed.lease.heartbeatAt} heartbeat=${heartbeat.lease.heartbeatAt}`
    );
    // A different worker id must not be able to extend this worker's lease.
    const wrongWorkerHeartbeat = await bridge.request("tools/call", {
      name: "uberbond_relay_heartbeat",
      arguments: { taskId: claimed.taskId, workerId: "claude-code:some-other-worker" }
    });
    assert.ok(wrongWorkerHeartbeat.error, "expected a non-owner heartbeat to be rejected");

    const submitResponse = await bridge.request("tools/call", {
      name: "uberbond_relay_submit",
      arguments: {
        taskId: claimed.taskId,
        workerId: "claude-code:e2e-test",
        status: "completed",
        result: {
          outcome: "Inspected repository state for the e2e proof.",
          changedArtifacts: [],
          testsActuallyRun: [{ command: "node --test tests/claude-mcp.test.mjs", result: "PASS" }],
          truthTable: { relay: "PASS_LOCAL" },
          externalEffectLedger: {
            providerCalls: 0, messages: 0, purchases: 0, deployments: 0,
            credentialChanges: 0, dnsChanges: 0, productionMutations: 0, spendCents: 0
          },
          decision: "PROCEED"
        },
        receipt: { note: "e2e proof receipt" }
      }
    });
    assert.ok(!submitResponse.error, submitResponse.error?.message);
    const submitted = JSON.parse(submitResponse.result.content[0].text);
    assert.equal(submitted.status, "RECEIVED");

    // A second submit for the same (now-completed) task must be rejected --
    // this is real replay protection over the real HTTP relay, not asserted
    // from the module test alone.
    const replayResponse = await bridge.request("tools/call", {
      name: "uberbond_relay_submit",
      arguments: {
        taskId: claimed.taskId,
        workerId: "claude-code:e2e-test",
        status: "completed",
        result: {
          outcome: "replay attempt",
          changedArtifacts: [],
          testsActuallyRun: [],
          truthTable: {},
          externalEffectLedger: {
            providerCalls: 0, messages: 0, purchases: 0, deployments: 0,
            credentialChanges: 0, dnsChanges: 0, productionMutations: 0, spendCents: 0
          },
          decision: "PROCEED"
        }
      }
    });
    assert.ok(replayResponse.error, "expected the replay submission to be rejected");

    const bridgeOutput = bridge.capturedOutput();
    assert.doesNotMatch(bridgeOutput, new RegExp(relayToken), "the raw relay token must never appear in bridge stdout/stderr");
  } finally {
    bridge.stop();
    web.kill("SIGTERM");
    await new Promise((resolveWait) => setTimeout(resolveWait, 300));
    await fs.rm(dataDir, { recursive: true, force: true }).catch(() => {});
  }
});
