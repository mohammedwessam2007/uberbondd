import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const s=fs.readFileSync(new URL('../src/crown-r3-zero-inference-finalizer.mjs',import.meta.url),'utf8');
test('sealed R3 finalizer is metadata plus local adjudication only',()=>{
 assert.match(s,/api\/v1\/generation\?id=/);
 assert.equal(s.includes('/api/v1/chat/completions'),false);
 assert.match(s,/providerInferenceCalls:0/);
 assert.match(s,/payload\.calls\.length!==4/);
 assert.match(s,/adjudicateCrownTournament/);
 assert.match(s,/persistDurableCrownAdmission/);
});
