// Successor S1: can public FAC fields predict an auditor change a year ahead?
// Pre-registered in artifacts/machiavelli/absolute-money-hunt/preregistration-2026-10-22.json.
import crypto from 'node:crypto';
import { PLACEHOLDER_UEIS } from './single-audit-hindcast.mjs';

const MIN_CELL = 30;
const validEin = ein => { const digits = String(ein ?? '').replace(/\D/g, ''); return digits.length === 9 ? digits : null; };
const yes = v => String(v).toLowerCase() === 'yes' || String(v).toLowerCase() === 'true';

const portfolioBucket = n => (n <= 5 ? '1-5' : n <= 20 ? '6-20' : n <= 100 ? '21-100' : '>100');
const expendedBucket = usd => (usd < 1e6 ? '<1M' : usd < 3e6 ? '1-3M' : usd < 1e7 ? '3-10M' : '>10M');

// rows: FAC general rows with auditee_uei, audit_year, auditor_ein, entity_type,
// total_amount_expended, is_going_concern_included,
// is_internal_control_material_weakness_disclosed, is_low_risk_auditee,
// auditee_state, auditor_state. Later rows for the same UEI-year win.
export function buildAuditorChangeRows(rows) {
  const byYear = new Map();
  for (const row of rows) {
    if (PLACEHOLDER_UEIS.has(row.auditee_uei) || !row.auditee_uei) continue;
    const year = Number(row.audit_year);
    if (!byYear.has(year)) byYear.set(year, new Map());
    byYear.get(year).set(row.auditee_uei, row);
  }
  const y = k => byYear.get(k) ?? new Map();
  const portfolio = new Map();
  for (const row of y(2024).values()) { const ein = validEin(row.auditor_ein); if (ein) portfolio.set(ein, (portfolio.get(ein) ?? 0) + 1); }
  const out = [];
  for (const [uei, r24] of y(2024)) {
    const eins = [y(2022).get(uei), y(2023).get(uei), r24, y(2025).get(uei)].map(r => validEin(r?.auditor_ein));
    if (eins.some(e => !e)) continue;
    const [e22, e23, e24, e25] = eins;
    const tenure = e24 !== e23 ? 1 : e23 !== e22 ? 2 : 3;
    out.push({
      uei, changed: e25 !== e24,
      features: {
        tenure,
        entityType: r24.entity_type || 'unknown',
        portfolio: portfolioBucket(portfolio.get(e24) ?? 0),
        expended: expendedBucket(Number(r24.total_amount_expended) || 0),
        goingConcern: yes(r24.is_going_concern_included),
        materialWeakness: yes(r24.is_internal_control_material_weakness_disclosed),
        lowRisk: yes(r24.is_low_risk_auditee),
        sameState: (r24.auditee_state || '').toUpperCase() === (r24.auditor_state || '').toUpperCase(),
      },
    });
  }
  return out;
}

export const isTrain = uei => parseInt(crypto.createHash('sha256').update(uei).digest('hex')[0], 16) % 2 === 0;

const LEVELS = [
  f => JSON.stringify(f),
  f => `${f.tenure}|${f.portfolio}`,
  f => `${f.tenure}`,
];

export function fitBackoff(train) {
  const base = train.length ? train.filter(r => r.changed).length / train.length : 0;
  const tables = LEVELS.map(key => {
    const cells = new Map();
    for (const r of train) { const k = key(r.features); const c = cells.get(k) ?? { n: 0, y: 0 }; c.n += 1; c.y += r.changed ? 1 : 0; cells.set(k, c); }
    return cells;
  });
  // Smoothed toward the base rate with a pseudo-count of MIN_CELL.
  const predict = features => {
    for (let level = 0; level < LEVELS.length; level += 1) {
      const c = tables[level].get(LEVELS[level](features));
      if (c && c.n >= MIN_CELL) return (c.y + base * MIN_CELL) / (c.n + MIN_CELL);
    }
    return base;
  };
  return { base, predict };
}

export function evaluate(test, model, { minSkill = 0.05, minLift = 2 } = {}) {
  if (!test.length) return { n: 0, decision: 'KILL', reason: 'empty test set' };
  const brier = p => test.reduce((s, r, i) => s + (p(r, i) - (r.changed ? 1 : 0)) ** 2, 0) / test.length;
  const scored = test.map(r => ({ r, p: model.predict(r.features) }));
  const brierModel = brier((_, i) => scored[i].p);
  const brierBase = brier(() => model.base);
  const skill = brierBase > 0 ? 1 - brierModel / brierBase : 0;
  const ranked = [...scored].sort((a, b) => b.p - a.p);
  const decile = ranked.slice(0, Math.max(1, Math.floor(ranked.length / 10)));
  const decileRate = decile.filter(s => s.r.changed).length / decile.length;
  const testRate = test.filter(r => r.changed).length / test.length;
  const lift = testRate > 0 ? decileRate / testRate : 0;
  const decision = skill >= minSkill && lift >= minLift ? 'CONTINUE' : 'KILL';
  const round = x => Number(x.toFixed(4));
  return { n: test.length, testChangeRate: round(testRate), trainBaseRate: round(model.base), brierModel: round(brierModel), brierBase: round(brierBase), brierSkill: round(skill), topDecileChangeRate: round(decileRate), topDecileLift: round(lift), decision };
}
