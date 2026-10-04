import test from 'node:test';
import assert from 'node:assert/strict';
import { compileContactHistory, RESULT_STATUS } from '../src/prospect-contact-history.mjs';

const EMAIL = 'hello@agency.example';
const ok = rows => ({ ok: true, rows });
const reads = prospect => ({
  suppressions: ok([]),
  prospects: ok([prospect]),
  outboundReservations: ok([]),
  outboundEvents: ok([]),
  replies: ok([]),
  messages: ok([]),
  providerEvents: ok([])
});

test('a freshly queued imported prospect is informational history, not a prior-contact effect', () => {
  const result = compileContactHistory({
    email: EMAIL,
    reads: reads({
      id: 'pros-new',
      website: 'https://agency.example',
      contact: { email: EMAIL },
      status: 'queued',
      createdAt: '2026-10-04T10:00:00.000Z'
    }),
    now: new Date('2026-10-04T10:05:00.000Z')
  });
  assert.equal(result.status, RESULT_STATUS.CLEAN);
  assert.equal(result.overallContactHistoryHit, false);
  assert.equal(result.sendAuthority, false);
  assert.equal(result.externalEffects, 0);
  assert.equal(result.findings.find(x => x.collection === 'prospects')?.severity, 'INFORMATIONAL');
});

test('queued does not pardon any actual prior-contact evidence', () => {
  const result = compileContactHistory({
    email: EMAIL,
    reads: reads({
      id: 'pros-contacted',
      website: 'https://agency.example',
      contact: { email: EMAIL },
      status: 'queued',
      sentAt: '2026-10-04T09:59:00.000Z'
    }),
    now: new Date('2026-10-04T10:05:00.000Z')
  });
  assert.equal(result.status, RESULT_STATUS.HIT);
  assert.equal(result.overallContactHistoryHit, true);
});
