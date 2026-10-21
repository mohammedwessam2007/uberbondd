import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {diffApiContracts} from '../src/cash-now-api-contract-diff.mjs';
import {compareProcurementNotices} from '../src/cash-now-procurement-amendments.mjs';
const t=JSON.parse(readFileSync('artifacts/machiavelli/profit-tournament.json','utf8'));
const atlas=JSON.parse(readFileSync('artifacts/machiavelli/wealth-mechanism-atlas.json','utf8'));
const ids=new Set(atlas.records.map(r=>r.id));
test('tournament preserves diverse economic routes while refusing to fabricate first cash',()=>{
 assert.equal(t.rankedCandidates.length,6);assert.equal(new Set(t.rankedCandidates.map(c=>c.type)).size,6);
 assert.equal(t.observedPaidCustomers,0);assert.equal(t.actualClearedProfitUsd,0);assert.deepEqual(t.capitalCandidates,[]);
 for(const c of t.rankedCandidates){assert.equal(c.verifiedClearedProfitUsd,0);assert.equal(c.verifiedPayers,0);assert.equal(c.forecastedProfitUsd,null);assert.equal(c.sellerAccountActivated,'NOT_VERIFIED');assert.ok(c.firstFalsification);assert.ok(c.founderIdeaAncestors.length>=3);for(const d of c.founderIdeaAncestors)assert.ok(ids.has(d.id),d.id);}
 assert.ok(t.rankedCandidates.at(-1).status.startsWith('EXCLUDED'));
});
test('shortlisted mechanisms have functioning local no-network prototypes',()=>{
 assert.equal(t.shortlist.length,2);
 assert.equal(typeof diffApiContracts,'function');assert.equal(typeof compareProcurementNotices,'function');
 for(const id of t.shortlist)assert.ok(t.rankedCandidates.find(c=>c.id===id).prototype.startsWith('src/'));
});
