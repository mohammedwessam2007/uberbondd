import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHandler, buildSovereignControlView, sovereignConstitution } from '../api/sovereign-control.mjs';
import { SOVEREIGNTY_TYPES, HUMAN_ONLY_CROSSINGS } from '../src/sovereignty-type-system.mjs';

// This route exists so the sovereign organs have a caller -- otherwise they are
// what the reachability ratchet was built to catch: implemented, tested, green
// and dead. Which means the tests must hold two things at once: that it really
// reaches those organs, and that reaching them changed nothing about what the
// system is allowed to do.

const response = () => {
  const out = { code: null, body: null, headers: null };
  return {
    out,
    res: {
      writeHead(code, headers) { out.code = code; out.headers = headers; },
      end(body) { out.body = JSON.parse(body); }
    }
  };
};

const get = (extra = {}) => ({ method: 'GET', headers: { authorization: 'Bearer t' }, ...extra });

test('the surface is GET-only, because a POST is how a read surface becomes an acting one', async () => {
  const handler = createHandler({ env: { ADMIN_TOKEN: 't' } });
  for (const method of ['POST', 'PUT', 'PATCH', 'DELETE']) {
    const { out, res } = response();
    await handler({ method, headers: { authorization: 'Bearer t' } }, res);
    assert.equal(out.code, 405, `${method} must be refused`);
  }
});

test('an unset admin token refuses rather than serving unauthenticated', async () => {
  const { out, res } = response();
  await createHandler({ env: {} })(get(), res);
  assert.equal(out.code, 503);
  assert.deepEqual(out.body.reasonCodes, ['sovereign-control-admin-auth-not-configured']);
});

test('a wrong token is refused, and comparison does not leak length by short-circuiting', async () => {
  const handler = createHandler({ env: { ADMIN_TOKEN: 'correct-horse' } });
  for (const authorization of ['Bearer wrong', 'Bearer c', '', 'correct-horse']) {
    const { out, res } = response();
    await handler(get({ headers: { authorization } }), res);
    assert.equal(out.code, 401, `${JSON.stringify(authorization)} must be refused`);
  }
});

test('the private core is not reachable from this surface', () => {
  // Not an oversight to be tidied later. Every entry point here runs without a
  // person present, so a route that could read private life state would hand it
  // to whatever holds the admin token.
  const source = readFileSync(new URL('../api/sovereign-control.mjs', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /personal-civilization/,
    'the control surface must not import the private core');
});

test('the constitution is read from the modules, not restated in the route', () => {
  // A hand-written copy would drift from the enforcement and become a page
  // claiming the system is safe after it stopped being it.
  const constitution = sovereignConstitution();
  assert.deepEqual(constitution.typeLadder, SOVEREIGNTY_TYPES);
  assert.deepEqual(constitution.humanOnlyCrossings, HUMAN_ONLY_CROSSINGS);
  assert.match(constitution.triad, /MOHAMED PROVIDES WILL/);
});

test('the view stops at RECOMMENDATION and says it cannot act', () => {
  const view = buildSovereignControlView({ now: new Date('2026-09-07T00:00:00.000Z') });
  assert.equal(view.highestRung, 'RECOMMENDATION');
  assert.match(view.founderAuthority, /CANNOT CHOOSE, DELEGATE, OR ACT/);
  assert.equal(view.businessEffectAuthority, 'NONE');
});

test('an unasked-for decision packet is absent rather than an empty one shaped like a real one', () => {
  const view = buildSovereignControlView({ now: new Date('2026-09-07T00:00:00.000Z') });
  assert.equal(view.decisionPacket, null);
  assert.equal(view.exit, null);
  assert.equal(view.methodSelection, null);
});

test('calibration with no scored forecasts reports unknown, not healthy', () => {
  const view = buildSovereignControlView({ scores: [], now: new Date('2026-09-07T00:00:00.000Z') });
  assert.equal(view.calibration.status, 'CALIBRATION_UNKNOWN');
});

test('the surface really composes the decision organs rather than describing them', () => {
  const view = buildSovereignControlView({
    decision: 'Where to live next year',
    options: [
      { name: 'Move', family: 'FULL_COMMITMENT', changes: ['country'], reversible: false },
      { name: 'Relocate abroad', family: 'STRONGEST_OBVIOUS', changes: ['country'], reversible: false },
      { name: 'Stay', family: 'STATUS_QUO', changes: [] }
    ],
    forecasts: [
      { option: 'Move', evidence: [{ kind: 'REFERENCE_CLASS', detail: 'x', ref: 'ds:a' }], distribution: { probabilities: { good: 0.6, bad: 0.4 } } },
      { option: 'Stay', evidence: [{ kind: 'REFERENCE_CLASS', detail: 'y', ref: 'ds:b' }], distribution: { probabilities: { good: 0.5, bad: 0.5 } } }
    ],
    now: new Date('2026-09-07T00:00:00.000Z')
  });
  assert.equal(view.decisionPacket.ok, true, JSON.stringify(view.decisionPacket.reasonCodes));
  assert.equal(view.decisionPacket.distinctOptions, 2, 'the two wordings of the move must have merged');
  assert.equal(view.decisionPacket.mergedVariants, 1);
  assert.deepEqual(view.decisionPacket.irreversibleOptions, ['Move'],
    'reversible:false on the option must reach the forecast as irreversibility');
});

test('a value boundary carried in the request produces no winner', () => {
  const view = buildSovereignControlView({
    decision: 'Which offer',
    options: [
      { name: 'Pay', family: 'FULL_COMMITMENT', changes: ['employer'] },
      { name: 'Freedom', family: 'OPTIONALITY_PRESERVING', changes: ['schedule'] }
    ],
    forecasts: [
      { option: 'Pay', evidence: [{ kind: 'REFERENCE_CLASS', detail: 'x', ref: 'ds:a' }], distribution: { probabilities: { good: 0.5, bad: 0.5 } }, valueBoundary: true },
      { option: 'Freedom', evidence: [{ kind: 'REFERENCE_CLASS', detail: 'y', ref: 'ds:b' }], distribution: { probabilities: { good: 0.5, bad: 0.5 } } }
    ],
    now: new Date('2026-09-07T00:00:00.000Z')
  });
  assert.equal(view.decisionPacket.recommendation.state, 'NO_RECOMMENDATION__VALUE_BOUNDARY_REACHED');
  assert.equal(view.decisionPacket.recommendation.option, null);
});

test('an authorized read returns the view with no-store and hardening headers', async () => {
  const { out, res } = response();
  await createHandler({ env: { ADMIN_TOKEN: 't' }, now: () => new Date('2026-09-07T00:00:00.000Z') })(get(), res);
  assert.equal(out.code, 200);
  assert.equal(out.body.status, 'SOVEREIGN_CONTROL_VIEW');
  assert.equal(out.headers['cache-control'], 'no-store');
  assert.equal(out.headers['x-frame-options'], 'DENY');
});
