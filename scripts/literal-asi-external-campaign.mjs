#!/usr/bin/env node
import fs from 'node:fs';
import { compileLiteralAsiExternalCampaign } from '../src/literal-asi-external-campaign.mjs';

const inputPath = process.argv[2] || 'artifacts/c21-twenty-dimension-result.json';
const c21 = JSON.parse(fs.readFileSync(inputPath, 'utf8'));
const result = compileLiteralAsiExternalCampaign({
  candidateId: c21.candidateId,
  candidateRevision: c21.candidateRevision,
  c21EvidenceDigest: c21.c21EvidenceDigest,
  createdAt: new Date()
});
process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
if (!result.ok) process.exitCode = 1;
