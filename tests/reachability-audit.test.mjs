import test from 'node:test';
import assert from 'node:assert/strict';
import { auditReachability } from '../scripts/reachability-audit.mjs';

// A ratchet, not a target.
//
// The point is not that every module must be production-reachable -- new
// architecture lands proven before it lands wired, and the safety kernels are
// deliberately kept out of any live send path. The point is that a module
// cannot quietly become unreachable, and a new one cannot arrive unreachable,
// without somebody having to look at this list and say so.

// Nothing imports this, tests included. It is a 128-line outbound consequence
// policy -- exact-payload approval, route evidence, suppression authority --
// and because nothing calls it, none of that is enforced anywhere. It is
// listed rather than deleted because deleting a safety policy is a decision
// for whoever owns the send path, not a tidy-up. Wire it or remove it; do not
// let it sit here indefinitely looking like coverage.
const KNOWN_UNREACHABLE = Object.freeze([
  'src/omnia-v9/integrations/outreach-consequence-admission.mjs'
]);

const classified = auditReachability();

test('no module becomes unreachable without being written down', () => {
  assert.deepEqual(
    classified.UNREACHABLE,
    [...KNOWN_UNREACHABLE].sort(),
    'a module nothing imports -- tests included -- is enforcing nothing. Wire it, delete it, or add it to KNOWN_UNREACHABLE with a reason.'
  );
});

test('every module is accounted for in exactly one bucket', () => {
  const all = Object.values(classified).flat();
  assert.equal(new Set(all).size, all.length, 'a module cannot be in two buckets');
  assert.ok(all.length > 150, 'the audit must actually be finding modules');
});

test('the production surface has not silently collapsed', () => {
  // If a refactor breaks the import chain from server.mjs, this number falls
  // off a cliff and the deterministic suite stays green -- which is exactly
  // the failure this guards.
  assert.ok(
    classified.REACHABLE_PRODUCTION.length >= 70,
    `only ${classified.REACHABLE_PRODUCTION.length} modules reachable from an entry point; the chain is probably broken`
  );
});

test('the canonical safety primitives are reachable from production', () => {
  // These are the modules whose whole job is to refuse something. A refusal
  // nothing can reach refuses nothing.
  for (const required of [
    'src/send-safety.mjs',
    'src/deliverability-guard.mjs',
    'src/consequence-boundary.mjs',
    'src/unsubscribe.mjs',
    'src/queue.mjs',
    'src/store.mjs'
  ]) {
    assert.ok(
      classified.REACHABLE_PRODUCTION.includes(required),
      `${required} must be reachable from a production entry point`
    );
  }
});

test('the new engines are at least proven, even where they are not yet wired', () => {
  const proven = new Set([...classified.REACHABLE_PRODUCTION, ...classified.REACHABLE_OPERATOR, ...classified.TEST_ONLY]);
  for (const required of [
    'src/prospect-intelligence.mjs',
    'src/prospect-qualification.mjs',
    'src/contact-verification.mjs',
    'src/causal-attribution-spine.mjs',
    'src/inbound-feedback-kernel.mjs',
    'src/agent-sandbox-provisioner.mjs',
    'src/effect-ledger.mjs',
    'src/secret-patterns.mjs'
  ]) {
    assert.ok(proven.has(required), `${required} is unreachable even from tests`);
  }
});
