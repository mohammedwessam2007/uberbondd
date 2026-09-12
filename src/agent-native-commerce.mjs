import { createHash } from 'node:crypto';

export const AGENT_NATIVE_COMMERCE_VERSION = 'uberbond.agent-native-commerce.v1';

const EXIT = Object.freeze({ OK: 0, INVALID: 2, UNAUTHORIZED: 3, DRY_RUN_REQUIRED: 4, NOT_FOUND: 5 });

function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.keys(value).sort().map(key => [key, stable(value[key])]));
}

function digest(value) {
  return createHash('sha256').update(JSON.stringify(stable(value))).digest('hex');
}

function response({ ok, exitCode, status, data = null, reasonCodes = [] }) {
  return { version: AGENT_NATIVE_COMMERCE_VERSION, ok, exitCode, status, data, reasonCodes };
}

function commandMap(product = {}) {
  return new Map((Array.isArray(product.commands) ? product.commands : []).map(command => [command.name, command]));
}

export function buildAgentCommerceManifest(product = {}) {
  const commands = (Array.isArray(product.commands) ? product.commands : []).map(command => ({
    name: String(command.name || ''),
    description: String(command.description || ''),
    destructive: command.destructive === true,
    spendCapRequired: command.spendCapRequired === true,
    scopes: [...new Set(Array.isArray(command.scopes) ? command.scopes.map(String) : [])].sort(),
    inputSchema: command.inputSchema || {},
  })).filter(command => command.name);
  const manifest = {
    schema: AGENT_NATIVE_COMMERCE_VERSION,
    productId: String(product.productId || ''),
    displayName: String(product.displayName || product.productId || ''),
    commands,
    output: 'application/json',
    destructivePolicy: 'dry-run-first',
    identityPolicy: 'principal-delegated-attenuation-only',
  };
  return { ...manifest, revisionHash: digest(manifest) };
}

export function createDelegatedAgentIdentity({ principalId, agentId, scopes = [], spendCap = 0, expiresAt, parent = null } = {}) {
  const requestedScopes = [...new Set(scopes.map(String))].sort();
  if (!principalId || !agentId || !expiresAt) return response({ ok: false, exitCode: EXIT.INVALID, status: 'IDENTITY_INVALID', reasonCodes: ['principal-agent-expiry-required'] });
  if (parent) {
    const parentScopes = new Set(parent.scopes || []);
    if (requestedScopes.some(scope => !parentScopes.has(scope))) return response({ ok: false, exitCode: EXIT.UNAUTHORIZED, status: 'DELEGATION_WIDENS_SCOPE', reasonCodes: ['attenuation-only'] });
    if (Number(spendCap) > Number(parent.spendCap || 0)) return response({ ok: false, exitCode: EXIT.UNAUTHORIZED, status: 'DELEGATION_WIDENS_SPEND', reasonCodes: ['attenuation-only'] });
  }
  const identity = { principalId: String(principalId), agentId: String(agentId), scopes: requestedScopes, spendCap: Math.max(0, Number(spendCap) || 0), expiresAt: new Date(expiresAt).toISOString(), parentAgentId: parent?.agentId || null };
  return response({ ok: true, exitCode: EXIT.OK, status: 'IDENTITY_CREATED', data: { ...identity, identityHash: digest(identity) } });
}

function authorize(command, identity, input, now) {
  if (!identity) return ['identity-required'];
  if (new Date(identity.expiresAt).getTime() <= new Date(now).getTime()) return ['identity-expired'];
  const scopes = new Set(identity.scopes || []);
  const missing = (command.scopes || []).filter(scope => !scopes.has(scope));
  if (missing.length) return missing.map(scope => `missing-scope:${scope}`);
  if (command.spendCapRequired) {
    const amount = Math.max(0, Number(input?.amount) || 0);
    if (amount > Number(identity.spendCap || 0)) return ['spend-cap-exceeded'];
  }
  return [];
}

export function executeAgentCommand({ product = {}, identity, commandName, input = {}, dryRun = false, now = new Date().toISOString(), executor } = {}) {
  const command = commandMap(product).get(commandName);
  if (!command) return response({ ok: false, exitCode: EXIT.NOT_FOUND, status: 'COMMAND_NOT_FOUND', reasonCodes: ['unknown-command'] });
  const authReasons = authorize(command, identity, input, now);
  if (authReasons.length) return response({ ok: false, exitCode: EXIT.UNAUTHORIZED, status: 'COMMAND_UNAUTHORIZED', reasonCodes: authReasons });
  if (command.destructive && !dryRun) return response({ ok: false, exitCode: EXIT.DRY_RUN_REQUIRED, status: 'DRY_RUN_REQUIRED', reasonCodes: ['destructive-command-requires-dry-run-first'] });
  const receipt = {
    commandName,
    principalId: identity.principalId,
    agentId: identity.agentId,
    inputHash: digest(input),
    dryRun: Boolean(dryRun),
    revisionHash: buildAgentCommerceManifest(product).revisionHash,
  };
  if (dryRun) return response({ ok: true, exitCode: EXIT.OK, status: 'DRY_RUN_OK', data: { receipt, planned: true } });
  const result = typeof executor === 'function' ? executor({ command, input, identity }) : { accepted: true };
  return response({ ok: true, exitCode: EXIT.OK, status: 'COMMAND_EXECUTED', data: { receipt, result } });
}

export function buildAgentAcquisitionSurface(product = {}) {
  const manifest = buildAgentCommerceManifest(product);
  return {
    version: AGENT_NATIVE_COMMERCE_VERSION,
    discover: manifest,
    skill: {
      name: manifest.displayName,
      instruction: 'Discover commands, request only minimum scopes, dry-run destructive actions, execute only within delegated authority, and consume structured JSON results.',
      revisionHash: manifest.revisionHash,
    },
  };
}

export { EXIT as AGENT_NATIVE_EXIT_CODES };
