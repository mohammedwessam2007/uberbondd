#!/usr/bin/env node
import fs from 'node:fs';
import { evaluateLiteralAsiClaim } from '../src/literal-asi-claim-tribunal.mjs';

const c21Path = process.argv[2] || 'artifacts/c21-twenty-dimension-result.json';
const comparisonsPath = process.argv[3] || null;

if (!comparisonsPath) {
  process.stdout.write(`${JSON.stringify({
    ok: false,
    status: 'LITERAL_ASI_CLAIM_OPERATOR_REFUSED',
    reasonCodes: ['external-comparisons-path-required'],
    asiStatus: 'SYSTEM_LEVEL_ASI_NOT_ESTABLISHED',
    promotionAuthority: 'NONE',
    businessEffectAuthority: 'NONE',
    externalEffectAuthority: 'NONE'
  }, null, 2)}\n`);
  process.exitCode = 2;
} else {
  const c21 = JSON.parse(fs.readFileSync(c21Path, 'utf8'));
  const raw = JSON.parse(fs.readFileSync(comparisonsPath, 'utf8'));
  const comparisons = Array.isArray(raw) ? raw : raw.comparisons;
  const result = evaluateLiteralAsiClaim({
    candidateId: c21.candidateId,
    candidateRevision: c21.candidateRevision,
    c21Evidence: c21,
    comparisons,
    observedAt: new Date()
  });
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  if (!result.ok) process.exitCode = 1;
}
