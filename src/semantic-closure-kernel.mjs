import { createHash } from 'node:crypto';
import { ZERO_EXTERNAL_EFFECTS } from './effect-ledgers.mjs';
import { qualityInvariantAttestation } from './absolute-frontier-quality-invariant.mjs';

export const SEMANTIC_CLOSURE_VERSION = 'uberbond.semantic-closure.v1';
const own = (object, key) => Object.hasOwn(object, key);
const plain = value => value !== null && typeof value === 'object' && Object.getPrototypeOf(value) === Object.prototype;
const name = value => typeof value === 'string' && /^[a-zA-Z0-9_.:/-]{1,240}$/.test(value);
const sha = value => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
const closureOrigins = new WeakMap();

// Reject JSON's lossy/coercive cases; hashes must identify the complete typed value.
export function canonicalSemanticJson(value) {
  const seen = new Set();
  function walk(v, depth) {
    if (depth > 64) throw new Error('semantic-depth-bound');
    if (v === null || typeof v === 'string' || typeof v === 'boolean') return JSON.stringify(v);
    if (typeof v === 'number' && Number.isFinite(v) && !Object.is(v, -0)) return JSON.stringify(v);
    if (!Array.isArray(v) && !plain(v)) throw new Error('lossless-json-value-required');
    if (Object.getOwnPropertySymbols(v).length || Object.keys(v).some(k => !('value' in Object.getOwnPropertyDescriptor(v, k)))) throw new Error('accessor-or-symbol-forbidden');
    if (seen.has(v)) throw new Error('semantic-cycle');
    seen.add(v);
    let out;
    if (Array.isArray(v)) {
      if (Object.keys(v).length !== v.length) throw new Error('dense-array-required');
      out = '[' + v.map(x => walk(x, depth + 1)).join(',') + ']';
    } else {
      if (Object.getOwnPropertySymbols(v).length) throw new Error('symbol-key-forbidden');
      const keys = Object.keys(v).sort();
      if (keys.some(k => ['__proto__', 'constructor', 'prototype'].includes(k))) throw new Error('unsafe-object-key');
      if (keys.some(k => !('value' in Object.getOwnPropertyDescriptor(v, k)))) throw new Error('accessor-forbidden');
      out = '{' + keys.map(k => JSON.stringify(k) + ':' + walk(v[k], depth + 1)).join(',') + '}';
    }
    seen.delete(v);
    return out;
  }
  const encoded = walk(value, 0);
  if (Buffer.byteLength(encoded) > 2_000_000) throw new Error('semantic-byte-bound');
  return encoded;
}
export const semanticHash = value => createHash('sha256').update(canonicalSemanticJson(value)).digest('hex');
export const semanticProgramHash = artifact => semanticHash({ nodes: artifact.nodes.map(({ value, certificate, ...node }) => node), claims: artifact.claims.map(({ id, nodeId }) => ({ id, nodeId })) });
const equal = (a, b) => canonicalSemanticJson(a) === canonicalSemanticJson(b);
const result = (ok, status, reasonCodes = [], extra = {}) => ({
  ok, status, reasonCodes: [...new Set(reasonCodes)], version: SEMANTIC_CLOSURE_VERSION,
  absoluteQualityInvariant: qualityInvariantAttestation(), businessEffectAuthority: 'NONE',
  externalEffectAuthority: 'NONE', externalEffectLedger: structuredClone(ZERO_EXTERNAL_EFFECTS), ...extra
});

export function validateSemanticContext(context, now) {
  const reasons = [];
  if (!plain(context) || !name(context.scope) || !name(context.crownRevision) || !sha(context.qualityContractHash)) reasons.push('trusted-context-required');
  if (!plain(context?.sourceHashes) || Object.entries(context.sourceHashes).some(([k, v]) => !name(k) || !sha(v))) reasons.push('source-state-required');
  if (!plain(context?.invalidators) || Object.values(context.invalidators).some(v => typeof v !== 'boolean')) reasons.push('invalidator-state-required');
  if (!Array.isArray(context?.requiredClaimIds) || !context.requiredClaimIds.length || context.requiredClaimIds.some(v => !name(v)) || new Set(context.requiredClaimIds).size !== context.requiredClaimIds.length) reasons.push('trusted-output-obligations-required');
  if (!sha(context?.authorizedProgramHash)) reasons.push('trusted-proof-program-required');
  if (!Number.isFinite(now)) reasons.push('valid-current-time-required');
  return reasons;
}

// These are substrate checks, not semantic parsing of unrestricted human language.
function validateAuthority(record, context, now, expectedKind) {
  const reasons = [];
  if (!record || record.kind !== expectedKind || !name(record.id) || record.status !== 'ACTIVE') return ['active-trusted-authority-record-required'];
  if (record.scope !== context.scope || record.qualityContractHash !== context.qualityContractHash) reasons.push('authority-scope-or-quality-mismatch');
  if (!Number.isFinite(Date.parse(record.verifiedAt)) || Date.parse(record.verifiedAt) > now || !Number.isFinite(Date.parse(record.expiresAt)) || Date.parse(record.expiresAt) <= now) reasons.push('authority-stale-or-future');
  if (expectedKind === 'CROWN' || expectedKind === 'POLICY') {
    if (record.crownRevision !== context.crownRevision) reasons.push('crown-succession-revalidation-required');
  }
  if (!plain(record.sourceHashes) || !Object.keys(record.sourceHashes).length) reasons.push('authority-dependencies-required');
  else for (const [key, hash] of Object.entries(record.sourceHashes)) {
    if (!sha(hash) || context.sourceHashes[key] !== hash) reasons.push(`dependency-changed:${key}`);
  }
  if (!Array.isArray(record.invalidators)) reasons.push('authority-invalidators-required');
  else for (const id of record.invalidators) {
    if (!name(id) || context.invalidators[id] !== false) reasons.push(`invalidator-fired-or-unknown:${id}`);
  }
  if (!record.evidenceRef || typeof record.evidenceRef !== 'string') reasons.push('authority-evidence-required');
  return reasons;
}

export function executeExactOpcode(opcode, inputs, params = {}) {
  if (!Array.isArray(inputs) || inputs.length > 4096 || !plain(params)) throw new Error('bounded-inputs-required');
  switch (opcode) {
    case 'IDENTITY':
      if (inputs.length !== 1 || Object.keys(params).length) break;
      return structuredClone(inputs[0]);
    case 'PROJECT':
      if (inputs.length !== 1 || !plain(inputs[0]) || !Array.isArray(params.keys) || !params.keys.length || new Set(params.keys).size !== params.keys.length || Object.keys(params).some(k => k !== 'keys')) break;
      if (params.keys.some(k => typeof k !== 'string' || !own(inputs[0], k))) break;
      return Object.fromEntries(params.keys.map(k => [k, structuredClone(inputs[0][k])]));
    case 'SUM_INTEGER': {
      if (Object.keys(params).length || !inputs.length || inputs.some(v => !Number.isSafeInteger(v))) break;
      const sum = inputs.reduce((a, b) => a + BigInt(b), 0n);
      if (sum > BigInt(Number.MAX_SAFE_INTEGER) || sum < BigInt(Number.MIN_SAFE_INTEGER)) break;
      return Number(sum);
    }
    case 'EQUAL':
      if (inputs.length !== 2 || Object.keys(params).length) break;
      return equal(inputs[0], inputs[1]);
    case 'ALL':
      if (Object.keys(params).length || !inputs.length || inputs.some(v => typeof v !== 'boolean')) break;
      return inputs.every(Boolean);
    case 'LOOKUP':
      if (inputs.length !== 2 || !Array.isArray(inputs[0]) || Object.keys(params).length) break;
      return lookupFinitePolicy(inputs[0], inputs[1]);
    default: throw new Error('unknown-semantic-opcode');
  }
  throw new Error('opcode-precondition-mismatch');
}

function lookupFinitePolicy(rows, input) {
  const key = semanticHash(input);
  const matches = rows.filter(row => plain(row) && own(row, 'input') && own(row, 'output') && semanticHash(row.input) === key);
  if (matches.length !== 1) throw new Error('out-of-domain-or-ambiguous-policy');
  return structuredClone(matches[0].output);
}

export function validateFinitePolicy(policy) {
  if (!plain(policy) || !Array.isArray(policy.domain) || !policy.domain.length || policy.domain.length > 4096 || !Array.isArray(policy.rows) || policy.rows.length !== policy.domain.length) throw new Error('bounded-exhaustive-domain-required');
  const domain = policy.domain.map(semanticHash);
  if (new Set(domain).size !== domain.length) throw new Error('duplicate-domain-state');
  const rows = policy.rows.map(row => {
    if (!plain(row) || Object.keys(row).sort().join(',') !== 'input,output') throw new Error('exact-policy-row-required');
    semanticHash(row.output);
    return semanticHash(row.input);
  });
  if (new Set(rows).size !== rows.length || rows.some(key => !domain.includes(key))) throw new Error('finite-domain-not-exhaustively-covered');
  return true;
}

// Trusted records enter only through the runtime authority store, never through a task.
// A digest authenticates nothing. The store must be supplied by a separately governed
// custodian; default empty stores deny every authority-bearing leaf.
export function createSemanticClosureChecker({ authorityRecords = [] } = {}) {
  const records = new Map();
  for (const row of authorityRecords) {
    if (!name(row.id) || records.has(row.id)) throw new Error('unique-authority-id-required');
    semanticHash(row);
    records.set(row.id, structuredClone(row));
  }
  return function checkSemanticClosure({ artifact, context, now = Date.now() } = {}) {
    try {
      const reasons = validateSemanticContext(context, now);
      if (reasons.length) return result(false, 'RELEASE_BLOCKED', reasons);
      semanticHash(artifact);
      if (!plain(artifact) || !Array.isArray(artifact.nodes) || !artifact.nodes.length || artifact.nodes.length > 4096 || !Array.isArray(artifact.claims) || !artifact.claims.length) throw new Error('bounded-complete-semantic-artifact-required');
      if (artifact.scope !== context.scope || artifact.qualityContractHash !== context.qualityContractHash) throw new Error('artifact-scope-or-quality-mismatch');
      if (semanticProgramHash(artifact) !== context.authorizedProgramHash) throw new Error('unauthorized-proof-program');
      const byId = new Map();
      for (const node of artifact.nodes) {
        if (!name(node.id) || byId.has(node.id) || !Array.isArray(node.dependencies) || new Set(node.dependencies).size !== node.dependencies.length || !own(node, 'value')) throw new Error('unique-typed-node-required');
        byId.set(node.id, node);
      }
      const visiting = new Set(), closed = new Map(), authorityIds = new Set();
      function visit(id) {
        if (closed.has(id)) return closed.get(id);
        if (visiting.has(id)) throw new Error('proof-cycle');
        const node = byId.get(id);
        if (!node) throw new Error(`unresolved-proof-leaf:${id}`);
        visiting.add(id);
        const inputs = node.dependencies.map(visit);
        let value;
        if (['CROWN', 'REALITY', 'POLICY'].includes(node.kind)) {
          if (inputs.length) throw new Error('authority-leaf-must-not-have-unchecked-parents');
          const record = records.get(node.authorityId);
          const failures = validateAuthority(record, context, now, node.kind);
          if (failures.length) throw new Error(failures.join('|'));
          if (!equal(record.value, node.value)) throw new Error('authority-value-mismatch');
          if (node.kind === 'POLICY') validateFinitePolicy(record.value);
          value = structuredClone(record.value);
          authorityIds.add(record.id);
        } else if (node.kind === 'DERIVATION') {
          value = executeExactOpcode(node.opcode, inputs, node.params ?? {});
          if (!equal(value, node.value)) throw new Error('derived-value-mismatch');
        } else if (node.kind === 'CIRCUIT') {
          if (inputs.length !== 1) throw new Error('circuit-policy-parent-required');
          const parent = byId.get(node.dependencies[0]);
          if (parent?.kind !== 'POLICY') throw new Error('circuit-requires-trusted-policy-leaf');
          const cert = node.certificate;
          validateFinitePolicy(inputs[0]);
          const expected = {
            policyId: parent.authorityId, policyHash: semanticHash(inputs[0]),
            inputHash: semanticHash(node.input), contextHash: semanticHash(context),
            circuitVersion: SEMANTIC_CLOSURE_VERSION
          };
          if (!equal(cert, expected)) throw new Error('forged-or-stale-circuit-certificate');
          value = lookupFinitePolicy(inputs[0].rows, node.input);
          if (!equal(value, node.value)) throw new Error('circuit-decision-mismatch');
        } else throw new Error('unrecognized-or-unresolved-authority');
        visiting.delete(id);
        closed.set(id, value);
        return value;
      }
      const claimIds = new Set();
      for (const claim of artifact.claims) {
        if (!name(claim.id) || claimIds.has(claim.id) || !own(claim, 'value')) throw new Error('unique-complete-claims-required');
        claimIds.add(claim.id);
        if (!equal(visit(claim.nodeId), claim.value)) throw new Error('claim-value-mismatch');
      }
      if (!equal([...claimIds].sort(), [...context.requiredClaimIds].sort())) throw new Error('required-output-obligation-mismatch');
      // Also validate disconnected nodes; unused poisoned code cannot lurk in a packet.
      for (const id of byId.keys()) visit(id);
      const verified = result(true, 'SEMANTIC_CLOSURE_VERIFIED', [], {
        artifactHash: semanticHash(artifact), contextHash: semanticHash(context),
        authorityIds: [...authorityIds].sort(), claimCount: claimIds.size,
        claimBoundary: 'EXACT_TYPED_CLAIMS_ONLY; DOES_NOT_CERTIFY_UNRESTRICTED_PROSE_OR_TRUTH_OF_CUSTODIAN_RECORDS'
      });
      closureOrigins.set(verified, { checker: checkSemanticClosure, artifactHash: verified.artifactHash, contextHash: verified.contextHash });
      return verified;
    } catch (error) { return result(false, 'RELEASE_BLOCKED', [error.message]); }
  };
}

export function createBoundedCircuitCertificate({ policyId, policy, input, context }) {
  validateFinitePolicy(policy);
  lookupFinitePolicy(policy.rows, input);
  return { policyId, policyHash: semanticHash(policy), inputHash: semanticHash(input),
    contextHash: semanticHash(context), circuitVersion: SEMANTIC_CLOSURE_VERSION };
}

// Surface freedom is deliberately finite. Arbitrary model prose remains unverified.
export function renderClosedClaims({ artifact, closure, context, now = Date.now(), style = 'json' }) {
  const origin = closureOrigins.get(closure);
  if (!origin || origin.artifactHash !== semanticHash(artifact) || origin.contextHash !== semanticHash(context) || !origin.checker({ artifact, context, now }).ok) throw new Error('current-semantic-closure-required');
  if (style === 'json') return canonicalSemanticJson(artifact.claims.map(({ id, value }) => ({ id, value })));
  if (style !== 'lines') throw new Error('unverified-renderer-style');
  return artifact.claims.map(claim => `${claim.id}: ${canonicalSemanticJson(claim.value)}`).join('\n');
}

export function impactedSemanticNodes(nodes, changedIds) {
  if (!Array.isArray(nodes) || nodes.length > 100000 || !Array.isArray(changedIds)) throw new Error('bounded-dag-required');
  const ids = new Set(nodes.map(n => n.id));
  if (ids.size !== nodes.length || nodes.some(n => !Array.isArray(n.dependencies) || n.dependencies.some(id => !ids.has(id)))) throw new Error('complete-unique-dag-required');
  if (changedIds.some(id => !ids.has(id))) throw new Error('changed-node-not-found');
  const reverse = new Map(nodes.map(n => [n.id, []]));
  for (const node of nodes) for (const parent of node.dependencies) reverse.get(parent).push(node.id);
  const affected = new Set(changedIds), queue = [...affected];
  for (let i = 0; i < queue.length; i++) for (const child of reverse.get(queue[i])) {
    if (!affected.has(child)) { affected.add(child); queue.push(child); }
  }
  return { affectedIds: [...affected].sort(), recomputeFraction: nodes.length ? affected.size / nodes.length : 0 };
}

// Prototype: coalesce unresolved *proof cuts*, rather than whole tasks. A complete
// task can vary while its missing semantic obligation stays exactly identical.
// Coalescing buys no authority: every consumer still closes independently afterward.
export function coalesceSemanticProofCuts(tasks) {
  if (!Array.isArray(tasks) || tasks.length > 100000) throw new Error('bounded-demand-required');
  const groups = new Map(), consumers = new Set();
  for (const task of tasks) {
    if (!name(task.taskId) || consumers.has(task.taskId) || !plain(task.obligation) || !plain(task.context)) throw new Error('unique-typed-consumer-required');
    consumers.add(task.taskId);
    if (validateSemanticContext(task.context, Date.now()).length) throw new Error('complete-proof-cut-context-required');
    const cut = { obligation: task.obligation, context: task.context };
    const key = semanticHash(cut);
    const group = groups.get(key) ?? { cutHash: key, ...structuredClone(cut), consumerIds: [] };
    group.consumerIds.push(task.taskId);
    groups.set(key, group);
  }
  return { status: 'PROOF_CUT_COALESCING_PLAN_ONLY', cuts: [...groups.values()],
    taskCount: tasks.length, unresolvedCutCount: groups.size,
    candidateMulticastFactor: groups.size ? tasks.length / groups.size : null,
    actualCrownCallsAvoided: null, semanticAuthority: 'NONE' };
}


// Mint compact-Crown coverage authority only from a live closure produced by
// this module's checker. The WeakMap provenance makes serialized/copied
// "closure" objects non-authoritative. Unrestricted Crown prose cannot mint it.
export function mintCertifiedCoverageFromClosure({
  artifact, closure, context, coverageClaimId,
  sourceHash, obligationHash, packetHash,
  evidenceRef, expiresAt, now = Date.now()
} = {}) {
  const fail = reason => ({ ok:false, status:'COVERAGE_AUTHORITY_REFUSED', reasons:[reason], semanticAuthority:'NONE' });
  try {
    const origin = closureOrigins.get(closure);
    if (!origin || origin.artifactHash !== semanticHash(artifact) || origin.contextHash !== semanticHash(context)) throw new Error('live-semantic-closure-provenance-required');
    const current = origin.checker({ artifact, context, now });
    if (!current.ok || current.artifactHash !== closure.artifactHash || current.contextHash !== closure.contextHash) throw new Error('current-semantic-closure-required');
    if (!name(coverageClaimId) || !sha(sourceHash) || !sha(obligationHash) || !sha(packetHash)) throw new Error('coverage-binding-hashes-required');
    if (typeof evidenceRef !== 'string' || !evidenceRef.length) throw new Error('coverage-evidence-ref-required');
    const expiry = Date.parse(expiresAt);
    if (!Number.isFinite(expiry) || expiry <= now) throw new Error('future-coverage-expiry-required');

    const claim = artifact.claims.find(row => row.id === coverageClaimId);
    if (!claim) throw new Error('coverage-claim-required');
    const expected = {
      complete: true,
      sourceHash,
      qualityContractHash: context.qualityContractHash,
      obligationHash,
      packetHash
    };
    if (!equal(claim.value, expected)) throw new Error('coverage-claim-binding-mismatch');

    // Coverage may be inherited from admitted Reality/Policy facts and exact
    // derivations/circuits, but never directly from an unrestricted Crown leaf.
    const allowed = new Set(['REALITY','POLICY','DERIVATION','CIRCUIT']);
    if (artifact.nodes.some(node => !allowed.has(node.kind))) throw new Error('e0-e4-only-coverage-proof-required');
    const proofClass = artifact.nodes.some(n=>n.kind==='CIRCUIT') ? 'E4'
      : artifact.nodes.some(n=>n.kind==='POLICY') ? 'E3'
      : artifact.nodes.some(n=>n.kind==='DERIVATION') ? 'E1'
      : 'E0';

    return {
      ok:true,
      status:'CERTIFIED_COVERAGE_MINTED',
      authority:{
        kind:'CERTIFIED_COVERAGE',
        status:'ACTIVE',
        sourceHash,
        qualityContractHash:context.qualityContractHash,
        obligationHash,
        packetHash,
        evidenceRef,
        expiresAt,
        proofClass,
        closureArtifactHash:closure.artifactHash,
        closureContextHash:closure.contextHash,
        crownRevision:context.crownRevision,
        sourceDependencies:structuredClone(context.sourceHashes),
        invalidators:structuredClone(context.invalidators),
        mintedAt:new Date(now).toISOString()
      },
      semanticAuthority:'E0_E4_VERIFIED_COVERAGE_ONLY',
      externalEffectAuthority:'NONE'
    };
  } catch (error) {
    return fail(String(error?.message || error));
  }
}


export function mintDecisionFranchiseFromClosure({
  artifact, closure, context, franchiseClaimId,
  evidenceRef, expiresAt, now = Date.now()
} = {}) {
  const fail = reason => ({ ok:false, status:'DECISION_FRANCHISE_REFUSED', reasons:[reason], semanticAuthority:'NONE' });
  try {
    const origin = closureOrigins.get(closure);
    if (!origin || origin.artifactHash !== semanticHash(artifact) || origin.contextHash !== semanticHash(context)) throw new Error('live-semantic-closure-provenance-required');
    const current = origin.checker({ artifact, context, now });
    if (!current.ok) throw new Error('current-semantic-closure-required');
    if (!name(franchiseClaimId) || typeof evidenceRef !== 'string' || !evidenceRef.length) throw new Error('franchise-evidence-binding-required');
    const expiry=Date.parse(expiresAt);
    if (!Number.isFinite(expiry) || expiry<=now) throw new Error('future-franchise-expiry-required');

    const claim=artifact.claims.find(row=>row.id===franchiseClaimId);
    const spec=claim?.value;
    if (!plain(spec) || spec.schemaVersion!=='uberbond.decision-franchise.spec.v1') throw new Error('decision-franchise-spec-required');
    if (!name(spec.taskClass) || spec.qualityContractHash!==context.qualityContractHash || spec.sideEffectClass!=='NONE') throw new Error('franchise-task-quality-effect-contract-mismatch');
    if (!Array.isArray(spec.relevantKeys) || !spec.relevantKeys.length || new Set(spec.relevantKeys).size!==spec.relevantKeys.length || spec.relevantKeys.some(k=>!name(k))) throw new Error('exact-relevance-projection-required');
    validateFinitePolicy(spec.policy);
    for (const state of spec.policy.domain) {
      if (!plain(state) || !equal(Object.keys(state).sort(), [...spec.relevantKeys].sort())) throw new Error('policy-domain-must-match-relevance-projection');
    }

    const allowed=new Set(['REALITY','POLICY','DERIVATION','CIRCUIT']);
    if (artifact.nodes.some(node=>!allowed.has(node.kind))) throw new Error('e0-e4-only-franchise-proof-required');
    const proofClass=artifact.nodes.some(n=>n.kind==='CIRCUIT')?'E4'
      :artifact.nodes.some(n=>n.kind==='POLICY')?'E3'
      :artifact.nodes.some(n=>n.kind==='DERIVATION')?'E1':'E0';

    const record={
      kind:'DECISION_FRANCHISE',status:'ACTIVE',
      id:'df:'+semanticHash(spec),spec:structuredClone(spec),
      crownRevision:context.crownRevision,
      sourceDependencies:structuredClone(context.sourceHashes),
      invalidators:structuredClone(context.invalidators),
      closureArtifactHash:closure.artifactHash,
      closureContextHash:closure.contextHash,
      proofClass,evidenceRef,expiresAt,mintedAt:new Date(now).toISOString()
    };
    return {ok:true,status:'DECISION_FRANCHISE_MINTED',record,trustPin:semanticHash(record),
      semanticAuthority:'E0_E4_VERIFIED_FRANCHISE_ONLY',externalEffectAuthority:'NONE'};
  } catch(error) { return fail(String(error?.message||error)); }
}
