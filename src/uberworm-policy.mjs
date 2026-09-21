export const UBERWORM_PROTOCOL = "uberbond.uberworm.command.v1";
export const UBERWORM_NODE = "hp-local";
export const UBERWORM_TRUSTED_OWNER = "mohammedwessam2007";
export const UBERWORM_APPROVED_MODELS = Object.freeze(["qwen3:0.6b","qwen3:1.7b","qwen3:4b"]);
export const UBERWORM_ACTIONS = Object.freeze({
  ping: { class: "read", maxSeconds: 5 },
  inventory: { class: "read", maxSeconds: 120 },
  ollama_status: { class: "read", maxSeconds: 15 },
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
