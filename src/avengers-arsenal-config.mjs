import fs from 'node:fs';
import path from 'node:path';

function roleForCapability(id) {
  const roles = {
    'find-skills': ['researcher'],
    'claude-code-setup': ['planner'],
    'task-observer': ['critic'],
    'claude-mem': ['general'],
    headroom: ['general'],
    omniroute: ['planner'],
    strix: ['verifier'],
    'agent-reach': ['researcher'],
    'fable-orchestrator': ['planner', 'adjudicator'],
    metaswarm: ['planner', 'adjudicator'],
    superpowers: ['builder', 'verifier']
  };
  return roles[id] || ['general'];
}

function endpointClass(value) {
  try {
    const url = new URL(String(value || ''));
    const loopback = ['127.0.0.1', 'localhost', '::1', '[::1]'].includes(url.hostname);
    if (loopback && url.protocol === 'http:') return 'LOOPBACK';
    if (url.protocol === 'https:') return 'REMOTE_HTTPS';
    return 'UNSAFE';
  } catch {
    return 'UNSAFE';
  }
}

function remoteApprovalValid(profile = {}) {
  if (endpointClass(profile.endpoint) !== 'REMOTE_HTTPS') return true;
  const ref = String(profile.remoteApprovalRef || '').trim();
  const verifiedAt = String(profile.remoteApprovalVerifiedAt || '').trim();
  return profile.remoteApproved === true
    && ref.length > 0
    && Number.isFinite(Date.parse(verifiedAt));
}

export function capabilityEntryToAvengersTool(entry, { root = process.cwd(), fileExists = fs.existsSync } = {}) {
  const integration = entry?.projectIntegration || {};
  const declaredPath = integration.path || integration.claudeSkillPath || integration.controlPlanePath || integration.canonPath || null;
  const resolved = declaredPath ? path.resolve(root, declaredPath) : null;
  const pathExists = Boolean(resolved && fileExists(resolved));
  const runtimeRequired = integration.runtimeRequired === true
    || integration.runtimeEvidenceRequired === true
    || (integration.upstreamRuntimeOptional === true && integration.runtimeRequiredForProtocol !== false);
  let kind = 'METHOD_ONLY';
  if (entry.class === 'PROJECT_SKILL') kind = 'PROJECT_SKILL';
  else if (entry.class === 'OPTIONAL_RUNTIME') kind = 'OPTIONAL_RUNTIME';
  else if (entry.class === 'EXTERNAL_ADAPTER') kind = 'EXTERNAL_ADAPTER';
  else if (entry.class === 'PROJECT_SKILL_AND_OPTIONAL_RUNTIME') kind = pathExists ? 'PROJECT_SKILL' : 'OPTIONAL_RUNTIME';
  return {
    id: entry.id,
    name: entry.name,
    kind,
    path: pathExists ? declaredPath : null,
    sourceRef: entry.sourceRef || entry.source || null,
    roles: roleForCapability(entry.id),
    runtimeRequired: entry.id === 'fable-orchestrator' ? false : runtimeRequired,
    notes: [
      `external-class:${entry.class}`,
      `activation:${entry.activation}`,
      `integration-status:${integration.status || 'UNDECLARED'}`,
      pathExists ? 'declared-project-surface-present' : 'declared-project-surface-not-observed'
    ]
  };
}

export function mergeAvengersProfileOverrides(base = [], raw = '') {
  if (!raw || !String(raw).trim()) return [...base];
  const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
  if (!Array.isArray(parsed)) throw new Error('AVENGERS_MODEL_PROFILES_JSON must be a JSON array');
  const byId = new Map((base || []).map(item => [String(item?.id || '').toLowerCase(), item]));
  for (const item of parsed) {
    if (endpointClass(item?.endpoint) === 'UNSAFE') throw new Error(`unsafe Avengers profile endpoint: ${String(item?.id || '(unnamed)')}`);
    if (!remoteApprovalValid(item)) throw new Error(`remote Avengers profile requires explicit approval evidence: ${String(item?.id || '(unnamed)')}`);
    byId.set(String(item?.id || '').toLowerCase(), item);
  }
  return [...byId.values()];
}

export function composeAvengersRegistry({ baseRegistry, externalCapabilityRegistry, profileOverrides = '', root = process.cwd(), fileExists = fs.existsSync } = {}) {
  if (!baseRegistry || typeof baseRegistry !== 'object' || Array.isArray(baseRegistry)) throw new Error('base Avengers registry object required');
  const externalEntries = Array.isArray(externalCapabilityRegistry?.entries) ? externalCapabilityRegistry.entries : [];
  const mergedTools = new Map();
  for (const tool of baseRegistry.tools || []) mergedTools.set(String(tool?.id || '').toLowerCase(), tool);
  for (const entry of externalEntries) {
    const tool = capabilityEntryToAvengersTool(entry, { root, fileExists });
    mergedTools.set(String(tool.id || '').toLowerCase(), tool);
  }
  const profiles = mergeAvengersProfileOverrides(baseRegistry.profiles || [], profileOverrides);
  for (const profile of profiles) {
    if (endpointClass(profile?.endpoint) === 'UNSAFE') throw new Error(`unsafe Avengers profile endpoint: ${String(profile?.id || '(unnamed)')}`);
    if (!remoteApprovalValid(profile)) throw new Error(`remote Avengers profile requires explicit approval evidence: ${String(profile?.id || '(unnamed)')}`);
  }
  return {
    ...baseRegistry,
    profiles,
    tools: [...mergedTools.values()]
  };
}
