// Assembles the input agent-mesh-activation-gate needs, from two sources that
// must not be mixed up.
//
// The gate decides whether the mesh may call a model provider at all. It takes
// evidence -- "the kill switch is enabled", "the scheduler is verified live" --
// and returns a permitted mode. Nothing in the repository ever built that
// input, so the gate had no callers and the mesh had no gate: an entry point
// with credentials configured would have called a provider with nothing
// standing between it and the money.
//
// Two sources, kept apart on purpose:
//
//   FIRST-HAND    facts this process can check itself right now -- whether a
//                 credential is present, whether pricing evidence is present.
//                 Always computed, never read from a file, never overridable.
//
//   ATTESTED      claims the process cannot verify -- that a kill switch
//                 exists, that a canary receipt was produced, that a capability
//                 was externally verified. These come from an operator-supplied
//                 evidence file and are only ever as good as that file.
//
// Anything in neither source stays UNKNOWN, and UNKNOWN fails the gate. An
// absent evidence file is not "assume fine"; it is ARCHITECTURE_ONLY, which
// permits no provider calls. That is the intended resting state.
//
// A file cannot upgrade a first-hand fact. If the file claims a credential is
// present and no credential is present, the process wins -- otherwise the
// evidence file becomes a way to talk the gate into opening.

import { readFile } from 'node:fs/promises';
import { describeProviderReadiness } from './agent-model-executor-factory.mjs';

export const AGENT_MESH_ACTIVATION_EVIDENCE_POLICY_VERSION = 'agent-mesh-activation-evidence-1.0.0';

const MAX_EVIDENCE_BYTES = 200_000;

function plainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

/**
 * Read and validate an operator evidence file.
 *
 * Returns { ok, evidence, reasonCodes }. A missing path is not an error --
 * it is the normal case, and it yields empty attested evidence.
 */
export async function loadActivationEvidenceFile(path) {
  const target = String(path || '').trim();
  if (!target) {
    return { ok: true, present: false, evidence: {}, reasonCodes: [] };
  }
  let raw;
  try {
    raw = await readFile(target, 'utf8');
  } catch (error) {
    // Name the failure kind, not the path contents.
    const code = error?.code === 'ENOENT' ? 'evidence-file-not-found' : 'evidence-file-unreadable';
    return { ok: false, present: false, evidence: {}, reasonCodes: [code] };
  }
  if (Buffer.byteLength(raw, 'utf8') > MAX_EVIDENCE_BYTES) {
    return { ok: false, present: true, evidence: {}, reasonCodes: ['evidence-file-too-large'] };
  }
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { ok: false, present: true, evidence: {}, reasonCodes: ['evidence-file-json-required'] };
  }
  if (!plainObject(parsed)) {
    return { ok: false, present: true, evidence: {}, reasonCodes: ['evidence-file-object-required'] };
  }
  const capabilities = plainObject(parsed.capabilities) ? parsed.capabilities : {};
  const providers = plainObject(parsed.providers) ? parsed.providers : {};
  return {
    ok: true,
    present: true,
    evidence: {
      capabilities,
      providers,
      ownerComputeAuthorization: parsed.ownerComputeAuthorization === true,
      cloudCycleEnabled: parsed.cloudCycleEnabled === true
    },
    reasonCodes: []
  };
}

/**
 * Read the OS isolation receipt the Claude Code sandbox provider requires.
 *
 * Kept separate from the activation evidence file on purpose. Activation
 * evidence is about whether the mesh may spend at all; this is a specific
 * attestation about one sandbox -- that its filesystem is ephemeral, that no
 * business credentials are mounted, that production is unreachable. The
 * executor validates every field itself and refuses a receipt that does not
 * match the configured root, so a wrong or stale file cannot open the sandbox.
 *
 * Absent is fine and means the sandbox provider is unavailable. Named but
 * broken is a refusal.
 */
export async function loadSandboxIsolationReceipt(path) {
  const target = String(path || '').trim();
  if (!target) return { ok: true, present: false, receipt: null, reasonCodes: [] };
  let raw;
  try {
    raw = await readFile(target, 'utf8');
  } catch (error) {
    const code = error?.code === 'ENOENT' ? 'isolation-receipt-not-found' : 'isolation-receipt-unreadable';
    return { ok: false, present: false, receipt: null, reasonCodes: [code] };
  }
  if (Buffer.byteLength(raw, 'utf8') > MAX_EVIDENCE_BYTES) {
    return { ok: false, present: true, receipt: null, reasonCodes: ['isolation-receipt-too-large'] };
  }
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { ok: false, present: true, receipt: null, reasonCodes: ['isolation-receipt-json-required'] };
  }
  if (!plainObject(parsed)) {
    return { ok: false, present: true, receipt: null, reasonCodes: ['isolation-receipt-object-required'] };
  }
  return { ok: true, present: true, receipt: parsed, reasonCodes: [] };
}

/**
 * Merge attested evidence with what this process can see for itself, and
 * return the argument object `evaluateAgentMeshActivation` expects.
 */
export function composeActivationInput({
  attested = {},
  env = process.env,
  sandboxIsolationReceipt = null,
  targetDays = 7
} = {}) {
  const firstHand = describeProviderReadiness({ env, sandboxIsolationReceipt });
  const attestedProviders = plainObject(attested.providers) ? attested.providers : {};

  const providers = {};
  for (const item of firstHand) {
    const claimed = plainObject(attestedProviders[item.provider]) ? attestedProviders[item.provider] : {};
    providers[item.provider] = {
      ...claimed,
      // First-hand wins. A file saying a key exists does not make one exist.
      credentialPresent: item.credentialPresent,
      pricingEvidencePresent: item.pricingEvidencePresent
    };
  }

  return {
    capabilities: plainObject(attested.capabilities) ? attested.capabilities : {},
    providers,
    ownerComputeAuthorization: attested.ownerComputeAuthorization === true,
    cloudCycleEnabled: attested.cloudCycleEnabled === true,
    targetDays
  };
}

/**
 * Which of the configured workers the permitted mode actually allows to run.
 *
 * The gate's four modes map onto worker execution directly, because a worker
 * tick is the only thing in a cycle that can call a provider:
 *
 *   NO_PROVIDER_CALLS        no workers
 *   SYNTHETIC_ONLY           no workers
 *   ONE_PROVIDER_CANARY      one worker, and only for a canary-ready provider
 *   BOUNDED_CLOUD_REHEARSAL  every configured worker
 *
 * Autonomy pumping is unaffected: it compiles and relays LOCAL_PREPARATION
 * tasks and calls no provider.
 */
export function permittedWorkers(workers, activation) {
  const list = Array.isArray(workers) ? workers : [];
  const mode = String(activation?.permittedMode || 'NO_PROVIDER_CALLS');
  if (!list.length) return { mode, allowed: [], withheld: [], reason: null };

  if (mode === 'BOUNDED_CLOUD_REHEARSAL') {
    return { mode, allowed: list, withheld: [], reason: null };
  }
  if (mode === 'ONE_PROVIDER_CANARY') {
    const ready = activation?.providerReadyForCanary || {};
    const eligible = list.filter(worker => ready[String(worker?.provider || '').toLowerCase()] === true);
    const allowed = eligible.slice(0, 1);
    const withheld = list.filter(worker => !allowed.includes(worker));
    return {
      mode,
      allowed,
      withheld,
      reason: withheld.length ? 'canary-permits-one-worker-on-a-canary-ready-provider' : null
    };
  }
  return { mode, allowed: [], withheld: list, reason: `permitted-mode-${mode.toLowerCase()}-forbids-provider-calls` };
}
