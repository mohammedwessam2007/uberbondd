// Business-mechanism atoms and bounded recombination hypotheses.
//
// This lab works only on caller-supplied structured genomes/evidence. It does
// not scrape the internet, copy a competitor, infer demand, estimate revenue,
// or promote a hypothesis to a business. Combinations are deliberately marked
// unproven until a separate commercial experiment produces canonical outcomes.

import crypto from 'node:crypto';

export const MECHANISM_LAB_POLICY_VERSION = 'mechanism-lab-1.0.0';
export const MECHANISM_ATOM_TYPES = Object.freeze([
  'BUYER', 'PAIN', 'VALUE', 'ACQUISITION', 'TRUST', 'PRICING', 'PAYMENT',
  'FULFILLMENT', 'RECURRENCE', 'RETENTION', 'EXPANSION', 'PARTNER_LEVERAGE',
  'DATA_MOAT', 'AUTOMATION', 'PLATFORM_DEPENDENCY', 'REGULATION'
]);
export const MECHANISM_LAB_EXTERNAL_EFFECTS = Object.freeze({
  providerCalls: 0,
  messages: 0,
  purchases: 0,
  deployments: 0,
  credentialChanges: 0,
  dnsChanges: 0,
  productionMutations: 0,
  spendCents: 0
});

const MAX_ATOMS = 100;
const MAX_CANDIDATES = 25;

function atDate(value) {
  const date = value instanceof Date ? value : new Date(value || Date.now());
  return Number.isNaN(date.getTime()) ? new Date() : date;
}

function digest(value) {
  return crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

function text(value, max = 600) {
  return String(value ?? '').trim().slice(0, max);
}

function strings(values, max = 40) {
  if (!Array.isArray(values)) return [];
  return [...new Set(values.map(value => text(value, 240)).filter(Boolean))].slice(0, max);
}

function evidenceRefs(values) {
  return strings(values, 100).filter(value => /^(evidence|audit|test|doc|outcome|signal|opportunity|experiment|receipt):/i.test(value));
}

function failed(reasonCodes, timestamp) {
  return {
    ok: false,
    policyVersion: MECHANISM_LAB_POLICY_VERSION,
    status: 'REVIEW_REQUIRED',
    timestamp,
    reasonCodes: [...new Set(reasonCodes.filter(Boolean))],
    externalEffectLedger: { ...MECHANISM_LAB_EXTERNAL_EFFECTS }
  };
}

function normalizeEvidenceClass(value) {
  const allowed = ['VERIFIED_FACT', 'STRONG_EVIDENCE', 'SUPPORTED_INFERENCE', 'WEAK_SIGNAL', 'HYPOTHESIS', 'SYNTHETIC_TEST_FIXTURE', 'UNRESOLVED'];
  const normalized = String(value || '').toUpperCase();
  return allowed.includes(normalized) ? normalized : 'UNRESOLVED';
}

export function compileMechanismAtom({
  atomId,
  type,
  description,
  sourceModelId,
  evidenceRefs: suppliedEvidenceRefs = [],
  evidenceClass,
  inputs = [],
  outputs = [],
  recurrence,
  automationPotential,
  risks = [],
  date = new Date()
} = {}) {
  const reference = atDate(date);
  const timestamp = reference.toISOString();
  const normalizedType = String(type || '').toUpperCase();
  const refs = evidenceRefs(suppliedEvidenceRefs);
  const cleanDescription = text(description, 800);
  const reasons = [];
  if (!text(atomId, 120)) reasons.push('atom-id-required');
  if (!MECHANISM_ATOM_TYPES.includes(normalizedType)) reasons.push('known-atom-type-required');
  if (!cleanDescription) reasons.push('atom-description-required');
  if (!refs.length) reasons.push('evidence-references-required');
  if (refs.length !== strings(suppliedEvidenceRefs, 100).length) reasons.push('evidence-reference-format-invalid');
  if (reasons.length) return failed(reasons, timestamp);
  const identity = {
    type: normalizedType,
    description: cleanDescription,
    sourceModelId: text(sourceModelId, 120) || null,
    evidenceRefs: refs,
    evidenceClass: normalizeEvidenceClass(evidenceClass),
    inputs: strings(inputs),
    outputs: strings(outputs),
    recurrence: text(recurrence, 300) || 'UNKNOWN',
    automationPotential: text(automationPotential, 300) || 'UNKNOWN',
    risks: strings(risks)
  };
  return {
    ok: true,
    policyVersion: MECHANISM_LAB_POLICY_VERSION,
    atomId: text(atomId, 120),
    status: 'EVIDENCE_REFERENCED_NOT_PROMOTED',
    createdAt: timestamp,
    ...identity,
    externalEffectLedger: { ...MECHANISM_LAB_EXTERNAL_EFFECTS }
  };
}

const GENOME_FIELDS = Object.freeze([
  ['buyer', 'BUYER'], ['pain', 'PAIN'], ['value', 'VALUE'],
  ['acquisition', 'ACQUISITION'], ['trust', 'TRUST'], ['pricing', 'PRICING'],
  ['paymentTiming', 'PAYMENT'], ['fulfillment', 'FULFILLMENT'],
  ['recurringTrigger', 'RECURRENCE'], ['retention', 'RETENTION'],
  ['expansion', 'EXPANSION'], ['partnerMultiplier', 'PARTNER_LEVERAGE'],
  ['dataAsset', 'DATA_MOAT'], ['automationPotential', 'AUTOMATION'],
  ['platformDependency', 'PLATFORM_DEPENDENCY'], ['regulatoryBurden', 'REGULATION']
]);

// Extract only from structured genome fields supplied by the caller. Missing
// fields stay missing; the function never invents a buyer, price, or proof.
export function extractMechanismAtoms({ modelId, genome, evidenceRefs: suppliedEvidenceRefs = [], maxAtoms = MAX_ATOMS, date = new Date() } = {}) {
  const reference = atDate(date);
  const timestamp = reference.toISOString();
  if (!genome || typeof genome !== 'object') return failed(['structured-genome-required'], timestamp);
  const refs = evidenceRefs(suppliedEvidenceRefs);
  if (!refs.length) return {
    ok: true,
    policyVersion: MECHANISM_LAB_POLICY_VERSION,
    status: 'NO_EVIDENCED_ATOMS',
    timestamp,
    modelId: text(modelId, 120) || null,
    atoms: [],
    missingEvidence: true,
    externalEffectLedger: { ...MECHANISM_LAB_EXTERNAL_EFFECTS }
  };
  const limit = Number.isInteger(maxAtoms) ? Math.max(0, Math.min(MAX_ATOMS, maxAtoms)) : MAX_ATOMS;
  const atoms = [];
  for (const [field, type] of GENOME_FIELDS) {
    if (atoms.length >= limit) break;
    const raw = genome[field];
    const description = raw && typeof raw === 'object' ? (raw.description || raw.value || raw.name) : raw;
    if (!text(description)) continue;
    const atom = compileMechanismAtom({
      atomId: `atom:${text(modelId, 80) || 'model'}:${field}`,
      type, description, sourceModelId: modelId,
      evidenceRefs: refs, evidenceClass: raw?.evidenceClass,
      inputs: raw?.inputs, outputs: raw?.outputs,
      recurrence: raw?.recurrence, automationPotential: raw?.automationPotential,
      risks: raw?.risks, date: reference
    });
    if (atom.ok) atoms.push(atom);
  }
  return {
    ok: true,
    policyVersion: MECHANISM_LAB_POLICY_VERSION,
    status: atoms.length ? 'ATOMS_EXTRACTED_NOT_PROMOTED' : 'NO_STRUCTURED_MECHANISMS_FOUND',
    timestamp,
    modelId: text(modelId, 120) || null,
    atoms,
    extractedCount: atoms.length,
    boundedCount: Math.min(atoms.length, limit),
    missingEvidence: false,
    externalEffectLedger: { ...MECHANISM_LAB_EXTERNAL_EFFECTS }
  };
}

export function recombineMechanismAtoms({ atoms = [], buyer, objective, maxCandidates = MAX_CANDIDATES, date = new Date() } = {}) {
  const reference = atDate(date);
  const timestamp = reference.toISOString();
  if (!Array.isArray(atoms)) return failed(['atoms-array-required'], timestamp);
  const valid = atoms.filter(atom => atom?.ok === true && atom.atomId).slice(0, MAX_ATOMS);
  const limit = Number.isInteger(maxCandidates) ? Math.max(0, Math.min(MAX_CANDIDATES, maxCandidates)) : MAX_CANDIDATES;
  const candidates = [];
  for (let i = 0; i < valid.length && candidates.length < limit; i += 1) {
    for (let j = i + 1; j < valid.length && candidates.length < limit; j += 1) {
      const pair = [valid[i], valid[j]];
      const atomIds = pair.map(atom => atom.atomId).sort();
      const identity = { atomIds, buyer: text(buyer, 240) || 'UNKNOWN', objective: text(objective, 500) || 'UNKNOWN' };
      candidates.push({
        candidateId: `recombination_${digest(identity).slice(0, 24)}`,
        status: 'HYPOTHESIS',
        evidenceStatus: 'UNPROVEN_COMBINATION',
        buyer: identity.buyer,
        objective: identity.objective,
        mechanismAtomIds: atomIds,
        evidenceRefs: evidenceRefs(pair.flatMap(atom => atom.evidenceRefs)),
        pricingHypothesis: null,
        paymentProof: null,
        expectedContributionMarginCents: null,
        killConditions: ['no buyer evidence', 'no cleared payment after bounded experiment', 'unsafe or prohibited mechanism'],
        createdAt: timestamp,
        externalEffectLedger: { ...MECHANISM_LAB_EXTERNAL_EFFECTS }
      });
    }
  }
  return {
    ok: true,
    policyVersion: MECHANISM_LAB_POLICY_VERSION,
    status: candidates.length ? 'HYPOTHESES_GENERATED' : 'NO_VALID_ATOMS',
    timestamp,
    requestedAtomCount: atoms.length,
    usedAtomCount: valid.length,
    candidateCount: candidates.length,
    candidates,
    externalEffectLedger: { ...MECHANISM_LAB_EXTERNAL_EFFECTS }
  };
}

export function redTeamMechanismCandidate({ candidate, contradictions = [], platformDependencies = [], risks = [], date = new Date() } = {}) {
  const reference = atDate(date);
  const timestamp = reference.toISOString();
  if (!candidate || !candidate.candidateId) return failed(['candidate-required'], timestamp);
  const killSignals = [...strings(contradictions), ...strings(platformDependencies), ...strings(risks)].slice(0, 60);
  return {
    ok: true,
    policyVersion: MECHANISM_LAB_POLICY_VERSION,
    candidateId: candidate.candidateId,
    timestamp,
    status: 'REVIEW_REQUIRED',
    killSignals,
    decision: killSignals.length ? 'KILL_OR_REPAIR_REVIEW' : 'CONTINUE_BOUNDED_VALIDATION',
    promotion: 'DISABLED_UNTIL_PAYMENT_AND_ACCEPTED_DELIVERY_PROOF',
    externalEffectLedger: { ...MECHANISM_LAB_EXTERNAL_EFFECTS }
  };
}

export async function logMechanismLabReceipt(store, type, detail) {
  if (!store || typeof store.log !== 'function' || !detail?.ok) return null;
  return store.log(type, {
    policyVersion: detail.policyVersion,
    status: detail.status,
    atomId: detail.atomId || null,
    modelId: detail.modelId || null,
    candidateId: detail.candidateId || null,
    candidateCount: detail.candidateCount ?? null,
    extractedCount: detail.extractedCount ?? null,
    evidenceRefs: detail.evidenceRefs || [],
    killSignals: detail.killSignals || [],
    decision: detail.decision || null,
    timestamp: detail.timestamp || detail.createdAt || null,
    externalEffectLedger: detail.externalEffectLedger
  });
}
