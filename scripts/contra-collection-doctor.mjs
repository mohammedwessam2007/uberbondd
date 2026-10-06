#!/usr/bin/env node
import fs from 'node:fs';
import {
  compileContraCollectionReadiness,
  summarizeContraCollectionReadiness,
  defaultContraFirstCashProjectPlan
} from '../src/contra-collection-readiness.mjs';

const path = process.argv[2];
if (!path) {
  console.error('usage: node scripts/contra-collection-doctor.mjs <account-observation.json>');
  process.exit(2);
}
let observation;
try {
  observation = JSON.parse(fs.readFileSync(path, 'utf8'));
} catch {
  console.error(JSON.stringify({
    ok: false,
    state: 'ACCOUNT_OBSERVATION_REQUIRED',
    reasonCodes: ['valid-json-observation-file-required'],
    businessEffectAuthority: 'NONE',
    externalEffectAuthority: 'NONE'
  }));
  process.exit(2);
}
const report = compileContraCollectionReadiness(observation);
console.log(JSON.stringify({
  report,
  summary: summarizeContraCollectionReadiness(report),
  defaultProjectPlan: defaultContraFirstCashProjectPlan({ priceUsd: 2500 })
}, null, 2));
process.exitCode = report.liveReady ? 0 : 2;
