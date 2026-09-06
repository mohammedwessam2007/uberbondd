import crypto from 'node:crypto';
import { ZERO_EXTERNAL_EFFECTS } from './effect-ledgers.mjs';

export const GAMECHANGER_INTEGRATION_BRIDGE_VERSION = 'uberbond.gamechanger-integration-bridge-1.0.0';
const ATTENTION = new Set(['RESEARCH','ATOMIZE','EXPERIMENT_CANDIDATE']);
const ID = /^[a-z0-9][a-z0-9._-]{1,199}$/;
const STOP = new Set(['the','a','an','and','or','for','to','of','in','on','with','from','into','by','as','is','are','be','agent','agents','uberbond','capability']);

const clone = value => structuredClone(value);
const digest = value => crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
const clean = (value, max = 4000) => String(value ?? '').trim().slice(0, max);
const zeroEffects = () => clone(ZERO_EXTERNAL_EFFECTS);
function fail(reasonCodes, extra = {}) {
  return { ok:false, status:'GAMECHANGER_INTEGRATION_DENIED', reasonCodes:[...new Set(reasonCodes.filter(Boolean))], businessEffectAuthority:'NONE', externalEffectLedger:zeroEffects(), ...extra };
}
function words(value) {
  return new Set(clean(value, 12000).toLowerCase().replace(/https?:\/\/\S+/g,' ').replace(/[^a-z0-9]+/g,' ').split(/\s+/).filter(x => x.length > 2 && !STOP.has(x)));
}
function tokenSimilarity(a, b) {
  const left = words(a), right = words(b);
  if (!left.size || !right.size) return 0;
  let overlap = 0;
  for (const token of left) if (right.has(token)) overlap += 1;
  return Number((overlap / Math.min(left.size, right.size)).toFixed(4));
}
function primaryEvidence(candidate) {
  const tiers = Array.isArray(candidate?.sourceTiers) ? candidate.sourceTiers : [];
  return tiers.some(tier => ['PRIMARY_OFFICIAL','PRIMARY_RESEARCH','OPEN_SOURCE_ORIGINAL'].includes(tier));
}

export function normalizeManualGamechangerSeed(input = {}) {
  const id = clean(input.id, 200).toLowerCase();
  const title = clean(input.title, 1000);
  const mechanism = clean(input.mechanism, 4000);
  const attentionState = clean(input.attentionState, 80).toUpperCase();
  const evidenceState = clean(input.evidenceState || 'CHAT_RESEARCH_REQUIRES_PRIMARY_REBINDING', 120).toUpperCase();
  const keywords = Array.isArray(input.keywords) ? [...new Set(input.keywords.map(x => clean(x, 160).toLowerCase()).filter(Boolean))].slice(0, 32) : null;
  const smallestExperiment = clean(input.smallestExperiment, 4000);
  const reasonCodes = [];
  if (!id || !ID.test(id)) reasonCodes.push('valid-seed-id-required');
  if (!title) reasonCodes.push('seed-title-required');
  if (!mechanism) reasonCodes.push('seed-mechanism-required');
  if (!ATTENTION.has(attentionState)) reasonCodes.push('research-atomize-or-experiment-attention-required');
  if (!keywords || keywords.length === 0) reasonCodes.push('seed-keywords-required');
  if (!smallestExperiment) reasonCodes.push('smallest-experiment-required');
  if (reasonCodes.length) return fail(reasonCodes);
  return { ok:true, seed:{ id, title, mechanism, attentionState, evidenceState, keywords, smallestExperiment } };
}

function capabilityIndex(records = []) {
  if (!Array.isArray(records)) return [];
  return records.slice(0, 5000).map(record => {
    const atoms = Array.isArray(record?.capabilityAtoms) ? record.capabilityAtoms.map(atom => atom?.id).filter(Boolean) : [];
    const tasks = Array.isArray(record?.taskClasses) ? record.taskClasses : [];
    const labels = [record?.id, record?.canonicalIdentity, ...atoms, ...tasks].filter(Boolean).map(String);
    return { id: clean(record?.id || record?.canonicalIdentity, 240), labels, searchText:labels.join(' ') };
  }).filter(item => item.id);
}
function knownCapabilityMatches(text, index) {
  return index.map(item => ({ id:item.id, score:tokenSimilarity(text, item.searchText), labels:item.labels.slice(0, 12) }))
    .filter(item => item.score >= 0.25)
    .sort((a,b) => b.score - a.score || a.id.localeCompare(b.id))
    .slice(0, 5);
}
function liveBlob(candidate) {
  const o = candidate?.observation || {};
  return [o.title,o.summary,...(o.claims || []),...(o.domains || [])].filter(Boolean).join(' ');
}
function seedLiveMatch(seed, candidate) {
  const blob = liveBlob(candidate).toLowerCase();
  const phraseHits = seed.keywords.filter(keyword => blob.includes(keyword));
  const similarity = tokenSimilarity(`${seed.title} ${seed.mechanism} ${seed.keywords.join(' ')}`, blob);
  const phraseRatio = seed.keywords.length ? phraseHits.length / seed.keywords.length : 0;
  const confidence = Number(Math.max(similarity, phraseRatio).toFixed(4));
  const matched = phraseHits.length >= Math.min(2, seed.keywords.length) || similarity >= 0.35;
  return { matched, confidence, phraseHits };
}
function liveEntry(candidate, id, title, mechanism, smallestExperiment, capIndex, evidenceState='LIVE_PUBLIC_EVIDENCE_MATCHED_NOT_ECONOMIC_PROOF') {
  const blob = liveBlob(candidate);
  const capabilityMatches = knownCapabilityMatches(`${title} ${mechanism} ${blob}`, capIndex);
  const evidenceQuality = Number(candidate?.dimensions?.evidenceQuality ?? 0);
  const sourceTrust = Number(candidate?.sourceTrust ?? 0);
  const attentionState = ATTENTION.has(candidate?.attentionState) ? candidate.attentionState : 'RESEARCH';
  const engineeringEligible = attentionState === 'EXPERIMENT_CANDIDATE' && evidenceQuality >= 70 && sourceTrust >= 70 && primaryEvidence(candidate);
  return {
    canonicalMechanismId:id,
    title,
    mechanism,
    attentionState,
    queueState:engineeringEligible ? 'BOUNDED_EXPERIMENT_READY_FOR_PROPOSAL' : attentionState === 'ATOMIZE' ? 'ATOMIZATION_REQUIRED' : 'RESEARCH_REQUIRED',
    evidenceState,
    score:Number(candidate?.score ?? 0),
    dimensions:clone(candidate?.dimensions || {}),
    sourceTrust,
    evidenceQuality,
    liveFingerprint:candidate?.fingerprint || null,
    evidenceRefs:clone(candidate?.evidenceRefs || candidate?.observation?.evidenceRefs || []),
    corroboratingSourceIds:clone(candidate?.corroboratingSourceIds || []),
    possibleExistingCapabilityMatches:capabilityMatches,
    mappingState:capabilityMatches.length ? 'POSSIBLE_EXISTING_CAPABILITY_ADJACENCY' : 'NO_DETERMINISTIC_EXISTING_CAPABILITY_MATCH_FOUND',
    smallestExperiment,
    requiredNextStep:engineeringEligible ? smallestExperiment : attentionState === 'ATOMIZE' ? 'ATOMIZE_AGAINST_CURRENT_CAPABILITY_GENOME_THEN_RESEARCH_GAPS' : 'SKEPTICAL_MULTI_SOURCE_RESEARCH_AND_PRIMARY_EVIDENCE_REBINDING',
    engineeringEligible,
    economicProof:'NONE',
    implementationProof:'NONE',
    promotionAuthority:'NONE',
    executableAuthority:'NONE',
    businessEffectAuthority:'NONE'
  };
}

export function buildGamechangerIntegrationQueue({ meshReceipt, manualSeeds = [], capabilityRecords = [], priorState = {} } = {}) {
  const live = Array.isArray(meshReceipt?.tournament?.escalations) ? meshReceipt.tournament.escalations : [];
  if (!meshReceipt || typeof meshReceipt !== 'object') return fail(['gamechanger-mesh-receipt-required']);
  if (!Array.isArray(manualSeeds) || manualSeeds.length > 1000) return fail(['bounded-manual-seeds-required']);
  const normalizedSeeds = [];
  for (const raw of manualSeeds) {
    const normalized = normalizeManualGamechangerSeed(raw);
    if (!normalized.ok) return fail(normalized.reasonCodes.map(code => `seed:${code}`));
    normalizedSeeds.push(normalized.seed);
  }
  const capIndex = capabilityIndex(capabilityRecords);
  const entries = [];
  const consumedFingerprints = new Set();
  for (const seed of normalizedSeeds) {
    let best = null;
    for (const candidate of live) {
      const match = seedLiveMatch(seed, candidate);
      if (!match.matched) continue;
      if (!best || match.confidence > best.match.confidence || (match.confidence === best.match.confidence && Number(candidate.score || 0) > Number(best.candidate.score || 0))) best = { candidate, match };
    }
    if (best) {
      consumedFingerprints.add(best.candidate.fingerprint);
      const entry = liveEntry(best.candidate, seed.id, seed.title, seed.mechanism, seed.smallestExperiment, capIndex);
      entry.seedEvidenceState = seed.evidenceState;
      entry.liveMatchConfidence = best.match.confidence;
      entry.liveKeywordHits = best.match.phraseHits;
      entries.push(entry);
    } else {
      const capabilityMatches = knownCapabilityMatches(`${seed.title} ${seed.mechanism} ${seed.keywords.join(' ')}`, capIndex);
      entries.push({
        canonicalMechanismId:seed.id,
        title:seed.title,
        mechanism:seed.mechanism,
        attentionState:seed.attentionState,
        queueState:'PRIMARY_EVIDENCE_REBINDING_REQUIRED',
        evidenceState:seed.evidenceState,
        score:null,
        dimensions:{},
        sourceTrust:0,
        evidenceQuality:0,
        liveFingerprint:null,
        evidenceRefs:[],
        corroboratingSourceIds:[],
        possibleExistingCapabilityMatches:capabilityMatches,
        mappingState:capabilityMatches.length ? 'POSSIBLE_EXISTING_CAPABILITY_ADJACENCY' : 'NO_DETERMINISTIC_EXISTING_CAPABILITY_MATCH_FOUND',
        smallestExperiment:seed.smallestExperiment,
        requiredNextStep:'REBIND_TO_CURRENT_PRIMARY_OR_ORIGINAL_RESEARCH_EVIDENCE_BEFORE_ENGINEERING',
        engineeringEligible:false,
        economicProof:'NONE',
        implementationProof:'NONE',
        promotionAuthority:'NONE',
        executableAuthority:'NONE',
        businessEffectAuthority:'NONE'
      });
    }
  }
  for (const candidate of live) {
    if (consumedFingerprints.has(candidate.fingerprint)) continue;
    const id = `live-${String(candidate.fingerprint || digest(candidate)).slice(0,24)}`;
    entries.push(liveEntry(candidate, id, clean(candidate?.observation?.title,1000) || id, clean(candidate?.observation?.summary,4000) || 'Live Gamechanger candidate awaiting atomization.', 'Run the smallest bounded synthetic experiment that tests the claimed capability while preserving zero external effects.', capIndex));
  }
  const priorEntries = Array.isArray(priorState?.entries) ? priorState.entries : [];
  const currentIds = new Set(entries.map(entry => entry.canonicalMechanismId));
  for (const prior of priorEntries) if (prior?.canonicalMechanismId && !currentIds.has(prior.canonicalMechanismId)) entries.push({ ...clone(prior), carriedForward:true, queueState:prior.queueState || 'CARRIED_FORWARD' });
  entries.sort((a,b) => Number(b.engineeringEligible) - Number(a.engineeringEligible) || ({EXPERIMENT_CANDIDATE:3,ATOMIZE:2,RESEARCH:1}[b.attentionState] || 0) - ({EXPERIMENT_CANDIDATE:3,ATOMIZE:2,RESEARCH:1}[a.attentionState] || 0) || Number(b.score || 0) - Number(a.score || 0) || a.canonicalMechanismId.localeCompare(b.canonicalMechanismId));
  const queue = {
    schemaVersion:'uberbond.gamechanger-integration-queue.v1',
    bridgeVersion:GAMECHANGER_INTEGRATION_BRIDGE_VERSION,
    generatedAt:new Date().toISOString(),
    liveEscalationCount:live.length,
    manualSeedCount:normalizedSeeds.length,
    capabilityRecordCount:Array.isArray(capabilityRecords) ? capabilityRecords.length : 0,
    queueCount:entries.length,
    engineeringEligibleCount:entries.filter(entry => entry.engineeringEligible).length,
    entries,
    promotionAuthority:'NONE',
    executableAuthority:'NONE',
    commercialTruthAuthority:'NONE',
    truthBoundary:'GAMECHANGER_SIGNAL_OR_CHAT_RESEARCH_SEED_IS_NOT_IMPLEMENTATION_PROOF_ECONOMIC_PROOF_OR_PROMOTION_AUTHORITY'
  };
  return { ok:true, status:'GAMECHANGER_INTEGRATION_QUEUE_READY', queue, queueDigest:digest(queue), businessEffectAuthority:'NONE', externalEffectLedger:zeroEffects() };
}
