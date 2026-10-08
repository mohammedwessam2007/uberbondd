import test from 'node:test';
import assert from 'node:assert/strict';
import {precommitPublicWorkload} from '../src/ubermind-public-workload-precommit.mjs';
test('empty corpus returns a refusal',()=>{ const p=precommitPublicWorkload({campaignId:'fixture',asOf:'2026-10-08T10:00:00Z',taskRows:[]}); assert.equal(p.ok,false); });
