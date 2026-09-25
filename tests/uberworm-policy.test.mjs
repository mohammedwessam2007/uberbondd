import test from "node:test";
import assert from "node:assert/strict";
import {
  UBERWORM_PROTOCOL,
  UBERWORM_NODE,
  UBERWORM_ACTIONS,
  UBERWORM_APPROVED_MODELS,
  validateUberWormCommand,
  admitUberWormQueuedCommand
} from "../src/uberworm-policy.mjs";
import { readFileSync } from "node:fs";

test("UberWorm accepts only typed short-lived allow-listed commands for the intended node", () => {
  const now = new Date("2026-09-22T00:00:00Z");
  const good = validateUberWormCommand({
    protocol: UBERWORM_PROTOCOL,
    node: UBERWORM_NODE,
    id: "cmd_12345678",
    action: "benchmark",
    expiresAt: "2026-09-22T00:30:00Z"
  }, now);
  assert.equal(good.ok, true);

  const shell = validateUberWormCommand({
    protocol: UBERWORM_PROTOCOL,
    node: UBERWORM_NODE,
    id: "cmd_abcdefgh",
    action: "shell",
    expiresAt: "2026-09-22T00:30:00Z"
  }, now);
  assert.equal(shell.ok, false);
  assert.ok(shell.reasonCodes.includes("action-not-allowlisted"));
});

test("UberWorm rejects expired, far-future and wrong-node commands", () => {
  const now = new Date("2026-09-22T00:00:00Z");
  for (const [command, reason] of [
    [{ protocol:UBERWORM_PROTOCOL,node:UBERWORM_NODE,id:"cmd_expired1",action:"ping",expiresAt:"2026-09-21T23:59:00Z" }, "command-expired"],
    [{ protocol:UBERWORM_PROTOCOL,node:UBERWORM_NODE,id:"cmd_future12",action:"ping",expiresAt:"2026-09-22T12:00:00Z" }, "expiry-too-far"],
    [{ protocol:UBERWORM_PROTOCOL,node:"someone-else",id:"cmd_wrongnode",action:"ping",expiresAt:"2026-09-22T00:10:00Z" }, "wrong-node"]
  ]) {
    const result=validateUberWormCommand(command, now);
    assert.equal(result.ok, false);
    assert.ok(result.reasonCodes.includes(reason));
  }
});

test("remote capability surface contains no arbitrary shell action", () => {
  assert.equal(Object.hasOwn(UBERWORM_ACTIONS, "shell"), false);
  assert.equal(Object.hasOwn(UBERWORM_ACTIONS, "powershell"), false);
  assert.equal(Object.hasOwn(UBERWORM_ACTIONS, "cmd"), false);
  assert.equal(Object.hasOwn(UBERWORM_ACTIONS, "install_ollama"), true);
  assert.equal(Object.hasOwn(UBERWORM_ACTIONS, "self_update_agent"), true);
  assert.deepEqual(UBERWORM_APPROVED_MODELS, ["qwen3:0.6b","qwen3:1.7b","qwen3:4b"]);
});

test("the laptop admits a queued command only inside the documented contract", () => {
  const now = new Date("2026-09-22T00:00:00Z");
  const queued = (overrides = {}) => ({ id: "3f2c9a1e-0000-4000-8000-000000000001", action: "ping", args: {}, expires_at: "2026-09-22T01:00:00Z", ...overrides });
  assert.equal(admitUberWormQueuedCommand(queued(), now).ok, true);
  assert.equal(admitUberWormQueuedCommand(queued({ action: "benchmark", args: { model: "qwen3:1.7b" } }), now).ok, true);
  for (const [overrides, reason] of [
    [{ action: "shell" }, "action-not-allowlisted"],
    [{ expires_at: "2026-09-21T23:00:00Z" }, "command-expired"],
    [{ expires_at: "2026-09-23T00:00:00Z" }, "expiry-too-far"],
    [{ expires_at: undefined }, "valid-expiry-required"],
    [{ id: "x" }, "valid-command-id-required"],
    [{ action: "pull_model", args: { model: "llama3:70b" } }, "model-not-approved"],
    [{ action: "local_prompt", args: {} }, "model-not-approved"]
  ]) {
    const verdict = admitUberWormQueuedCommand(queued(overrides), now);
    assert.equal(verdict.ok, false, reason);
    assert.ok(verdict.reasonCodes.includes(reason), reason);
  }
});

test("the laptop agent refuses a command before it executes anything", () => {
  const agent = readFileSync(new URL("../scripts/uberworm-agent-v2.mjs", import.meta.url), "utf8");
  assert.match(agent, /from "\.\.\/src\/uberworm-policy\.mjs"/);
  const cycle = agent.slice(agent.indexOf("async function cycle()"));
  const admit = cycle.indexOf("admitUberWormQueuedCommand(command");
  const run = cycle.indexOf("execute(command)");
  assert.ok(admit > 0 && run > admit, "admission must precede execution");
  assert.match(cycle.slice(admit, run), /if \(!admission\.ok\)[\s\S]*return true;/);
});
