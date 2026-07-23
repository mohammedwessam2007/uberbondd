import test from 'node:test';
import assert from 'node:assert/strict';
import { buildDailyDigest, buildWeeklyHealthReport } from '../src/automation/digest.mjs';

test('a clean day reports no owner action needed', () => {
  const digest = buildDailyDigest({
    exceptionSummary: { total: 0, byPriority: {} },
    automationStatus: { mode: 'approval', enabled: true, live: true }
  }, new Date('2026-01-01T12:00:00Z'));
  assert.equal(digest.digestDate, '2026-01-01');
  assert.match(digest.nextOwnerAction, /No exceptions/);
});

test('exceptions surface a concrete next action with the P0 count called out', () => {
  const digest = buildDailyDigest({ exceptionSummary: { total: 3, byPriority: { P0: 1, P1: 2 } } });
  assert.match(digest.nextOwnerAction, /3 exceptions.*1 P0/);
});

test('weekly report aggregates revenue and flags an unhealthy week when dead letters exist', () => {
  const days = [1, 2, 3].map(day => buildDailyDigest({ revenueSummary: { todayRevenue: 50 }, workers: {}, exceptionSummary: {} }, new Date(`2026-01-0${day}T00:00:00Z`)));
  days[1].workers.deadLetterCount = 2;
  const report = buildWeeklyHealthReport(days, { exceptionSummary: { byPriority: {} } });
  assert.equal(report.daysCovered, 3);
  assert.equal(report.totalRevenue, 150);
  assert.equal(report.healthy, false);
  assert.equal(report.worstDeadLetterCount, 2);
});

test('a week with no dead letters and no P0 exceptions is healthy', () => {
  const days = [buildDailyDigest({})];
  const report = buildWeeklyHealthReport(days, { exceptionSummary: { byPriority: {} } });
  assert.equal(report.healthy, true);
});
