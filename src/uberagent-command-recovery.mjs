import crypto from "node:crypto";
import { UBERWORM_ACTIONS } from "./uberworm-policy.mjs";

export const UBERAGENT_COMMAND_RECOVERY_VERSION = "uberbond.uberagent.command-recovery.v1";
export const UBERAGENT_RECOVERY_DECISIONS = Object.freeze([
  "ELIGIBLE_TO_CLAIM",
  "WAIT_FOR_CURRENT_CLAIM",
  "SAFE_TO_RECLAIM",
  "RECONCILE_REQUIRED",
  "TERMINAL_NO_EXECUTE",
  "EXPIRED_NO_EXECUTE",
  "INVALID_QUARANTINE"
]);

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])]));
  }
  return value;
}

export function uberAgentCommandDigest(command) {
  const envelope = {
    id: String(command?.id || ""),
    nodeId: String(command?.nodeId || command?.node || ""),
    action: String(command?.action || ""),
    args: canonical(command?.args && typeof command.args === "object" ? command.args : {}),
    expiresAt: String(command?.expiresAt || command?.expires_at || "")
  };
  return crypto.createHash("sha256").update(JSON.stringify(envelope)).digest("hex");
}

export function assessUberAgentCommandRecovery({
  command,
  receipt = null,
  now = new Date(),
  leaseExpiresAt = null
} = {}) {
  const action = String(command?.action || "");
  const policy = UBERWORM_ACTIONS[action];
  const status = String(command?.status || "");
  const nowMs = now instanceof Date ? now.getTime() : Date.parse(String(now));
  const expiresMs = Date.parse(String(command?.expiresAt || command?.expires_at || ""));
  const leaseMs = leaseExpiresAt == null
    ? Number.NaN
    : (leaseExpiresAt instanceof Date ? leaseExpiresAt.getTime() : Date.parse(String(leaseExpiresAt)));

  const base = {
    policyVersion: UBERAGENT_COMMAND_RECOVERY_VERSION,
    commandId: String(command?.id || ""),
    action,
    status,
    commandDigest: uberAgentCommandDigest(command),
    recoveryMode: policy?.recovery || null
  };

  if (!Number.isFinite(nowMs) || !policy || !base.commandId) {
    return { ...base, decision: "INVALID_QUARANTINE", reason: "invalid-command-or-action" };
  }

  if (receipt && typeof receipt === "object") {
    return { ...base, decision: "TERMINAL_NO_EXECUTE", reason: "durable-receipt-already-exists" };
  }

  if (["done", "failed", "cancelled", "expired"].includes(status)) {
    return { ...base, decision: "TERMINAL_NO_EXECUTE", reason: "command-already-terminal" };
  }

  if (Number.isFinite(expiresMs) && expiresMs <= nowMs) {
    return { ...base, decision: "EXPIRED_NO_EXECUTE", reason: "command-expired" };
  }

  if (status === "pending") {
    return { ...base, decision: "ELIGIBLE_TO_CLAIM", reason: "unclaimed-pending-command" };
  }

  if (status !== "running") {
    return { ...base, decision: "INVALID_QUARANTINE", reason: "unknown-command-status" };
  }

  if (!Number.isFinite(Date.parse(String(command?.claimedAt || command?.claimed_at || "")))) {
    return { ...base, decision: "INVALID_QUARANTINE", reason: "running-command-missing-claim-time" };
  }

  if (!Number.isFinite(leaseMs)) {
    return { ...base, decision: "RECONCILE_REQUIRED", reason: "running-command-has-no-durable-lease" };
  }

  if (leaseMs > nowMs) {
    return { ...base, decision: "WAIT_FOR_CURRENT_CLAIM", reason: "claim-lease-still-active" };
  }

  if (policy.recovery === "SAFE_RETRY") {
    return { ...base, decision: "SAFE_TO_RECLAIM", reason: "expired-lease-read-only-command" };
  }

  return { ...base, decision: "RECONCILE_REQUIRED", reason: "expired-lease-effect-or-cost-may-have-occurred" };
}
