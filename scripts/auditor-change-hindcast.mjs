#!/usr/bin/env node
// Successor S1: auditor-change early-warning hindcast on keyless FAC bulk data.
//   node scripts/auditor-change-hindcast.mjs --fac-dir <dir with general.csv> --out <file>
// Local computation only. No network, no contact.
import crypto from 'node:crypto';
import { createReadStream, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { csvObjects } from '../src/single-audit-hindcast.mjs';
import { buildAuditorChangeRows, fitBackoff, evaluate, isTrain } from '../src/auditor-change-hindcast.mjs';

const args = process.argv.slice(2);
const flag = name => { const i = args.indexOf(`--${name}`); return i >= 0 ? args[i + 1] : null; };
const facDir = flag('fac-dir');
const out = flag('out');
if (!facDir || !out) { console.error('--fac-dir and --out are required'); process.exit(2); }

const path = join(facDir, 'general.csv');
const columns = ['auditee_uei', 'audit_year', 'auditor_ein', 'entity_type', 'total_amount_expended', 'is_going_concern_included', 'is_internal_control_material_weakness_disclosed', 'is_low_risk_auditee', 'auditee_state', 'auditor_state'];
const rows = [];
for await (const row of csvObjects(createReadStream(path), columns)) if (['2022', '2023', '2024', '2025'].includes(row.audit_year)) rows.push(row);
const fileSha = await new Promise((resolve, reject) => { const h = crypto.createHash('sha256'); createReadStream(path).on('data', d => h.update(d)).on('end', () => resolve(h.digest('hex'))).on('error', reject); });

const all = buildAuditorChangeRows(rows);
const train = all.filter(r => isTrain(r.uei));
const test = all.filter(r => !isTrain(r.uei));
const model = fitBackoff(train);
const result = evaluate(test, model);
const byTenure = [1, 2, 3].map(t => { const g = all.filter(r => r.features.tenure === t); return { tenure: t, n: g.length, changeRate: g.length ? Number((g.filter(r => r.changed).length / g.length).toFixed(4)) : null }; });

const receipt = {
  schema: 'uberbond.machiavelli.s1-auditor-change-hindcast.v1',
  preregistration: 'artifacts/machiavelli/absolute-money-hunt/preregistration-2026-10-22.json (S1)',
  ranAt: new Date().toISOString(),
  data: { facGeneral: { rowsUsed: rows.length, sha256: fileSha } },
  population: { entities: all.length, train: train.length, test: test.length },
  result,
  descriptive: { changeRateByTenure: byTenure },
  truthBoundary: 'Predictability of a public signal, not demand. EIN changes include CPA-firm mergers. No firm or entity was contacted.',
};
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, `${JSON.stringify(receipt, null, 2)}\n`);
console.log(JSON.stringify({ population: receipt.population, result, byTenure }, null, 2));
