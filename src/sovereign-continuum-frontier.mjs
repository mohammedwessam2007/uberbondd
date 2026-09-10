import { compileAgentTask } from './agent-relay.mjs';
import { ZERO_EXTERNAL_EFFECTS } from './effect-ledgers.mjs';

export const SOVEREIGN_CONTINUUM_FRONTIER_VERSION = 'uberbond.sovereign-continuum-frontier.v1';
const SHA40 = /^[a-f0-9]{40}$/i;
const ALLOWED_EVIDENCE = new Set(['SOURCE_AND_TEST_PRESENT', 'OBSERVED_INTERNAL_RUNTIME_RECEIPT']);
const zeroEffects = () => structuredClone(ZERO_EXTERNAL_EFFECTS);
const text = (value, max = 1000) => String(value ?? '').trim().slice(0, max);
const uniq = values => [...new Set((Array.isArray(values) ? values : []).map(value => text(value, 1200)).filter(Boolean))];
function fail(reasonCodes, status = 'SOVEREIGN_CONTINUUM_FRONTIER_REFUSED', extra = {}) {
  return { ok:false, policyVersion:SOVEREIGN_CONTINUUM_FRONTIER_VERSION, status, reasonCodes:uniq(reasonCodes), businessEffectAuthority:'NONE', externalEffectAuthority:'NONE', externalEffectLedger:zeroEffects(), ...extra };
}
function exactSha(value) { const v = text(value, 80).toLowerCase(); return SHA40.test(v) ? v : null; }
function finiteClosedForBase(finiteDirective, base) {
  return finiteDirective?.ok === true
    && finiteDirective?.status === 'FINITE_ENGINEERING_ALREADY_CLOSED'
    && finiteDirective?.taskRequired === false
    && exactSha(finiteDirective?.baseRevision) === base;
}
function candidateRows(ledger) {
  if (ledger?.ok !== true || ledger?.status !== 'GENESIS_EVIDENCE_LEDGER_READY' || Number(ledger?.ideaCount) !== 275 || !Array.isArray(ledger?.entries) || ledger.entries.length !== 275) return null;
  const ids=ledger.entries.map(row=>Number(row?.id));
  if(ids.some(id=>!Number.isSafeInteger(id)||id<1||id>275)||new Set(ids).size!==275)return null;
  return ledger.entries.filter(row => row?.maturity === 'PARTIAL_PRIMITIVE'
    && ALLOWED_EVIDENCE.has(String(row?.status || ''))
    && Array.isArray(row?.sources) && row.sources.length > 0
    && Array.isArray(row?.tests) && row.tests.length > 0)
    .map(row => ({ id:Number(row.id), name:text(row.name, 500), maturity:row.maturity, status:row.status, sources:uniq(row.sources), tests:uniq(row.tests), note:text(row.note, 2000) }))
    .filter(row => row.name && row.sources.length && row.tests.length)
    .sort((a,b) => a.id - b.id);
}
function nextAfter(candidates, afterTargetId) {
  const after = Number(afterTargetId);
  if (!Number.isSafeInteger(after)) return candidates[0] || null;
  return candidates.find(row => row.id > after) || candidates[0] || null;
}

export function compileSovereignContinuumFrontierDirective({ baseRevision, finiteDirective, genesisLedger, afterTargetId = null } = {}) {
  const base = exactSha(baseRevision);
  if (!base) return fail(['exact-main-base-revision-required']);
  if (!finiteClosedForBase(finiteDirective, base)) return fail(['exact-base-finite-engineering-closure-required']);
  const candidates = candidateRows(genesisLedger);
  if (!candidates) return fail(['exact-current-genesis-evidence-ledger-required']);
  if (!candidates.length) {
    return {
      ok:true,
      policyVersion:SOVEREIGN_CONTINUUM_FRONTIER_VERSION,
      status:'CONTINUUM_FRONTIER_AWAITS_NEW_EVIDENCE',
      baseRevision:base,
      taskRequired:false,
      frontierCandidateCount:0,
      targetId:null,
      targetName:null,
      businessEffectAuthority:'NONE',
      externalEffectAuthority:'NONE',
      externalEffectLedger:zeroEffects(),
      truthBoundary:'Declared finite engineering is closed and no PARTIAL_PRIMITIVE with current source/test evidence is available. The controller stops rather than inventing code merely to remain busy. New evidence, a new main, or separately governed Ontogenesis may open another bounded frontier.'
    };
  }
  const target = nextAfter(candidates, afterTargetId);
  return {
    ok:true,
    policyVersion:SOVEREIGN_CONTINUUM_FRONTIER_VERSION,
    status:'CONTINUUM_FRONTIER_TARGET_READY',
    baseRevision:base,
    taskRequired:true,
    repairMode:'CONTINUUM_FRONTIER',
    targetId:target.id,
    targetName:target.name,
    targetStatus:target.status,
    targetMaturity:target.maturity,
    targetSources:target.sources,
    targetTests:target.tests,
    targetNote:target.note,
    frontierCandidateCount:candidates.length,
    businessEffectAuthority:'NONE',
    externalEffectAuthority:'NONE',
    externalEffectLedger:zeroEffects(),
    truthBoundary:'This target is a bounded post-finite engineering frontier selected from exact-current declared GENESIS evidence. PARTIAL_PRIMITIVE is not a failure and source/test presence is not proof. The task may strengthen behavior only; it may not relabel maturity, rewrite canon, widen authority, or manufacture runtime/commercial/life truth.'
  };
}

export function compileSovereignContinuumFrontierTask({ directive, date = new Date() } = {}) {
  const base = exactSha(directive?.baseRevision);
  const id = Number(directive?.targetId);
  const name = text(directive?.targetName, 500);
  if (!directive?.ok || directive?.status !== 'CONTINUUM_FRONTIER_TARGET_READY' || directive?.taskRequired !== true || !base || !Number.isSafeInteger(id) || id < 1 || id > 275 || !name) {
    return fail(['valid-continuum-frontier-directive-required'], 'SOVEREIGN_CONTINUUM_FRONTIER_TASK_REFUSED');
  }
  const taskId = `uberbond_continuum_frontier_${base.slice(0, 16)}_${String(id).padStart(3, '0')}`;
  const compiled = compileAgentTask({
    taskId,
    objective:`On exact UberBond main ${base}, strengthen one bounded executable behavior for GENESIS frontier ${id}: ${name}. Finite engineering closure has already been independently established for this base, so this is CONTINUUM FRONTIER MODE, not repair theater. Use the target's current source and tests to find one concrete behavior/proof weakness consistent with the Sovereign Cognitive Continuum and Perpetual Frontier canon. The change must add or strengthen real executable behavior and, when needed, create a new regression test. Do not edit existing tests, North Star/canon, GENESIS evidence/maturity declarations, sovereignty/build/control surfaces, or generated truth artifacts. Do not rename PARTIAL_PRIMITIVE to pretend progress. If there is no safe causal source improvement on this base, return STOP. Return one bounded canonical AgentCodeChangeSet in result.codeChangeSet.`,
    originAgent:'sovereign-continuum-frontier-controller',
    targetAgent:'local-sovereign-model',
    parentTask:`main:${base}`,
    contextRefs:[`main:${base}`, 'mode:continuum-frontier', `continuum-frontier-target:${id}`, `continuum-frontier-name:${name}`, ...uniq(directive.targetSources).slice(0,8).map(p=>`source:${p}`), ...uniq(directive.targetTests).slice(0,4).map(p=>`test:${p}`)],
    evidenceRefs:[`evidence:exact-main-${base}`, 'audit:terminal-realization-finite-closed', 'audit:genesis-evidence-ledger-exact-current', 'doc:SOVEREIGN_COGNITIVE_CONTINUUM_TOTAL_NORTH_STAR', 'doc:PERPETUAL_FRONTIER_GENESIS_CANON'],
    constraints:[`exact-base-revision:${base}`, 'continuum-frontier-mode', `continuum-frontier-target:${id}`, `continuum-frontier-name:${name}`, 'one-bounded-change-set', 'local-preparation-only', 'business-effect-authority:none', 'behavior-change-not-scoreboard-relabel', 'new-tests-only-never-edit-existing-tests', 'preserve-finite-closure-and-no-amputation-law'],
    forbiddenActions:['merge','deploy','send','spend','purchase','change-credentials','change-dns','mutate-production','customer-contact','payment-action','weaken-tests','weaken-authority','edit-sovereignty-paths','edit-build-protected-paths','edit-terminal-north-star','edit-perpetual-frontier-canon','edit-genesis-evidence-or-maturity','edit-generated-truth-artifacts'],
    requiredOutputs:['outcome','changedArtifacts','testsActuallyRun','truthTable','externalEffectLedger','decision','codeChangeSet','continuumFrontierAddressed'],
    acceptanceTests:['npm run check:syntax','npm run test:deterministic'],
    budget:{maxTokens:120_000,maxCostCents:0},
    economicObjective:'advance the terminal Sovereign Cognitive Continuum with one truthful bounded source improvement and minimum founder attention',
    consequenceClass:'LOCAL_PREPARATION',
    date
  });
  if (!compiled?.ok) return fail(compiled?.reasonCodes || ['canonical-agent-task-compilation-failed'], 'SOVEREIGN_CONTINUUM_FRONTIER_TASK_REFUSED');
  return compiled.task || compiled;
}
