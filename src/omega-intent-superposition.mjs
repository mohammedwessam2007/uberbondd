import crypto from 'node:crypto';
import { ZERO_EXTERNAL_EFFECTS } from './effect-ledgers.mjs';

export const OMEGA_INTENT_SUPERPOSITION_VERSION = 'uberbond.omega-intent-superposition.v1';
const EFFECTS = new Set(['NONE', 'READ_ONLY', 'CONSEQUENTIAL']);
const envelope = extra => ({ businessEffectAuthority: 'NONE', externalEffectAuthority: 'NONE', externalEffectLedger: structuredClone(ZERO_EXTERNAL_EFFECTS), ...extra });
const fail = reasons => envelope({ ok: false, status: 'OMEGA_INTENT_SUPERPOSITION_REFUSED', version: OMEGA_INTENT_SUPERPOSITION_VERSION, reasonCodes: [...new Set(reasons)] });
const text = (value, max = 1000) => { const out = String(value ?? '').trim(); return out && out.length <= max ? out : null; };
const stable = value => Array.isArray(value) ? value.map(stable) : value && typeof value === 'object' ? Object.fromEntries(Object.keys(value).sort().map(key => [key, stable(value[key])])) : value;
const digest = value => crypto.createHash('sha256').update(JSON.stringify(stable(value))).digest('hex');

function normalizeInterpretation(raw) {
  const id = text(raw?.id, 120);
  const terminalContract = text(raw?.terminalContract, 2000);
  if (!id || !terminalContract || !Array.isArray(raw?.actions) || raw.actions.length > 128) return null;
  const actions = [];
  const ids = new Set();
  for (const item of raw.actions) {
    const actionId = text(item?.id, 160);
    const effectClass = String(item?.effectClass || '');
    const contract = text(item?.contract, 1000);
    if (!actionId || ids.has(actionId) || !EFFECTS.has(effectClass) || !contract) return null;
    ids.add(actionId);
    actions.push({ id: actionId, effectClass, contract, actionHash: digest({ id: actionId, effectClass, contract }) });
  }
  actions.sort((a, b) => a.actionHash.localeCompare(b.actionHash));
  return { id, terminalContract, terminalContractHash: digest(terminalContract), actions };
}

export function compileIntentSuperposition({ interpretations = [] } = {}) {
  if (!Array.isArray(interpretations) || !interpretations.length || interpretations.length > 16) return fail(['interpretations-required']);
  const normalized = interpretations.map(normalizeInterpretation);
  if (normalized.some(row => !row)) return fail(['invalid-interpretation']);
  if (new Set(normalized.map(row => row.id)).size !== normalized.length) return fail(['duplicate-interpretation-id']);

  const actionMaps = normalized.map(row => new Map(row.actions.map(action => [action.actionHash, action])));
  const commonHashes = [...actionMaps[0].keys()].filter(hash => actionMaps.every(map => map.has(hash))).sort();
  const commonActions = commonHashes.map(hash => actionMaps[0].get(hash));
  const reversibleIntersection = commonActions.filter(action => action.effectClass === 'NONE' || action.effectClass === 'READ_ONLY');
  const allCommon = new Set(commonHashes);
  const divergentActions = normalized.map(row => ({
    interpretationId: row.id,
    actions: row.actions.filter(action => !allCommon.has(action.actionHash))
  }));
  const terminalContractsDiverge = new Set(normalized.map(row => row.terminalContractHash)).size > 1;
  const consequentialDivergence = divergentActions.some(row => row.actions.some(action => action.effectClass === 'CONSEQUENTIAL'));
  const requiresFounderResolution = normalized.length > 1 && (terminalContractsDiverge || consequentialDivergence);

  return envelope({
    ok: true,
    status: requiresFounderResolution ? 'OMEGA_INTENT_SUPERPOSITION_OPEN' : 'OMEGA_INTENT_SUPERPOSITION_NONCONSEQUENTIAL',
    version: OMEGA_INTENT_SUPERPOSITION_VERSION,
    interpretations: normalized,
    reversibleIntersection,
    divergentActions,
    terminalContractsDiverge,
    consequentialDivergence,
    requiresFounderResolution,
    allowedBeforeResolution: reversibleIntersection.map(action => action.actionHash),
    founderResolutionAuthority: 'WESSAM_ONLY',
    truthBoundary: 'This compiler preserves caller-supplied interpretations and finds their exact reversible action intersection. It does not infer that the interpretations are exhaustive, assign probabilities, resolve semantic ambiguity, or authorize consequential actions.'
  });
}
