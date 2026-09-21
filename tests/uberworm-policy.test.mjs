import test from "node:test";
import assert from "node:assert/strict";
import {
  UBERWORM_PROTOCOL,
  UBERWORM_NODE,
  UBERWORM_ACTIONS,
  UBERWORM_APPROVED_MODELS,
  validateUberWormCommand
} from "../src/uberworm-policy.mjs";

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
  assert.deepEqual(UBERWORM_APPROVED_MODELS, ["qwen3:0.6b","qwen3:1.7b","qwen3:4b"]);
});
