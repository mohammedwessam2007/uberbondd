export const UBERWORM_PROTOCOL = "uberbond.uberworm.command.v1";
export const UBERWORM_NODE = "hp-local";
export const UBERWORM_TRUSTED_OWNER = "mohammedwessam2007";
export const UBERWORM_APPROVED_MODELS = Object.freeze(["qwen3:0.6b","qwen3:1.7b","qwen3:4b"]);
export const UBERWORM_ACTIONS = Object.freeze({
  ping: { class: "read", maxSeconds: 5 },
  inventory: { class: "read", maxSeconds: 120 },
  ollama_status: { class: "read", maxSeconds: 15 },
  install_ollama: { class: "bounded-write", maxSeconds: 1800 },
  self_update_agent: { class: "bounded-write", maxSeconds: 180 },
  repo_status: { class: "read", maxSeconds: 30 },
  repo_sync_main: { class: "bounded-write", maxSeconds: 120 },
  pull_model: { class: "bounded-write", maxSeconds: 3600 },
  benchmark: { class: "compute", maxSeconds: 3600 },
  local_prompt: { class: "compute", maxSeconds: 600 },
  disable_agent: { class: "control", maxSeconds: 5 }
});

export function validateUberWormCommand(command, now = new Date()) {
  const reasons=[];
  if (!command || typeof command !== "object") reasons.push("object-command-required");
  const id=String(command?.id||"").trim();
  const action=String(command?.action||"").trim();
  const node=String(command?.node||"").trim();
  const protocol=String(command?.protocol||"").trim();
  const expires=Date.parse(String(command?.expiresAt||""));
  if (!/^[A-Za-z0-9._:-]{8,120}$/.test(id)) reasons.push("valid-command-id-required");
  if (!Object.hasOwn(UBERWORM_ACTIONS,action)) reasons.push("action-not-allowlisted");
  if (node!==UBERWORM_NODE) reasons.push("wrong-node");
  if (protocol!==UBERWORM_PROTOCOL) reasons.push("wrong-protocol");
  if (!Number.isFinite(expires)) reasons.push("valid-expiry-required");
  else if (expires < now.getTime()) reasons.push("command-expired");
  else if (expires > now.getTime()+6*60*60*1000) reasons.push("expiry-too-far");
  return { ok: reasons.length===0, reasonCodes: reasons, id, action };
}

// The node-scoped queue returns { id, action, args, expires_at }. The channel
// itself is authenticated per node, so node and protocol are implied by it; the
// rest of the contract (allowlist, id shape, six-hour expiry, approved models)
// is enforced here on the laptop before anything runs, not only on the server.
const MODEL_ACTIONS = new Set(["pull_model", "benchmark", "local_prompt"]);

export function admitUberWormQueuedCommand(queued, now = new Date()) {
  const command = {
    protocol: UBERWORM_PROTOCOL,
    node: UBERWORM_NODE,
    id: queued?.id,
    action: queued?.action,
    expiresAt: queued?.expires_at ?? queued?.expiresAt
  };
  const verdict = validateUberWormCommand(command, now);
  const reasons = [...verdict.reasonCodes];
  const args = queued?.args && typeof queued.args === "object" && !Array.isArray(queued.args) ? queued.args : {};
  if (MODEL_ACTIONS.has(verdict.action) && !UBERWORM_APPROVED_MODELS.includes(String(args.model || "").trim())) reasons.push("model-not-approved");
  return { ok: reasons.length === 0, reasonCodes: reasons, id: verdict.id, action: verdict.action, args };
}
