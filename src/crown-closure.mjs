import { createHash } from 'node:crypto';

// A bounded proof interpreter, not a natural-language semantic judge.
// Trust pins are supplied by the independently governed admission layer.
export { canonicalSemanticJson as canonical } from './semantic-closure-kernel.mjs';
import { canonicalSemanticJson as canonical } from './semantic-closure-kernel.mjs';
export const semanticHash = value => createHash('sha256').update(canonical(value)).digest('hex');
const same = (a, b) => canonical(a) === canonical(b);
const id = v => typeof v === 'string' && v.length > 0 && v.length <= 500;
const hash = v => typeof v === 'string' && /^[a-f0-9]{64}$/.test(v);
const refused = reasons => ({ ok: false, status: 'CROWN_PAGE_FAULT', reasonCodes: [...new Set(reasons)], releaseAuthorized: false, externalEffectAuthority: 'NONE' });

function current(record, context, trustPins) {
  if (!record || !id(record.id) || !hash(trustPins?.[record.id]) || semanticHash(record) !== trustPins[record.id]) throw new Error('untrusted-or-mutated-authority');
  if (!id(record.evidenceRef)) throw new Error('authority-evidence-required');
  if (!id(context.crownRevision) || record.crownRevision !== context.crownRevision) throw new Error('crown-succession-revalidation-required');
  if (record.taskClass !== context.taskClass || !same(record.qualityContract, context.qualityContract)) throw new Error('quality-or-task-contract-mismatch');
  if (record.kind !== 'EXHAUSTIVE_POLICY' && (!hash(context.inputHash) || record.inputHash !== context.inputHash)) throw new Error('authority-input-mismatch');
  const now = Date.parse(context.now), expiry = Date.parse(record.expiresAt);
  if (!Number.isFinite(now) || !Number.isFinite(expiry) || expiry <= now) throw new Error('authority-expired-or-clock-invalid');
  if (!record.dependencies || typeof record.dependencies !== 'object' || Array.isArray(record.dependencies)) throw new Error('dependency-map-required');
  for (const [key, digest] of Object.entries(record.dependencies)) {
    if (!hash(digest) || !Object.hasOwn(context.dependencies || {}, key) || context.dependencies[key] !== digest) throw new Error('dependency-changed-or-missing');
  }
  if (!Array.isArray(record.invalidators) || !context.invalidators || typeof context.invalidators !== 'object') throw new Error('invalidator-state-required');
  for (const key of record.invalidators) {
    if (!id(key) || !Object.hasOwn(context.invalidators, key) || context.invalidators[key] !== false) throw new Error('invalidator-triggered-or-unknown');
  }
}

export function executeBoundedCircuit({ circuit, input, context, trustPins } = {}) {
  try {
    current(circuit, context, trustPins);
    if (circuit.kind !== 'EXHAUSTIVE_POLICY' || !circuit.domain || !Array.isArray(circuit.rows)) throw new Error('bounded-policy-required');
    const keys = Object.keys(circuit.domain).sort();
    if (!keys.length || !input || !same(Object.keys(input).sort(), keys)) throw new Error('input-schema-drift');
    let states = [{}];
    for (const key of keys) {
      const choices = circuit.domain[key];
      if (!Array.isArray(choices) || !choices.length || new Set(choices.map(v => canonical(v))).size !== choices.length) throw new Error('finite-distinct-domain-required');
      if (states.length * choices.length > 4096) throw new Error('policy-state-bound-exceeded');
      states = states.flatMap(state => choices.map(value => ({ ...state, [key]: value })));
    }
    const rows = new Map(circuit.rows.map(row => [canonical(row.input), row.output]));
    if (rows.size !== circuit.rows.length || rows.size !== states.length || states.some(state => !rows.has(canonical(state)))) throw new Error('non-exhaustive-policy');
    if (!rows.has(canonical(input))) throw new Error('out-of-domain');
    const decision = structuredClone(rows.get(canonical(input)));
    return { ok: true, decision, certificate: { circuitId: circuit.id, circuitHash: semanticHash(circuit), inputHash: semanticHash(input), decisionHash: semanticHash(decision), dependencyHash: semanticHash(circuit.dependencies), crownRevision: circuit.crownRevision } };
  } catch (error) { return refused([error.message]); }
}

export function verifyBoundedCertificate(args) {
  const expected = executeBoundedCircuit(args);
  try {
    return expected.ok && same(expected.certificate, args.certificate) && same(expected.decision, args.decision)
      ? { ok: true, status: 'CERTIFICATE_CHECKED' } : refused(['forged-or-inapplicable-circuit-certificate']);
  } catch { return refused(['invalid-certificate']); }
}

// Every material output field is named in the trusted contract. The only
// renderer is exact JSON; free prose and model-authored certificates cannot pass.
export function checkCrownClosure({ artifact, proof, authorities = {}, trustPins = {}, contract, context } = {}) {
  try {
    current(contract, context, trustPins);
    if (contract.kind !== 'OUTPUT_CONTRACT' || !Array.isArray(contract.claimIds) || !contract.claimIds.length || new Set(contract.claimIds).size !== contract.claimIds.length) throw new Error('complete-material-claim-contract-required');
    if (!artifact || typeof artifact !== 'object' || Array.isArray(artifact) || !same(Object.keys(artifact).sort(), [...contract.claimIds].sort())) throw new Error('material-claim-coverage-mismatch');
    if (!Array.isArray(proof?.nodes) || !proof.nodes.length || proof.nodes.length > 4096) throw new Error('bounded-proof-tree-required');
    const nodes = new Map(proof.nodes.map(node => [node.id, node]));
    if (nodes.size !== proof.nodes.length || proof.nodes.some(node => !id(node.id))) throw new Error('unique-proof-node-ids-required');
    const done = new Map(), visiting = new Set(), used = new Set();
    function visit(nodeId) {
      if (done.has(nodeId)) return done.get(nodeId);
      if (visiting.has(nodeId)) throw new Error('proof-cycle');
      const node = nodes.get(nodeId);
      if (!node) throw new Error('unresolved-proof-leaf');
      visiting.add(nodeId);
      let value;
      if (node.op === 'LOAD_AUTHORIZED') {
        const authority = authorities[node.authorityId];
        current(authority, context, trustPins);
        if (!['CROWN_ATOM', 'REALITY_FACT'].includes(authority.kind)) throw new Error('invalid-leaf-authority');
        // The contract binds the output obligation to its exact leaf.
        value = structuredClone(authority.value);
        used.add(authority.id);
      } else if (node.op === 'APPLY_EXHAUSTIVE_POLICY') {
        const circuit = authorities[node.authorityId];
        const result = executeBoundedCircuit({ circuit, input: node.input, context, trustPins });
        if (!result.ok) throw new Error(result.reasonCodes.join(','));
        if (!verifyBoundedCertificate({ circuit, input: node.input, context, trustPins, decision: node.decision, certificate: node.certificate }).ok) throw new Error('forged-circuit-certificate');
        value = result.decision;
        used.add(circuit.id);
      } else if (['IDENTITY', 'SUM_SAFE_INTEGERS'].includes(node.op)) {
        if (!Array.isArray(node.dependencies) || !node.dependencies.length) throw new Error('derivation-inputs-required');
        const inputs = node.dependencies.map(visit);
        if (node.op === 'IDENTITY') {
          if (inputs.length !== 1) throw new Error('identity-arity');
          value = inputs[0];
        } else {
          if (!inputs.every(Number.isSafeInteger)) throw new Error('exact-safe-integers-required');
          value = inputs.reduce((sum, next) => { const n = sum + next; if (!Number.isSafeInteger(n)) throw new Error('integer-overflow'); return n; }, 0);
        }
      } else throw new Error('unauthorized-semantic-opcode');
      visiting.delete(nodeId); done.set(nodeId, value); return value;
    }
    for (const claimId of contract.claimIds) {
      const root = proof.roots?.[claimId];
      // Root programs are pinned as part of the independent contract, not
      // chosen by a worker that could substitute a different authorized fact.
      if (!root || semanticHash(proof.nodes) !== contract.proofNodesHash || !same(proof.roots, contract.roots)) throw new Error('proof-program-not-authorized');
      if (!same(visit(root), artifact[claimId])) throw new Error('renderer-altered-authorized-semantics');
    }
    if (done.size !== nodes.size) throw new Error('unreachable-proof-nodes');
    return { ok: true, status: 'CROWN_CLOSURE_CHECKED', releaseAuthorized: false, semanticClosure: true, artifactHash: semanticHash(artifact), proofHash: semanticHash(proof), authorityIds: [...used].sort(), externalEffectAuthority: 'NONE', claimBoundary: 'Exact execution of independently admitted structured semantics only; no open-ended prose or global frontier-quality theorem.' };
  } catch (error) { return refused([error.message]); }
}

export function renderAuthorizedJson(args) {
  const closure = checkCrownClosure(args);
  return closure.ok ? { ...closure, rendered: canonical(args.artifact) } : closure;
}

// Full obligation identity is retained. No embedding/paraphrase equivalence.
export function exactObligationKey(task) {
  if (!task || !id(task.taskClass) || !id(task.crownRevision) || !hash(task.inputHash) || !task.dependencies || !task.qualityContract || !hash(task.contractHash) || !task.applicability || !task.invalidators || !id(task.freshnessClass)) throw new Error('complete-typed-obligation-required');
  return semanticHash(task);
}

export function invalidatedDescendants(nodes, changedIds) {
  const ids = new Set(nodes.map(node => node.id));
  if (ids.size !== nodes.length || changedIds.some(id => !ids.has(id))) throw new Error('unique-known-graph-identities-required');
  const reverse = new Map(nodes.map(node => [node.id, []]));
  for (const node of nodes) for (const dep of node.dependencies || []) {
    if (!ids.has(dep)) throw new Error('graph-dependency-missing');
    reverse.get(dep).push(node.id);
  }
  const affected = new Set(changedIds), queue = [...changedIds];
  for (let i = 0; i < queue.length; i++) for (const next of reverse.get(queue[i])) if (!affected.has(next)) { affected.add(next); queue.push(next); }
  return { affectedIds: [...affected].sort(), recomputeFraction: nodes.length ? affected.size / nodes.length : 0 };
}
