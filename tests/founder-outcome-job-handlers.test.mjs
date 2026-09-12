import test from 'node:test';
import assert from 'node:assert/strict';
import { createMissionAwareJobHandlers } from '../src/founder-outcome-job-handlers.mjs';

const ZERO = Object.freeze({
  messagesSent: 0,
  moneyMovedCents: 0,
  deployments: 0,
  credentialsChanged: 0,
  dnsChanges: 0,
  externalWrites: 0
});

test('founder outcome pulse is production-wired but refuses without durable enqueue authority', async () => {
  const handlers = createMissionAwareJobHandlers({});
  assert.equal(typeof handlers['founder.outcome.mission.pulse'], 'function');

  const result = await handlers['founder.outcome.mission.pulse']({ missionId: 'mission-test' });
  assert.equal(result.ok, false);
  assert.equal(result.status, 'FOUNDER_OUTCOME_MISSION_SUPERVISOR_REFUSED');
  assert.ok(result.reasonCodes.includes('durable-enqueue-function-required'));
  assert.equal(result.businessEffectAuthority, 'NONE');
  assert.deepEqual(result.externalEffectLedger, ZERO);
});

test('malformed pulse payload cannot manufacture enqueue or consequence authority', async () => {
  let enqueues = 0;
  const handlers = createMissionAwareJobHandlers({
    enqueueJob: async () => { enqueues += 1; return { ok: true }; }
  });
  const result = await handlers['founder.outcome.mission.pulse'](null);
  assert.equal(result.ok, false);
  assert.equal(enqueues, 0);
  assert.equal(result.businessEffectAuthority, 'NONE');
});
