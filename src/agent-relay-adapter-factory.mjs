// Builds the relay transport adapter the autonomy pump asks for by calling
// `adapterFactory({ originAgent, targetAgent, intent, session, run })`.
//
// The pump expects an object with `createTask` and either `readTask` or
// `waitForResult`. Exactly one implementation of that shape exists --
// chatgpt-relay-client -- and, like the control plane above it, nothing
// outside a test file ever constructed it. Two modules, both complete, both
// tested, and no path from a running process to either.
//
// Do not confuse this with agent-model-executor-factory: that one produces the
// function that calls a model. This one produces the wire the compiled task
// travels over. The control plane takes both.
//
// The bearer credential is read once here and handed to the client, which keeps
// it inside its own closure. It is never returned by any function in this
// module, never placed in a reason code, and never included in an error message
// -- an unconfigured relay reports `relay-credential-absent`, not the value it
// failed to find.

import { createChatgptRelayClient } from './chatgpt-relay-client.mjs';

export const AGENT_RELAY_ADAPTER_FACTORY_POLICY_VERSION = 'agent-relay-adapter-factory-1.0.0';

function agentName(value, fallback) {
  const normalized = String(value || '').trim().toLowerCase();
  return /^[a-z0-9][a-z0-9._-]{0,63}$/.test(normalized) ? normalized : fallback;
}

/**
 * Build the `adapterFactory` the control plane and autonomy pump expect.
 *
 * Clients are memoized per (origin, target) pair: one autonomy cycle can touch
 * several runs aimed at different agents, and rebuilding a client per run would
 * re-read the credential and re-validate the endpoint for no benefit.
 *
 * Throws for an unconfigured relay rather than returning a client that will
 * fail on every call. `resolveAdapter` in the pump treats a non-adapter as
 * "adapter unavailable" and moves on quietly; a throw is attributable.
 */
export function createRelayAdapterFactory({
  env = process.env,
  fetchImpl = globalThis.fetch,
  defaultOriginAgent = 'uberbond-autonomy',
  defaultTargetAgent = 'claude-code'
} = {}) {
  const endpoint = String(env.UBERBOND_RELAY_ENDPOINT || '').trim();
  const bearerToken = String(env.UBERBOND_RELAY_TOKEN || '');
  const clients = new Map();

  return function adapterFactory(context = {}) {
    if (!endpoint) throw new Error('relay adapter requested but UBERBOND_RELAY_ENDPOINT is absent');
    if (!bearerToken) throw new Error('relay adapter requested but UBERBOND_RELAY_TOKEN is absent');

    const originAgent = agentName(context.originAgent, defaultOriginAgent);
    const targetAgent = agentName(context.targetAgent, defaultTargetAgent);
    const key = `${originAgent}->${targetAgent}`;
    const cached = clients.get(key);
    if (cached) return cached;

    const client = createChatgptRelayClient({ endpoint, bearerToken, fetchImpl, originAgent, targetAgent });
    const configured = client.getConfig();
    if (!configured.ok) {
      // Surface the client's own reason codes. They describe the shape of the
      // misconfiguration (endpoint not https, token too short) without ever
      // naming a value.
      throw new Error(`relay adapter is not configured: ${configured.reasonCodes.join(', ')}`);
    }
    clients.set(key, client);
    return client;
  };
}

/** Whether this environment could drive the relay at all, and why not if not. */
export function describeRelayReadiness({ env = process.env } = {}) {
  const endpointPresent = Boolean(String(env.UBERBOND_RELAY_ENDPOINT || '').trim());
  const credentialPresent = Boolean(String(env.UBERBOND_RELAY_TOKEN || ''));
  const blockers = [];
  if (!endpointPresent) blockers.push('relay-endpoint-absent');
  if (!credentialPresent) blockers.push('relay-credential-absent');
  return {
    policyVersion: AGENT_RELAY_ADAPTER_FACTORY_POLICY_VERSION,
    ready: blockers.length === 0,
    blockers,
    endpointPresent,
    credentialPresent
  };
}
