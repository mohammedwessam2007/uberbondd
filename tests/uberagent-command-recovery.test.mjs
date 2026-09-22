import test from "node:test";
import assert from "node:assert/strict";
import { UBERWORM_ACTIONS } from "../src/uberworm-policy.mjs";
import {
  UBERAGENT_RECOVERY_DECISIONS,
  uberAgentCommandDigest,
  assessUberAgentCommandRecovery
} from "../src/uberagent-command-recovery.mjs";

const NOW = new Date("2026-09-22T04:00:00Z");
const command = (overrides = {}) => ({
  id: "cmd_12345678",
  nodeId: "hp-local",
  action: "inventory",
  args: { detail: true, nested: { b: 2, a: 1 } },
  status: "running",
  claimedAt: "2026-09-22T03:00:00Z",
  expiresAt: "2026-09-22T06:00:00Z",
  ...overrides
});

test("every UberAgent action declares an explicit recovery mode", () => {
  for (const [action, policy] of Object.entries(UBERWORM_ACTIONS)) {
    assert.ok(["SAFE_RETRY", "RECONCILE_REQUIRED"].includes(policy.recovery), action);
    if (policy.class === "read") assert.equal(policy.recovery, "SAFE_RETRY", action);
    else assert.equal(policy.recovery, "RECONCILE_REQUIRED", action);
  }
});

test("command digest is stable across object key order and changes when execution intent changes", () => {
  const a = command({ args: { z: 3, nested: { b: 2, a: 1 } } });
  const b = command({ args: { nested: { a: 1, b: 2 }, z: 3 } });
  const c = command({ args: { nested: { a: 1, b: 999 }, z: 3 } });
  assert.equal(uberAgentCommandDigest(a), uberAgentCommandDigest(b));
  assert.notEqual(uberAgentCommandDigest(a), uberAgentCommandDigest(c));
});

test("a durable receipt always fences execution", () => {
  const result = assessUberAgentCommandRecovery({
    command: command(),
    receipt: { ok: true },
    now: NOW,
    leaseExpiresAt: "2026-09-22T03:30:00Z"
  });
  assert.equal(result.decision, "TERMINAL_NO_EXECUTE");
  assert.equal(result.reason, "durable-receipt-already-exists");
});

test("terminal and expired commands never execute", () => {
  for (const status of ["done", "failed", "cancelled", "expired"]) {
    assert.equal(assessUberAgentCommandRecovery({ command: command({ status }), now: NOW }).decision, "TERMINAL_NO_EXECUTE");
  }
  assert.equal(
    assessUberAgentCommandRecovery({ command: command({ status: "pending", expiresAt: "2026-09-22T03:59:59Z" }), now: NOW }).decision,
    "EXPIRED_NO_EXECUTE"
  );
});

test("pending valid commands can be claimed", () => {
  const result = assessUberAgentCommandRecovery({ command: command({ status: "pending", claimedAt: null }), now: NOW });
  assert.equal(result.decision, "ELIGIBLE_TO_CLAIM");
});

test("running command without a durable lease becomes reconciliation-required", () => {
  const result = assessUberAgentCommandRecovery({ command: command(), now: NOW });
  assert.equal(result.decision, "RECONCILE_REQUIRED");
  assert.equal(result.reason, "running-command-has-no-durable-lease");
});

test("active claim lease is never stolen", () => {
  const result = assessUberAgentCommandRecovery({
    command: command(),
    now: NOW,
    leaseExpiresAt: "2026-09-22T04:05:00Z"
  });
  assert.equal(result.decision, "WAIT_FOR_CURRENT_CLAIM");
});

test("expired read-only lease is safe to reclaim", () => {
  const result = assessUberAgentCommandRecovery({
    command: command({ action: "inventory" }),
    now: NOW,
    leaseExpiresAt: "2026-09-22T03:59:00Z"
  });
  assert.equal(result.decision, "SAFE_TO_RECLAIM");
});

test("expired write, compute and control leases fail closed into reconciliation", () => {
  for (const action of ["install_ollama", "self_update_agent", "repo_sync_main", "pull_model", "benchmark", "local_prompt", "disable_agent"]) {
    const result = assessUberAgentCommandRecovery({
      command: command({ action }),
      now: NOW,
      leaseExpiresAt: "2026-09-22T03:59:00Z"
    });
    assert.equal(result.decision, "RECONCILE_REQUIRED", action);
  }
});

test("unknown actions and malformed running state are quarantined", () => {
  assert.equal(
    assessUberAgentCommandRecovery({ command: command({ action: "shell" }), now: NOW }).decision,
    "INVALID_QUARANTINE"
  );
  assert.equal(
    assessUberAgentCommandRecovery({
      command: command({ claimedAt: null }),
      now: NOW,
      leaseExpiresAt: "2026-09-22T03:59:00Z"
    }).decision,
    "INVALID_QUARANTINE"
  );
});

test("decision vocabulary is closed", () => {
  assert.deepEqual(UBERAGENT_RECOVERY_DECISIONS, [
    "ELIGIBLE_TO_CLAIM",
    "WAIT_FOR_CURRENT_CLAIM",
    "SAFE_TO_RECLAIM",
    "RECONCILE_REQUIRED",
    "TERMINAL_NO_EXECUTE",
    "EXPIRED_NO_EXECUTE",
    "INVALID_QUARANTINE"
  ]);
});
