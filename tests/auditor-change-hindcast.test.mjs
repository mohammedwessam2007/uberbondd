import test from 'node:test';
import assert from 'node:assert/strict';
import { buildAuditorChangeRows, fitBackoff, evaluate, isTrain } from '../src/auditor-change-hindcast.mjs';

const report = (uei, year, ein, extra = {}) => ({ auditee_uei: uei, audit_year: String(year), auditor_ein: ein, entity_type: 'non-profit', total_amount_expended: '2000000', is_going_concern_included: 'No', is_internal_control_material_weakness_disclosed: 'No', is_low_risk_auditee: 'Yes', auditee_state: 'GA', auditor_state: 'GA', ...extra });

test('rows need four years of valid EINs; tenure and outcome come from EIN sequences', () => {
  const rows = [
    ...[2022, 2023, 2024].map(y => report('STAY', y, '11-1111111')), report('STAY', 2025, '111111111'),
    report('NEW', 2022, '111111111'), report('NEW', 2023, '222222222'), report('NEW', 2024, '222222222'), report('NEW', 2025, '333333333'),
    ...[2022, 2023, 2024].map(y => report('GAP', y, '111111111')),
    ...[2022, 2023, 2024, 2025].map(y => report('BADEIN', y, y === 2023 ? '12345' : '111111111')),
    ...[2022, 2023, 2024, 2025].map(y => report('GSA_MIGRATION', y, '111111111')),
  ];
  const out = Object.fromEntries(buildAuditorChangeRows(rows).map(r => [r.uei, r]));
  assert.deepEqual(Object.keys(out).sort(), ['NEW', 'STAY']);
  assert.equal(out.STAY.changed, false, 'EIN punctuation is not a change');
  assert.equal(out.STAY.features.tenure, 3);
  assert.equal(out.NEW.features.tenure, 2);
  assert.equal(out.NEW.changed, true);
  assert.equal(out.STAY.features.portfolio, '1-5');
});

test('train/test split is deterministic by UEI hash', () => {
  assert.equal(isTrain('ABC'), isTrain('ABC'));
  const share = Array.from({ length: 2000 }, (_, i) => isTrain(`U${i}`)).filter(Boolean).length / 2000;
  assert.ok(share > 0.45 && share < 0.55);
});

test('a feature that separates outcomes passes; a useless one is killed', () => {
  const make = (n, signal) => Array.from({ length: n }, (_, i) => {
    const tenure = (i % 3) + 1;
    const changed = signal ? (tenure === 1 ? i % 10 < 8 : i % 50 === 0) : i % 8 === 0;
    return { uei: `U${i}`, changed, features: { tenure, entityType: 'x', portfolio: '1-5', expended: '<1M', goingConcern: false, materialWeakness: false, lowRisk: true, sameState: true } };
  });
  const strong = make(3000, true);
  assert.equal(evaluate(strong.slice(1500), fitBackoff(strong.slice(0, 1500))).decision, 'CONTINUE');
  const noise = make(3000, false);
  const result = evaluate(noise.slice(1500), fitBackoff(noise.slice(0, 1500)));
  assert.equal(result.decision, 'KILL');
  assert.equal(evaluate([], fitBackoff([])).decision, 'KILL');
});
