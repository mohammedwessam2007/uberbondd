import crypto from 'node:crypto';
import * as core from './genesis-mechanism-compiler-core.mjs';

export const GENESIS_MECHANISM_COMPILER_VERSION = 'uberbond.genesis-mechanism-compiler.v1.2';
export const EVIDENCE_CLASSES = core.EVIDENCE_CLASSES;
export const SOURCE_KINDS = core.SOURCE_KINDS;
export const MUTATION_OPERATORS = core.MUTATION_OPERATORS;
export const PRIMITIVE_ROLES = core.PRIMITIVE_ROLES;
export const ECONOMIC_ROLES = core.ECONOMIC_ROLES;

const STOPWORDS = new Set([
  'a', 'an', 'the', 'of', 'to', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
  'in', 'on', 'at', 'by', 'for', 'with', 'and', 'or', 'as', 'it', 'its', 'that',
  'which', 'this', 'these', 'those', 'then', 'than', 'from', 'into', 'we', 'they'
]);

const STATE_VERBS = new Set([
  'sit', 'sits', 'sat', 'stay', 'stays', 'stayed', 'remain', 'remains', 'remained',
  'become', 'becomes', 'became', 'exist', 'exists', 'existed'
]);

const DIRECTIONAL_VERBS = Object.freeze({
  fund: 'fund', funds: 'fund', funded: 'fund',
  refund: 'refund', refunds: 'refund', refunded: 'refund',
  pay: 'pay', pays: 'pay', paid: 'pay',
  send: 'send', sends: 'send', sent: 'send',
  transfer: 'transfer', transfers: 'transfer', transferred: 'transfer',
  give: 'give', gives: 'give', gave: 'give', given: 'give',
  grant: 'grant', grants: 'grant', granted: 'grant',
  revoke: 'revoke', revokes: 'revoke', revoked: 'revoke',
  charge: 'charge', charges: 'charge', charged: 'charge',
  credit: 'credit', credits: 'credit', credited: 'credit',
  debit: 'debit', debits: 'debit', debited: 'debit',
  assign: 'assign', assigns: 'assign', assigned: 'assign',
  notify: 'notify', notifies: 'notify', notified: 'notify',
  sell: 'sell', sells: 'sell', sold: 'sell',
  buy: 'buy', buys: 'buy', bought: 'buy',
  deliver: 'deliver', delivers: 'deliver', delivered: 'deliver',
  approve: 'approve', approves: 'approve', approved: 'approve',
  reject: 'reject', rejects: 'reject', rejected: 'reject',
  route: 'route', routes: 'route', routed: 'route',
  allocate: 'allocate', allocates: 'allocate', allocated: 'allocate'
});

const TEMPORAL = new Set(['before', 'after', 'until', 'once', 'while', 'when']);
const hash = value => crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
const tokensOf = value => String(value ?? '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().split(' ').filter(Boolean);
const contentTokens = tokens => tokens.filter(token => !STOPWORDS.has(token));
const bag = tokens => [...new Set(contentTokens(tokens))].sort();
const counts = tokens => {
  const map = new Map();
  for (const token of contentTokens(tokens)) map.set(token, (map.get(token) || 0) + 1);
  return [...map.entries()].sort(([a], [b]) => a.localeCompare(b));
};
const phraseBag = tokens => bag(tokens).join(' ');
const lexicalCanonical = value => phraseBag(tokensOf(value));
const nearestContent = (tokens, start, direction) => {
  for (let i = start; i >= 0 && i < tokens.length; i += direction) {
    if (!STOPWORDS.has(tokens[i]) && !TEMPORAL.has(tokens[i])) return tokens[i];
  }
  return null;
};

function temporalFrames(tokens) {
  const frames = [];
  for (let i = 0; i < tokens.length; i += 1) {
    const marker = tokens[i];
    if (!TEMPORAL.has(marker)) continue;
    if (i === 0) {
      const remainder = contentTokens(tokens.slice(1));
      if (remainder.length >= 2) {
        const right = remainder[0];
        const left = phraseBag(remainder.slice(1));
        if (left && right) frames.push(`${left}>${marker}>${right}`);
      }
      continue;
    }
    const left = phraseBag(tokens.slice(0, i));
    const right = phraseBag(tokens.slice(i + 1));
    if (left && right) frames.push(`${left}>${marker}>${right}`);
  }
  return frames;
}

function fromToFrames(tokens) {
  const frames = [];
  for (let i = 0; i < tokens.length; i += 1) {
    if (tokens[i] !== 'from') continue;
    const toIndex = tokens.indexOf('to', i + 1);
    if (toIndex < 0) continue;
    const source = phraseBag(tokens.slice(i + 1, toIndex));
    const target = phraseBag(tokens.slice(toIndex + 1));
    if (source && target) frames.push(`${source}>to>${target}`);
  }
  return frames;
}

function directionalVerbFrames(tokens) {
  const frames = [];
  for (let i = 0; i < tokens.length; i += 1) {
    const lemma = DIRECTIONAL_VERBS[tokens[i]];
    if (!lemma) continue;
    const left = nearestContent(tokens, i - 1, -1);
    const right = nearestContent(tokens, i + 1, 1);
    if (left && right) frames.push(`${left}>${lemma}>${right}`);
  }
  return frames;
}

function needsConservativeOrder(tokens, frames) {
  if (frames.length) return false;
  if (tokens.some(token => STATE_VERBS.has(token))) return false;
  // False negatives in dedupe are cheaper than false semantic merges. If a
  // statement contains three or more content tokens and we do not understand
  // its causal grammar, preserve order rather than guessing equivalence.
  return contentTokens(tokens).length >= 3;
}

/**
 * Identity used for novelty/dedupe. Unlike the former sorted Set, this keeps
 * multiplicity and causal role/direction. It is deliberately conservative:
 * when a statement has no causal frame we know how to normalize safely, token
 * order stays in the identity instead of being guessed equivalent.
 */
export function semanticStatementIdentity(value) {
  const tokens = tokensOf(value);
  const frames = [
    ...temporalFrames(tokens),
    ...fromToFrames(tokens),
    ...directionalVerbFrames(tokens)
  ].sort();
  const identity = {
    lexicalBag: bag(tokens),
    multiplicity: counts(tokens),
    causalFrames: [...new Set(frames)],
    conservativeOrder: needsConservativeOrder(tokens, frames) ? contentTokens(tokens) : null
  };
  return JSON.stringify(identity);
}

export function semanticPrimitiveId(role, statement) {
  return `primitive_${hash({ role: String(role || ''), semantic: semanticStatementIdentity(statement) }).slice(0, 24)}`;
}

export function causalSignature({ primitiveIds = [], exploits = [], mutatedAssumptions = [] } = {}) {
  return hash({
    primitiveIds: [...new Set(primitiveIds.map(id => String(id)))].sort(),
    exploits: [...new Set(exploits.map(semanticStatementIdentity).filter(Boolean))].sort(),
    mutatedAssumptions: [...new Set(mutatedAssumptions.map(semanticStatementIdentity).filter(Boolean))].sort()
  });
}

export function normalizeDonorMechanism(input = {}) {
  return core.normalizeDonorMechanism(input);
}

function buildPrimitive(mechanism, role, statement, economicRole = null) {
  return {
    primitiveId: semanticPrimitiveId(role, statement),
    role,
    statement,
    // Preserve the mature public field for compatibility while adding a
    // stronger machine identity alongside it.
    canonicalStatement: lexicalCanonical(statement),
    semanticIdentity: semanticStatementIdentity(statement),
    economicRole,
    donorId: mechanism.mechanismId,
    donorDomain: mechanism.domain,
    exploits: mechanism.exploits,
    evidenceClass: mechanism.evidenceClass,
    provenance: mechanism.provenance,
    businessEffectAuthority: 'NONE'
  };
}

function hardenPrimitive(primitive) {
  if (!primitive?.role || !primitive?.statement) return primitive;
  return {
    ...primitive,
    primitiveId: semanticPrimitiveId(primitive.role, primitive.statement),
    semanticIdentity: semanticStatementIdentity(primitive.statement)
  };
}

export function decomposeToPrimitives(args = {}) {
  // Reuse the mature core as the validity authority, but DO NOT consume its
  // primitive list: the old core dedupes on the lossy identity we are repairing.
  const validation = core.decomposeToPrimitives(args);
  if (!validation?.ok) return validation;
  const mechanism = args?.mechanism;
  const primitives = [
    buildPrimitive(mechanism, 'CONSTRAINT', mechanism.exploits),
    buildPrimitive(mechanism, 'ACTION', mechanism.does),
    ...(mechanism.preconditions || []).map(entry => buildPrimitive(mechanism, 'PRECONDITION', entry.statement, entry.economicRole)),
    ...(mechanism.effects || []).map(entry => buildPrimitive(mechanism, 'EFFECT', entry.statement, entry.economicRole))
  ];
  const unique = [];
  for (const row of primitives) {
    if (!unique.some(item => item.primitiveId === row.primitiveId)) unique.push(row);
  }
  return {
    ...validation,
    version: GENESIS_MECHANISM_COMPILER_VERSION,
    primitiveCount: unique.length,
    primitives: unique
  };
}

export function mutateAssumptions(args = {}) {
  const base = core.mutateAssumptions(args);
  if (!base?.ok || !Array.isArray(base.variants)) return base;
  const mechanism = args?.mechanism;
  const constraintId = semanticPrimitiveId('CONSTRAINT', mechanism?.exploits);
  const variants = base.variants.map(variant => {
    const signature = causalSignature({
      primitiveIds: [constraintId],
      exploits: [mechanism?.exploits],
      mutatedAssumptions: variant.mutatedAssumptions
    });
    return { ...variant, variantId: `variant_${signature.slice(0, 24)}`, causalSignature: signature };
  });
  return { ...base, version: GENESIS_MECHANISM_COMPILER_VERSION, variants };
}

export function recombineAcrossDonors({ primitives = [], maxCandidates = 50 } = {}) {
  const hardened = Array.isArray(primitives) ? primitives.map(hardenPrimitive) : primitives;
  const base = core.recombineAcrossDonors({ primitives: hardened, maxCandidates });
  if (!base?.ok || !Array.isArray(base.candidates)) return base;
  // The core signature already includes the hardened primitive ids. Recompute
  // with the stronger text identity as well so imported/custom primitives get
  // the same direction-safe candidate identity.
  const bySignature = new Map();
  for (const candidate of base.candidates) {
    const members = hardened.filter(row => candidate.primitiveIds.includes(row.primitiveId));
    const signature = causalSignature({
      primitiveIds: candidate.primitiveIds,
      exploits: members.length ? members.map(row => row.exploits) : candidate.exploits
    });
    const next = {
      ...candidate,
      candidateId: `candidate_${signature.slice(0, 24)}`,
      causalSignature: signature
    };
    const existing = bySignature.get(signature);
    if (existing) existing.collapsedVariants += 1 + (next.collapsedVariants || 0);
    else bySignature.set(signature, next);
  }
  const candidates = [...bySignature.values()];
  return {
    ...base,
    version: GENESIS_MECHANISM_COMPILER_VERSION,
    candidateCount: candidates.length,
    duplicateCount: candidates.reduce((sum, row) => sum + Number(row.collapsedVariants || 0), 0),
    candidates
  };
}

export function compileGenesisMechanisms(args = {}) {
  const base = core.compileGenesisMechanisms(args);
  if (!base?.ok || !Array.isArray(base.normalized)) return base;
  const primitives = base.normalized.flatMap(mechanism => decomposeToPrimitives({ mechanism }).primitives || []);
  const mutations = base.normalized.map(mechanism => mutateAssumptions({ mechanism })).filter(row => row?.ok);
  const recombination = recombineAcrossDonors({ primitives, maxCandidates: args?.maxCandidates });
  return {
    ...base,
    version: GENESIS_MECHANISM_COMPILER_VERSION,
    primitiveCount: primitives.length,
    variantCount: mutations.reduce((sum, row) => sum + Number(row.variantCount || 0), 0),
    candidateCount: recombination?.ok ? recombination.candidateCount : 0,
    primitives,
    variants: mutations.flatMap(row => row.variants || []),
    candidates: recombination?.ok ? recombination.candidates : []
  };
}
