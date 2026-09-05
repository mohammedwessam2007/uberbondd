import crypto from 'node:crypto';
import { ZERO_EXTERNAL_EFFECTS } from './effect-ledgers.mjs';
import { buildUnknownUnknownAgenda } from './perpetual-frontier-genesis.mjs';
import { compileMechanismAtom, recombineMechanismAtoms, redTeamMechanismCandidate } from './mechanism-lab.mjs';
import {
  buildBlindnessLedger,
  runInformationGainMarket,
  launchAntiLocalMaximum,
  detectMissingLaw,
  foundMarketMechanisms,
  discoverCoordinationPrimitives,
  designObservation,
  runTheoryTournament
} from './genesis-final-frontier.mjs';
import { compileCognitiveEvent } from './uberbond-cognitive-bus.mjs';

export const UBERBOND_METACOGNITIVE_SYNTHESIS_POLICY_VERSION = 'uberbond-metacognitive-synthesis-1.0.0';

const ECONOMIC_GENE_ATOM_TYPES = Object.freeze({
  'time-windowed-obligation': 'REGULATION',
  'evidence-precondition': 'TRUST',
  'portfolio-channel-owner': 'PARTNER_LEVERAGE',
  'exception-ledger': 'AUTOMATION',
  'acceptance-mandate': 'FULFILLMENT',
  'service-to-rail': 'RECURRENCE'
});

function zeroEffects() { return structuredClone(ZERO_EXTERNAL_EFFECTS); }
function text(value, max = 3000) { const out = String(value ?? '').trim(); return out && out.length <= max ? out : null; }
function list(value, max = 256) { return Array.isArray(value) ? value.filter(Boolean).slice(0, max) : []; }
function number(value, fallback = 0) { const n = Number(value); return Number.isFinite(n) ? n : fallback; }
function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.keys(value).sort().map(key => [key, stable(value[key])]));
}
function digest(value) { return crypto.createHash('sha256').update(JSON.stringify(stable(value))).digest('hex'); }
function envelope(extra = {}) { return { policyVersion: UBERBOND_METACOGNITIVE_SYNTHESIS_POLICY_VERSION, businessEffectAuthority: 'NONE', externalEffectAuthority: 'NONE', externalEffectLedger: zeroEffects(), ...extra }; }
function fail(reasonCodes, status = 'METACOGNITIVE_SYNTHESIS_BLOCKED', extra = {}) { return envelope({ ok: false, status, reasonCodes: [...new Set(reasonCodes.filter(Boolean))], ...extra }); }

function featureBlindSpots(featureGenome = {}) {
  const fallback = list(featureGenome?.fallbackArtifacts, 64).map(path => `Feature Genome has only fallback semantic classification for ${path}; determine its actual role, consumers, evidence and whether it should remain.`);
  const triage = list(featureGenome?.reachabilityModules, 512)
    .filter(row => ['NEEDS_TRIAGE', 'UNREACHABLE_BUG'].includes(String(row?.category || '').toUpperCase()))
    .slice(0, 64)
    .map(row => `${row.path} is classified ${row.category}: ${text(row.reason, 800) || 'reason unresolved'}`);
  return [...new Set([...fallback, ...triage])].slice(0, 128);
}

function gatedQuestions(featureGenome = {}) {
  const gates = new Map();
  for (const row of list(featureGenome?.reachabilityModules, 2000)) {
    if (!row?.gate) continue;
    if (!gates.has(row.gate)) gates.set(row.gate, []);
    gates.get(row.gate).push(row.path);
  }
  return [...gates.entries()].sort((a, b) => b[1].length - a[1].length).slice(0, 32).map(([gate, paths]) => ({
    id: `gate:${gate}`,
    gate,
    recurrence: paths.length,
    paths: paths.slice(0, 12),
    question: `What lawful substitute, missing capability, new evidence source, architectural redesign, or external proof would reduce dependence on ${gate} without bypassing the gate?`
  }));
}

function readinessAnomalies(featureGenome = {}) {
  return list(featureGenome?.readinessCapabilities, 512)
    .filter(row => !['IMPLEMENTED', 'TEST_VERIFIED'].includes(String(row?.status || '').toUpperCase()) || row?.externalBlocker)
    .slice(0, 64)
    .map(row => `Capability ${row.id} is ${row.status}${row.externalBlocker ? ` with blocker: ${text(row.externalBlocker, 900)}` : ''}.`);
}

function genesisObservations(genesisEvolution = {}, genesisOntology = {}) {
  const unknowns = [];
  const contradictions = [];
  const disagreements = [];
  for (const cycle of list(genesisEvolution?.cycles, 64)) {
    for (const item of list(cycle?.unknownUnknowns?.agenda || cycle?.unknownUnknowns?.unknownUnknowns?.agenda, 32)) {
      if (!item?.observation) continue;
      const kind = String(item.kind || '').toUpperCase();
      if (kind === 'CONTRADICTION') contradictions.push(item.observation);
      else if (kind === 'DISAGREEMENT') disagreements.push(item.observation);
      else unknowns.push(item.observation);
    }
    for (const challenge of list(cycle?.antiUberBond?.challenges, 16)) {
      if (challenge?.counterTheory) contradictions.push(`Anti-UberBond: ${challenge.counterTheory}`);
    }
    if (cycle?.redQueen?.disagreement === true) disagreements.push(`Red Queen evaluators disagree on ${cycle.signalId || 'an unnamed frontier signal'}.`);
  }
  for (const item of list(genesisOntology?.compressedCandidateInsights, 64)) {
    if (item?.statement) unknowns.push(item.statement);
  }
  return {
    unknowns: [...new Set(unknowns)].slice(0, 128),
    contradictions: [...new Set(contradictions)].slice(0, 128),
    disagreements: [...new Set(disagreements)].slice(0, 128)
  };
}

function compileEconomicGeneAtoms(eventHorizon = {}, date = new Date()) {
  const atoms = [];
  for (const gene of list(eventHorizon?.economicGenes, 64)) {
    const type = ECONOMIC_GENE_ATOM_TYPES[String(gene?.id || '')];
    if (!type || !text(gene?.description, 1000)) continue;
    const atom = compileMechanismAtom({
      atomId: `atom:event-horizon:${gene.id}`,
      type,
      description: gene.description,
      sourceModelId: 'event-horizon-economic-genome',
      evidenceRefs: ['doc:event-horizon-economic-genome'],
      evidenceClass: 'SUPPORTED_INFERENCE',
      risks: ['PUBLIC_PROXY_EVIDENCE_NOT_BUYER_DEMAND'],
      date
    });
    if (atom.ok) atoms.push(atom);
  }
  return atoms;
}

function featureFamilyBlindness(featureGenome = {}) {
  const counts = featureGenome?.familyCounts && typeof featureGenome.familyCounts === 'object' ? featureGenome.familyCounts : {};
  const families = list(featureGenome?.featureFamilies, 128);
  const maximum = Math.max(1, ...Object.values(counts).map(value => number(value, 0)));
  return families.filter(row => row.id !== 'general-runtime').map(row => ({
    id: row.id,
    observability: Math.min(100, Math.round((number(counts[row.id], 0) / maximum) * 100)),
    consequence: ['sovereignty-governance', 'truth-evidence', 'business-opportunity-economics', 'payment-accounting', 'security-sandbox-egress'].includes(row.id) ? 95 : 70
  }));
}

function innovationQuestions(agenda = {}) {
  return list(agenda?.agenda, 128).map((item, index) => ({
    id: `unknown:${index + 1}`,
    observation: item.observation,
    expectedInformationGain: item.kind === 'CONTRADICTION' ? 95 : item.kind === 'BLIND_SPOT' ? 90 : 75,
    economicImportance: 80,
    cost: 1,
    questions: item.questions
  }));
}

function compileIdeaEvents({ recombinations = [], unknownAgenda = {}, missingLaws = {}, gateQuestions = [], synthesisRef, date }) {
  const events = [];
  for (const item of list(unknownAgenda?.agenda, 12)) {
    const compiled = compileCognitiveEvent({
      kind: 'ONTOLOGY_CANDIDATE',
      sourceNodeId: 'genesis-ontology',
      subjectType: 'UNKNOWN_UNKNOWN',
      subjectId: `meta-unknown:${digest([item.kind, item.observation]).slice(0, 24)}`,
      summary: `${item.kind}: ${item.observation}. Research before convergence; agenda questions: ${list(item.questions, 4).join(', ')}.`,
      evidenceRefs: [synthesisRef],
      payloadRef: synthesisRef,
      truthClass: 'RESEARCH_ASSET',
      observedAt: date
    });
    if (compiled.ok) events.push(compiled);
  }
  for (const candidate of list(recombinations?.candidates, 12)) {
    const compiled = compileCognitiveEvent({
      kind: 'IDEA_CANDIDATE',
      sourceNodeId: 'idea-generator',
      subjectType: 'MECHANISM_RECOMBINATION',
      subjectId: candidate.candidateId,
      summary: `Mechanism Lab recombination ${candidate.mechanismAtomIds.join(' + ')} is an unproven idea candidate for the north-star objective. Buyer, pricing and payment proof remain unresolved; kill conditions are preserved.`,
      evidenceRefs: [synthesisRef, ...list(candidate.evidenceRefs, 12)],
      payloadRef: synthesisRef,
      truthClass: 'RESEARCH_ASSET',
      observedAt: date
    });
    if (compiled.ok) events.push(compiled);
  }
  for (const law of list(missingLaws?.candidates, 8)) {
    const compiled = compileCognitiveEvent({
      kind: 'GENESIS_HYPOTHESIS',
      sourceNodeId: 'genesis',
      subjectType: 'MISSING_LAW',
      subjectId: `missing-law:${digest(law).slice(0, 24)}`,
      summary: `Repeated unresolved pattern suggests a missing-law research candidate: ${text(law?.question, 1800) || 'determine the hidden invariant or regime rule'}. This is not a discovered law.`,
      evidenceRefs: [synthesisRef],
      payloadRef: synthesisRef,
      truthClass: 'RESEARCH_ASSET',
      observedAt: date
    });
    if (compiled.ok) events.push(compiled);
  }
  for (const gate of gateQuestions.slice(0, 8)) {
    const compiled = compileCognitiveEvent({
      kind: 'CAPABILITY_GAP',
      sourceNodeId: 'capability-genome',
      subjectType: 'REPEATED_ACTIVATION_GATE',
      subjectId: gate.id,
      summary: `${gate.gate} currently gates ${gate.recurrence} repository modules. Research lawful substitutes, capabilities, architectural redesign or external proof; never bypass the gate.`,
      evidenceRefs: [synthesisRef],
      payloadRef: synthesisRef,
      truthClass: 'VERIFIED_CURRENT',
      observedAt: date
    });
    if (compiled.ok) events.push(compiled);
  }
  return events.slice(0, 40);
}

export function synthesizeUberBondMetacognition({
  featureGenome,
  genesisEvolution = null,
  genesisOntology = null,
  eventHorizon = null,
  capabilityGenome = null,
  frontierModelTeam = null,
  date = new Date(),
  synthesisRef = 'artifact:uberbond-metacognitive-synthesis-latest'
} = {}) {
  const reasons = [];
  if (!featureGenome?.ok || !featureGenome?.genomeDigest) reasons.push('valid-feature-genome-required');
  if (!eventHorizon || !Array.isArray(eventHorizon?.economicGenes)) reasons.push('event-horizon-economic-genes-required');
  if (reasons.length) return fail(reasons);
  const at = date instanceof Date ? date : new Date(date);
  if (!Number.isFinite(at.getTime())) return fail(['valid-date-required']);

  const blindSpots = featureBlindSpots(featureGenome);
  const gates = gatedQuestions(featureGenome);
  const anomalies = readinessAnomalies(featureGenome);
  const genesis = genesisObservations(genesisEvolution || {}, genesisOntology || {});
  const modelGaps = list(frontierModelTeam?.roleCoverage?.gaps, 16).map(role => `Frontier model team has no candidate prior covering role ${role}.`);
  const capabilityState = capabilityGenome?.state || {};
  if (String(capabilityGenome?.status || '').includes('UNHEALTHY')) anomalies.push(`Capability Genome is unhealthy: ${list(capabilityGenome?.reasonCodes, 20).join(', ')}`);
  if (number(capabilityState.approvedCapabilityCount, 0) === 0) blindSpots.push('Capability Genome currently has zero approved capabilities; determine which mission-specific capability would create the highest option value before promoting anything.');

  const unknownAgenda = buildUnknownUnknownAgenda({
    anomalies: [...new Set(anomalies)].slice(0, 128),
    contradictions: genesis.contradictions,
    blindSpots: [...new Set([...blindSpots, ...genesis.unknowns, ...modelGaps])].slice(0, 128),
    disagreements: genesis.disagreements,
    maxItems: 128
  });
  if (!unknownAgenda.ok) return fail(unknownAgenda.reasonCodes || ['unknown-agenda-failed']);

  const blindnessLedger = buildBlindnessLedger({ domains: featureFamilyBlindness(featureGenome) });
  const informationMarket = runInformationGainMarket({ questions: innovationQuestions(unknownAgenda) });

  const gatePatterns = gates.map(gate => ({
    id: gate.id,
    recurrences: gate.recurrence,
    unexplainedShare: Math.min(100, Math.round((gate.recurrence / Math.max(1, featureGenome.reachabilityModuleCount || 1)) * 100)),
    paths: gate.paths
  }));
  const missingLaws = detectMissingLaw({ residualPatterns: gatePatterns });

  const geneAtoms = compileEconomicGeneAtoms(eventHorizon, at);
  const recombinations = recombineMechanismAtoms({
    atoms: geneAtoms,
    buyer: 'UNKNOWN_UNTIL_EXTERNAL_BUYER_EVIDENCE',
    objective: 'risk-adjusted cleared contribution profit / founder minute',
    maxCandidates: 15,
    date: at
  });
  const redTeamedRecombinations = list(recombinations?.candidates, 15).map(candidate => redTeamMechanismCandidate({
    candidate,
    contradictions: genesis.contradictions.slice(0, 8),
    platformDependencies: gates.slice(0, 8).map(gate => gate.gate),
    risks: ['NO_BUYER_EVIDENCE', 'NO_CLEARED_PAYMENT_EVIDENCE', 'FEATURE_CLASSIFICATION_MAY_BE_INCOMPLETE'],
    date: at
  }));

  const champion = list(eventHorizon?.tournament, 64).find(candidate => candidate?.status === 'CURRENT_CHAMPION') || {};
  const alternatives = list(eventHorizon?.tournament, 64).filter(candidate => candidate?.id !== champion?.id).slice(0, 12);
  const antiLocalMaximum = launchAntiLocalMaximum({
    champion,
    alternatives,
    plateau: blindSpots.length > 0 || gates.length >= 3
  });

  const marketMechanisms = foundMarketMechanisms({
    objectives: list(eventHorizon?.economicGenes, 16).map(gene => gene.id),
    constraints: gates.slice(0, 12).map(gate => gate.gate)
  });
  const coordination = discoverCoordinationPrimitives({
    failures: gates.slice(0, 16).map(gate => ({ id: gate.id, friction: `${gate.gate} blocks ${gate.recurrence} modules` }))
  });

  const topQuestions = list(informationMarket?.ranked, 12);
  const theories = topQuestions.slice(0, 8).map((question, index) => ({
    id: `theory-${index + 1}`,
    premise: question.observation,
    status: 'HYPOTHESIS'
  }));
  const theoryTournament = runTheoryTournament({ theories, observations: [] });
  const observationDesign = designObservation({
    theories,
    candidateObservations: topQuestions.map(question => ({
      id: `observe:${question.id}`,
      question: question.observation,
      informationGain: question.expectedInformationGain,
      cost: question.cost,
      authority: 'COLLECTION_NOT_AUTHORIZED_BY_THIS_SPEC'
    }))
  });

  const core = {
    schemaVersion: 'uberbond.metacognitive-synthesis.v1',
    generatedAt: at.toISOString(),
    inputs: {
      featureGenomeDigest: featureGenome.genomeDigest,
      genesisEvolutionPresent: Boolean(genesisEvolution),
      genesisOntologyPresent: Boolean(genesisOntology),
      eventHorizonVersion: eventHorizon.schemaVersion || null,
      capabilityGenomeStatus: capabilityGenome?.status || null,
      frontierModelTeamStatus: frontierModelTeam?.status || null
    },
    unknownAgenda,
    blindnessLedger,
    informationMarket,
    repeatedGateQuestions: gates,
    missingLaws,
    mechanismLab: {
      economicGeneAtoms: geneAtoms,
      recombinations,
      redTeamedRecombinations
    },
    antiLocalMaximum,
    marketMechanisms,
    coordination,
    theoryTournament,
    observationDesign,
    hypotheses: {
      ideaCandidateCount: recombinations?.candidateCount || 0,
      unknownUnknownCount: unknownAgenda?.agenda?.length || 0,
      missingLawCandidateCount: missingLaws?.candidates?.length || 0,
      repeatedGateCount: gates.length
    },
    promotionAuthority: 'NONE',
    executionAuthority: 'NONE',
    truthBoundary: 'THIS IS METACOGNITIVE SEARCH. UNKNOWN-UNKNOWN QUESTIONS, MECHANISM RECOMBINATIONS, MISSING-LAW CANDIDATES, MARKET MECHANISMS, THEORIES AND OBSERVATION DESIGNS ARE HYPOTHESES OR INTERNAL RESEARCH PRIORITIES. THEY ARE NOT MARKET DEMAND, CAUSAL TRUTH, APPROVED CAPABILITIES OR AUTHORITY TO EXECUTE.'
  };
  const synthesisDigest = digest(core);
  const events = compileIdeaEvents({ recombinations, unknownAgenda, missingLaws, gateQuestions: gates, synthesisRef, date: at });
  return envelope({
    ok: true,
    status: 'UBERBOND_METACOGNITIVE_SYNTHESIS_READY',
    ...core,
    synthesisDigest,
    events,
    eventCount: events.length
  });
}
