import crypto from 'node:crypto';
import { ZERO_EXTERNAL_EFFECTS } from './effect-ledgers.mjs';
import { compileMoonshotSpec } from './moonshot-reality-compiler.mjs';
import { deriveSharedFutureAncestors, findExperimentFrontier, compileResearchPackets } from './moonshot-portfolio-compiler.mjs';

export const MOONSHOT_CORPUS_COMPILER_VERSION = 'uberbond.moonshot-corpus-compiler.v1';

const envelope = extra => ({
  businessEffectAuthority: 'NONE',
  externalEffectAuthority: 'NONE',
  externalEffectLedger: structuredClone(ZERO_EXTERNAL_EFFECTS),
  ...extra
});

const fail = (status, reasonCodes, extra = {}) => envelope({
  ok: false,
  status,
  reasonCodes: [...new Set(reasonCodes.filter(Boolean))],
  ...extra
});

const text = (value, max = 4000) => {
  const out = String(value ?? '').trim();
  return out && out.length <= max ? out : null;
};

const list = (values, max = 4096, itemMax = 1000) => {
  if (!Array.isArray(values) || values.length > max) return null;
  const out = [];
  const seen = new Set();
  for (const raw of values) {
    const item = text(raw, itemMax);
    if (!item) return null;
    if (!seen.has(item)) {
      seen.add(item);
      out.push(item);
    }
  }
  return out;
};

const digest = value => crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');

function normalizedWords(value) {
  return new Set(String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .split(/\s+/)
    .filter(token => token.length >= 4));
}

function jaccard(a, b) {
  if (!a.size && !b.size) return 1;
  let intersection = 0;
  for (const token of a) if (b.has(token)) intersection += 1;
  return intersection / (a.size + b.size - intersection || 1);
}

export function compileLiteralMoonshotCorpus({
  ideas = [],
  sourceId,
  sourceDate,
  maxIdeas = 10000
} = {}) {
  const source = text(sourceId, 300);
  const date = text(sourceDate, 64);
  if (!source || !date || !Array.isArray(ideas) || !Number.isSafeInteger(maxIdeas) ||
      maxIdeas < 1 || maxIdeas > 100000 || ideas.length > maxIdeas) {
    return fail('MOONSHOT_CORPUS_INVALID', ['source-date-and-bounded-ideas-required']);
  }

  const seenIds = new Set();
  const seenLiteralNames = new Set();
  const programs = [];
  const rejected = [];

  for (let index = 0; index < ideas.length; index += 1) {
    const raw = ideas[index] || {};
    const literalName = text(raw.literalName || raw.name, 500);
    const sourceLocator = text(raw.sourceLocator || `${source}#idea-${index + 1}`, 600);
    const aliases = list(raw.aliases || [], 128, 500);
    if (!literalName || !sourceLocator || !aliases) {
      rejected.push({ index, reasonCodes: ['literal-name-source-locator-and-aliases-required'] });
      continue;
    }

    const compiled = compileMoonshotSpec({
      ...raw,
      name: literalName,
      source: source,
      evidenceRefs: raw.evidenceRefs || []
    });
    if (!compiled.ok) {
      rejected.push({ index, id: raw.id || null, reasonCodes: compiled.reasonCodes });
      continue;
    }
    if (seenIds.has(compiled.spec.id)) {
      rejected.push({ index, id: compiled.spec.id, reasonCodes: ['duplicate-id'] });
      continue;
    }

    const normalizedLiteral = literalName.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
    if (seenLiteralNames.has(normalizedLiteral)) {
      rejected.push({ index, id: compiled.spec.id, reasonCodes: ['duplicate-literal-name'] });
      continue;
    }

    seenIds.add(compiled.spec.id);
    seenLiteralNames.add(normalizedLiteral);
    programs.push({
      ...compiled.spec,
      literalName,
      aliases,
      provenance: {
        sourceId: source,
        sourceDate: date,
        sourceLocator,
        ordinal: index + 1
      },
      noDropStatus: 'PRESERVED_AS_DISTINCT_SOURCE_IDEA'
    });
  }

  const corpusDigest = digest(programs.map(item => ({
    id: item.id,
    literalName: item.literalName,
    sourceLocator: item.provenance.sourceLocator,
    claim: item.claim,
    desiredTransform: item.desiredTransform
  })));

  return envelope({
    ok: true,
    status: rejected.length ? 'MOONSHOT_CORPUS_COMPILED_WITH_REJECTIONS' : 'MOONSHOT_CORPUS_COMPILED',
    sourceId: source,
    sourceDate: date,
    inputCount: ideas.length,
    compiledCount: programs.length,
    rejectedCount: rejected.length,
    programs,
    rejected,
    corpusDigest,
    noDropBoundary: 'COMPILATION_PRESERVES_LITERAL_SOURCE_IDENTITY__NEAR_DUPLICATES_REQUIRE_EXPLICIT_REVIEW_BEFORE_MERGE'
  });
}

export function proposeNearDuplicateMoonshots({
  programs = [],
  threshold = 0.78,
  maxPrograms = 5000,
  maxPairs = 20000
} = {}) {
  const t = Number(threshold);
  if (!Array.isArray(programs) || programs.length > maxPrograms || !Number.isFinite(t) ||
      t < 0 || t > 1 || !Number.isSafeInteger(maxPairs) || maxPairs < 1 || maxPairs > 100000) {
    return fail('MOONSHOT_DEDUPE_INVALID', ['bounded-programs-threshold-and-pair-limit-required']);
  }

  const rows = programs.map(item => ({
    id: text(item?.id, 160),
    literalName: text(item?.literalName || item?.name, 500),
    words: normalizedWords(`${item?.literalName || item?.name || ''} ${item?.claim || ''} ${item?.desiredTransform || ''}`)
  }));

  if (rows.some(row => !row.id || !row.literalName)) {
    return fail('MOONSHOT_DEDUPE_INVALID', ['program-id-and-literal-name-required']);
  }

  const tokenIndex = new Map();
  rows.forEach((row, index) => {
    for (const token of row.words) {
      if (!tokenIndex.has(token)) tokenIndex.set(token, []);
      tokenIndex.get(token).push(index);
    }
  });

  const pairKeys = new Set();
  for (const indexes of tokenIndex.values()) {
    if (indexes.length > 100) continue;
    for (let i = 0; i < indexes.length; i += 1) {
      for (let j = i + 1; j < indexes.length; j += 1) {
        const a = Math.min(indexes[i], indexes[j]);
        const b = Math.max(indexes[i], indexes[j]);
        pairKeys.add(`${a}:${b}`);
        if (pairKeys.size >= maxPairs) break;
      }
      if (pairKeys.size >= maxPairs) break;
    }
    if (pairKeys.size >= maxPairs) break;
  }

  const candidates = [];
  for (const key of pairKeys) {
    const [ai, bi] = key.split(':').map(Number);
    const score = jaccard(rows[ai].words, rows[bi].words);
    if (score >= t) {
      candidates.push({
        aId: rows[ai].id,
        bId: rows[bi].id,
        lexicalSemanticProxyScore: Number(score.toFixed(4)),
        decision: 'REVIEW_ONLY__DO_NOT_AUTO_MERGE'
      });
    }
  }
  candidates.sort((a, b) => b.lexicalSemanticProxyScore - a.lexicalSemanticProxyScore ||
    a.aId.localeCompare(b.aId) || a.bId.localeCompare(b.bId));

  return envelope({
    ok: true,
    status: 'NEAR_DUPLICATE_CANDIDATES_PROPOSED',
    candidatePairs: candidates,
    examinedPairCount: pairKeys.size,
    claimBoundary: 'LEXICAL_OVERLAP_IS_ONLY_A_DEDUPE_HEURISTIC__UNIQUE_PURPOSE_MUST_BE_PRESERVED'
  });
}

export function compileAncestorResearchFrontier({
  moonshots = [],
  prerequisiteNodes = [],
  minimumMoonshots = 2,
  minimumDomains = 2
} = {}) {
  const ancestors = deriveSharedFutureAncestors({
    moonshots,
    prerequisiteNodes,
    minimumMoonshots,
    minimumDomains
  });
  if (!ancestors.ok) return ancestors;

  const frontier = findExperimentFrontier({ prerequisiteNodes });
  if (!frontier.ok) return frontier;

  const packets = compileResearchPackets({
    sharedAncestors: ancestors.sharedAncestors,
    frontier: frontier.frontier
  });
  if (!packets.ok) return packets;

  const frontierShared = new Set(frontier.frontier.map(item => item.id));
  const prioritized = ancestors.sharedAncestors
    .filter(item => frontierShared.has(item.id))
    .map(item => ({
      ...item,
      leverageScore: item.moonshotsUnlocked * Math.max(1, item.domainsSpanned)
    }))
    .sort((a, b) => b.leverageScore - a.leverageScore || a.id.localeCompare(b.id));

  return envelope({
    ok: true,
    status: 'ANCESTOR_RESEARCH_FRONTIER_COMPILED',
    sharedAncestors: ancestors.sharedAncestors,
    experimentFrontier: frontier.frontier,
    blockedFrontier: frontier.blocked,
    prioritizedExperimentableAncestors: prioritized,
    researchPackets: packets.packets,
    law: 'WORK_THE_SMALLEST_EXPERIMENTALLY_REACHABLE_SHARED_ANCESTORS_BEFORE_BUILDING_GRAND_DESCENDANTS'
  });
}

export function buildResurrectionIndex({ programs = [] } = {}) {
  if (!Array.isArray(programs) || programs.length > 100000) {
    return fail('RESURRECTION_INDEX_INVALID', ['bounded-programs-required']);
  }

  const rows = [];
  for (const program of programs) {
    const state = text(program?.truthState, 80)?.toUpperCase();
    if (!state || ![
      'FALSIFIED',
      'BLOCKED_BY_CURRENT_PHYSICS',
      'BLOCKED_BY_MATHEMATICS',
      'BLOCKED_BY_MISSING_KNOWLEDGE',
      'BLOCKED_BY_MISSING_MEASUREMENT',
      'BLOCKED_BY_MISSING_CAPABILITY',
      'BLOCKED_BY_AUTHORITY',
      'ARCHIVED'
    ].includes(state)) continue;

    const conditions = list(program?.resurrectionConditions || [], 128, 1200) || [];
    rows.push({
      id: text(program?.id, 160),
      truthState: state,
      resurrectionConditions: conditions,
      reviewTrigger: conditions.length ? 'WHEN_ANY_CONDITION_MAY_HAVE_CHANGED' : 'MANUAL_OR_FRONTIER_SIGNAL_ONLY'
    });
  }

  return envelope({
    ok: true,
    status: 'RESURRECTION_INDEX_READY',
    rows,
    noAmputationLaw: 'BLOCKED_OR_FALSIFIED_IDEAS_REMAIN_RECOVERABLE_WITH_THEIR_EVIDENCE_AND_USEFUL_DESCENDANTS'
  });
}
