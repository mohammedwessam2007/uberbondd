import crypto from 'node:crypto';
import { ZERO_EXTERNAL_EFFECTS } from './effect-ledgers.mjs';
import { compileCognitiveEvent } from './uberbond-cognitive-bus.mjs';

export const UBERBOND_GENESIS_REACTIVATION_POLICY_VERSION = 'uberbond-genesis-reactivation-1.0.1';

const STOP = new Set(['about','after','again','against','because','before','being','between','could','current','determine','feature','genesis','into','might','other','should','their','there','these','this','through','under','until','using','what','when','where','which','with','without','would']);
function zeroEffects() { return structuredClone(ZERO_EXTERNAL_EFFECTS); }
function text(value, max = 5000) { const out = String(value ?? '').trim(); return out && out.length <= max ? out : null; }
function list(value, max = 1000) { return Array.isArray(value) ? value.filter(Boolean).slice(0, max) : []; }
function digest(value) { return crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex'); }
function tokens(value) {
  return new Set(String(value ?? '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').split(/\s+/).filter(token => token.length >= 4 && !STOP.has(token)));
}
function overlapScore(a, b) {
  let count = 0;
  for (const token of a) if (b.has(token)) count += 1;
  return count;
}

function currentPressureText({ featureGenome = {}, metacognitiveSynthesis = {} } = {}) {
  const pressure = [];
  pressure.push(...list(featureGenome?.fallbackArtifacts, 128));
  for (const row of list(featureGenome?.reachabilityModules, 1000)) {
    if (row?.gate || ['NEEDS_TRIAGE', 'UNREACHABLE_BUG'].includes(String(row?.category || '').toUpperCase())) {
      pressure.push(`${row.path || ''} ${row.gate || ''} ${row.reason || ''}`);
    }
  }
  for (const item of list(metacognitiveSynthesis?.unknownAgenda?.agenda, 128)) pressure.push(item?.observation || '');
  for (const gate of list(metacognitiveSynthesis?.repeatedGateQuestions, 64)) pressure.push(`${gate.gate || ''} ${gate.question || ''}`);
  for (const item of list(metacognitiveSynthesis?.blindnessLedger?.blindSpots, 64)) pressure.push(JSON.stringify(item));
  return pressure.filter(Boolean).join('\n');
}

export function rankGenesisIdeasForCurrentGaps({ featureAtlas, featureGenome = {}, metacognitiveSynthesis = {}, limit = 20 } = {}) {
  if (!featureAtlas?.ok || !Array.isArray(featureAtlas?.classes?.genesisIdeas)) {
    return { ok: false, status: 'GENESIS_REACTIVATION_BLOCKED', reasonCodes: ['valid-feature-atlas-required'], businessEffectAuthority: 'NONE', externalEffectLedger: zeroEffects() };
  }
  const currentText = currentPressureText({ featureGenome, metacognitiveSynthesis });
  const currentTokens = tokens(currentText);
  const cap = Number.isSafeInteger(Number(limit)) ? Math.max(1, Math.min(100, Number(limit))) : 20;
  const ranked = featureAtlas.classes.genesisIdeas.map(idea => {
    const ideaTokens = tokens(`${idea.name || ''} ${idea.implementationNote || ''}`);
    const overlap = overlapScore(ideaTokens, currentTokens);
    const partialBonus = idea.maturity === 'PARTIAL_PRIMITIVE' ? 2 : 0;
    const noRuntimeBonus = list(idea.runtimeReceipts, 32).length === 0 ? 1 : 0;
    const missingPathPenalty = list(idea.missingPaths, 32).length > 0 ? -2 : 0;
    // Maturity is only a prior among semantically relevant ideas. It must never
    // create a candidate by itself, otherwise unrelated partial primitives can
    // look active merely because they are unfinished or lack runtime receipts.
    const score = overlap > 0 ? Math.max(1, overlap * 5 + partialBonus + noRuntimeBonus + missingPathPenalty) : 0;
    return {
      id: idea.id,
      ordinal: idea.ordinal,
      name: idea.name,
      score,
      tokenOverlap: overlap,
      maturity: idea.maturity,
      implementationStatus: idea.implementationStatus,
      implementationSources: idea.implementationSources,
      implementationTests: idea.implementationTests,
      runtimeReceipts: idea.runtimeReceipts,
      missingPaths: idea.missingPaths,
      implementationNote: idea.implementationNote,
      recommendation: score > 0 ? 'RESEARCH_REACTIVATION_CANDIDATE' : 'NO_CURRENT_MATCH',
      activationAuthority: 'NONE'
    };
  }).filter(item => item.score > 0).sort((a, b) => b.score - a.score || a.ordinal - b.ordinal).slice(0, cap);
  return {
    ok: true,
    policyVersion: UBERBOND_GENESIS_REACTIVATION_POLICY_VERSION,
    status: ranked.length ? 'GENESIS_REACTIVATION_CANDIDATES_READY' : 'NO_RELEVANT_GENESIS_REACTIVATION',
    pressureDigest: digest(currentText),
    pressureTokenCount: currentTokens.size,
    candidates: ranked,
    candidateCount: ranked.length,
    businessEffectAuthority: 'NONE',
    externalEffectLedger: zeroEffects(),
    truthBoundary: 'REACTIVATION REQUIRES TOKEN ASSOCIATION TO A CURRENT INTERNAL GAP; MATURITY AND RUNTIME-RECEIPT STATE ONLY RANK ALREADY-MATCHED IDEAS. IT IS A SEARCH HEURISTIC, NOT EVIDENCE OF CAUSAL RELEVANCE, IMPLEMENTATION VALUE, MARKET DEMAND OR EXECUTION AUTHORITY.'
  };
}

export function compileGenesisReactivationEvents(result, { ref = 'artifact:uberbond-genesis-reactivation-latest', date = new Date() } = {}) {
  if (!result?.ok) return { ok: false, status: 'GENESIS_REACTIVATION_EVENTS_BLOCKED', reasonCodes: ['valid-reactivation-result-required'], events: [] };
  const events = [];
  for (const candidate of list(result.candidates, 8)) {
    const event = compileCognitiveEvent({
      kind: 'GENESIS_HYPOTHESIS',
      sourceNodeId: 'genesis-evolution',
      subjectType: 'REACTIVATED_GENESIS_IDEA',
      subjectId: candidate.id,
      summary: `Reactivation candidate #${candidate.ordinal} ${candidate.name} matched current UberBond gaps with heuristic score ${candidate.score}. Maturity ${candidate.maturity || 'unknown'}, implementation status ${candidate.implementationStatus || 'unknown'}. Re-evaluate relevance and evidence before building; token association is not proof.`,
      evidenceRefs: [ref, ...list(candidate.implementationSources, 8).map(source => `doc:${source}`)],
      payloadRef: ref,
      truthClass: 'RESEARCH_ASSET',
      observedAt: date
    });
    if (event.ok) events.push(event);
  }
  return { ok: true, status: 'GENESIS_REACTIVATION_EVENTS_READY', events, eventCount: events.length, businessEffectAuthority: 'NONE', externalEffectLedger: zeroEffects() };
}
