import { ZERO_EXTERNAL_EFFECTS } from './effect-ledgers.mjs';

export const MOONSHOT_PORTFOLIO_COMPILER_VERSION = 'uberbond.moonshot-portfolio-compiler.v1';

const text = (value, max = 1200) => {
  const out = String(value ?? '').trim();
  return out && out.length <= max ? out : null;
};

const list = (value, max = 512, itemMax = 240) => {
  if (!Array.isArray(value) || value.length > max) return null;
  const out = [];
  const seen = new Set();
  for (const raw of value) {
    const item = text(raw, itemMax);
    if (!item) return null;
    if (!seen.has(item)) {
      seen.add(item);
      out.push(item);
    }
  }
  return out;
};

const envelope = extra => ({
  externalEffectAuthority: 'NONE',
  businessEffectAuthority: 'NONE',
  externalEffectLedger: structuredClone(ZERO_EXTERNAL_EFFECTS),
  ...extra
});

const fail = (status, reasonCodes, extra = {}) => envelope({
  ok: false,
  status,
  reasonCodes: [...new Set(reasonCodes.filter(Boolean))],
  ...extra
});

// Canonical executable states come from moonshot-reality-compiler.v1.
// Older recovered design artifacts used several richer labels. They remain
// accepted aliases so donor lineage is not amputated, but they do not create a
// second promotion machine.
const MATURE_STATES = new Set([
  'DEMONSTRATED','REPRODUCED','ENGINEERABLE','DEPLOYABLE','CIVILIZATION_RELEVANT',
  'SOFTWARE_DEMONSTRATED','EXPERIMENTED','FIELD_PROVEN','PLATFORM_PRIMITIVE','EPOCH_CANDIDATE'
]);

function compileNodeMap(nodes) {
  if (!Array.isArray(nodes) || nodes.length === 0 || nodes.length > 20000) {
    return { ok: false, reasonCodes: ['one-to-20000-prerequisite-nodes-required'] };
  }
  const map = new Map();
  for (const raw of nodes) {
    const id = text(raw?.id, 160)?.toLowerCase();
    const requires = list(raw?.requires || [], 1024, 160);
    if (!id || !requires || map.has(id)) return { ok: false, reasonCodes: ['unique-prerequisite-id-and-requires-required'] };
    map.set(id, {
      id,
      name: text(raw?.name, 500) || id,
      requires: requires.map(x => x.toLowerCase()),
      realityState: text(raw?.realityState, 80)?.toUpperCase() || 'UNKNOWN',
      experimentallyReachable: raw?.experimentallyReachable === true
    });
  }
  for (const node of map.values()) {
    for (const req of node.requires) {
      if (!map.has(req)) return { ok: false, reasonCodes: [`missing-prerequisite:${req}`] };
    }
  }
  const visiting = new Set();
  const visited = new Set();
  function visit(id) {
    if (visiting.has(id)) return false;
    if (visited.has(id)) return true;
    visiting.add(id);
    for (const req of map.get(id).requires) if (!visit(req)) return false;
    visiting.delete(id);
    visited.add(id);
    return true;
  }
  for (const id of map.keys()) {
    if (!visit(id)) return { ok: false, reasonCodes: ['prerequisite-cycle-prohibited'] };
  }
  return { ok: true, map };
}

function collectAncestors(id, map, out = new Set()) {
  if (out.has(id)) return out;
  out.add(id);
  for (const req of map.get(id)?.requires || []) collectAncestors(req, map, out);
  return out;
}

export function deriveSharedFutureAncestors({ moonshots = [], prerequisiteNodes = [], minimumMoonshots = 2, minimumDomains = 2 } = {}) {
  const graph = compileNodeMap(prerequisiteNodes);
  if (!graph.ok) return fail('SHARED_ANCESTOR_INVALID', graph.reasonCodes);

  if (!Array.isArray(moonshots) || moonshots.length === 0 || moonshots.length > 10000) {
    return fail('SHARED_ANCESTOR_INVALID', ['one-to-10000-moonshots-required']);
  }
  if (!Number.isSafeInteger(minimumMoonshots) || minimumMoonshots < 2) {
    return fail('SHARED_ANCESTOR_INVALID', ['minimum-moonshots-must-be-at-least-two']);
  }
  if (!Number.isSafeInteger(minimumDomains) || minimumDomains < 1) {
    return fail('SHARED_ANCESTOR_INVALID', ['minimum-domains-must-be-positive']);
  }

  const normalized = [];
  for (const raw of moonshots) {
    const id = text(raw?.id, 160)?.toLowerCase();
    const rootIds = list(raw?.rootPrerequisiteIds || [], 128, 160);
    const domains = list(raw?.domains || [], 64, 160);
    if (!id || !rootIds?.length || !domains?.length) {
      return fail('SHARED_ANCESTOR_INVALID', ['moonshot-id-roots-domains-required']);
    }
    for (const root of rootIds) {
      if (!graph.map.has(root.toLowerCase())) return fail('SHARED_ANCESTOR_INVALID', [`unknown-root:${root}`]);
    }
    normalized.push({ id, rootIds: rootIds.map(x => x.toLowerCase()), domains });
  }

  const stats = new Map();
  for (const moonshot of normalized) {
    const ancestorIds = new Set();
    for (const root of moonshot.rootIds) collectAncestors(root, graph.map, ancestorIds);
    for (const ancestorId of ancestorIds) {
      if (!stats.has(ancestorId)) stats.set(ancestorId, { moonshots: new Set(), domains: new Set() });
      const row = stats.get(ancestorId);
      row.moonshots.add(moonshot.id);
      moonshot.domains.forEach(domain => row.domains.add(domain));
    }
  }

  const ancestors = [...stats.entries()].map(([id, row]) => ({
    id,
    name: graph.map.get(id).name,
    moonshotsUnlocked: row.moonshots.size,
    domainsSpanned: row.domains.size,
    moonshotIds: [...row.moonshots].sort(),
    domains: [...row.domains].sort(),
    realityState: graph.map.get(id).realityState,
    experimentallyReachable: graph.map.get(id).experimentallyReachable
  })).sort((a,b) =>
    b.moonshotsUnlocked - a.moonshotsUnlocked ||
    b.domainsSpanned - a.domainsSpanned ||
    a.id.localeCompare(b.id)
  );

  const shared = ancestors.filter(row => row.moonshotsUnlocked >= minimumMoonshots && row.domainsSpanned >= minimumDomains);

  return envelope({
    ok: true,
    status: 'SHARED_FUTURE_ANCESTORS_COMPILED',
    sharedAncestors: shared,
    allAncestors: ancestors,
    law: 'RAW_IDEA_COUNT_DOES_NOT_CREATE_LEVERAGE__CROSS_MOONSHOT_AND_CROSS_DOMAIN_REUSE_DOES',
    claimBoundary: 'DEPENDENCY_CENTRALITY_IS_DECLARED_STRUCTURE__NOT_PROOF_OF_CAUSAL_OR_CIVILIZATION_IMPACT'
  });
}

export function findExperimentFrontier({ prerequisiteNodes = [] } = {}) {
  const graph = compileNodeMap(prerequisiteNodes);
  if (!graph.ok) return fail('EXPERIMENT_FRONTIER_INVALID', graph.reasonCodes);

  const frontier = [...graph.map.values()]
    .filter(node => node.experimentallyReachable)
    .filter(node => !MATURE_STATES.has(node.realityState))
    .filter(node => node.requires.every(req => MATURE_STATES.has(graph.map.get(req).realityState)))
    .map(node => ({
      id: node.id,
      name: node.name,
      realityState: node.realityState,
      requires: [...node.requires]
    }))
    .sort((a,b) => a.id.localeCompare(b.id));

  const blocked = [...graph.map.values()]
    .filter(node => node.experimentallyReachable && !MATURE_STATES.has(node.realityState))
    .filter(node => node.requires.some(req => !MATURE_STATES.has(graph.map.get(req).realityState)))
    .map(node => ({
      id: node.id,
      blockedBy: node.requires.filter(req => !MATURE_STATES.has(graph.map.get(req).realityState)).sort()
    }))
    .sort((a,b) => a.id.localeCompare(b.id));

  return envelope({
    ok: true,
    status: 'EXPERIMENT_FRONTIER_COMPILED',
    frontier,
    blocked,
    claimBoundary: 'FRONTIER_MEANS_DECLARED_PREREQUISITES_ARE_SATISFIED__NOT_THAT_EXPERIMENT_IS_SAFE_AUTHORIZED_OR_WORTHWHILE'
  });
}

export function compileResearchPackets({ sharedAncestors = [], frontier = [] } = {}) {
  if (!Array.isArray(sharedAncestors) || !Array.isArray(frontier)) {
    return fail('RESEARCH_PACKET_COMPILATION_INVALID', ['ancestor-and-frontier-arrays-required']);
  }
  const sharedById = new Map(sharedAncestors.filter(x => x?.id).map(x => [x.id, x]));
  const packets = frontier.filter(x => x?.id).map(item => {
    const leverage = sharedById.get(item.id);
    return {
      packetId: `moonshot-research:${item.id}`,
      prerequisiteId: item.id,
      objective: `Acquire decisive evidence about prerequisite ${item.id} without promoting beyond observed evidence.`,
      moonshotsPotentiallyUnlocked: leverage?.moonshotIds || [],
      domainsPotentiallyUnlocked: leverage?.domains || [],
      currentRealityState: item.realityState || 'UNKNOWN',
      requiredNextArtifact: 'PREREGISTERED_MINIMUM_REALITY_PROBE',
      effectAuthority: 'NONE_AT_PACKET_COMPILATION',
      completionRule: 'CLOSE_ONLY_WITH_EXACT_EVIDENCE_OR_EXPLICIT_FALSIFICATION_BLOCKER'
    };
  });
  return envelope({
    ok: true,
    status: 'RESEARCH_PACKETS_COMPILED',
    packets,
    claimBoundary: 'PACKETS_ARE_RESEARCH_ASSIGNMENTS__NOT_AUTHORIZATION_TO_RUN_EXTERNAL_EXPERIMENTS'
  });
}
