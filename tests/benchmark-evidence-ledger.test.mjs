import test from 'node:test';import assert from 'node:assert/strict';import crypto from 'node:crypto';
import { compileC21EvidenceCampaign } from '../src/c21-evidence-factory.mjs';
import { summarizeBenchmarkEvidence } from '../src/benchmark-evidence-ledger.mjs';
const D=v=>crypto.createHash('sha256').update(String(v)).digest('hex');
const c=compileC21EvidenceCampaign({candidateId:'u',candidateRevision:'r',frozenAt:'2026-09-11T14:20:00Z',rotationSaltDigest:D('x')}).campaign;
test('empty ledger reports zero observed and all dimensions missing',()=>{const r=summarizeBenchmarkEvidence({campaign:c,receipts:[]});assert.equal(r.counts.observedNonsynthetic,0);assert.equal(r.counts.missing,20);assert.equal(r.counts.missingCritical,7);assert.equal(r.asiStatus,'SYSTEM_LEVEL_ASI_NOT_ESTABLISHED');});
test('synthetic fixtures never count as observed system evidence',()=>{const cell=c.cells[0];const r=summarizeBenchmarkEvidence({campaign:c,receipts:[{dimension:cell.dimension,observed:true,synthetic:true}]});assert.equal(r.counts.observedNonsynthetic,0);assert.equal(r.asiStatus,'SYSTEM_LEVEL_ASI_NOT_ESTABLISHED');});
