import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {brotliDecompressSync} from 'node:zlib';
import {machiavelliCorpusStatus,searchMachiavelliPrinciples,getMachiavelliPrinciple,machiavelliChapter} from '../src/machiavelli-strategic-canon.mjs';
const raw=JSON.parse(brotliDecompressSync(Buffer.from(readFileSync(new URL('../artifacts/strategy/machiavelli-principles.v1.json.br.b64',import.meta.url),'utf8').trim(),'base64')));
test('four source works and all 183 address slots, with honest coverage boundaries',()=>{
 const status=machiavelliCorpusStatus(); assert.equal(status.ok,true);assert.equal(status.sourceAddresses,183);
 assert.equal(status.sourceWorks.PRINCE.units,26);assert.equal(status.sourceWorks.DISCOURSES.units,142);
 assert.equal(status.sourceWorks.ART_OF_WAR.units,7);assert.equal(status.sourceWorks.FLORENTINE_HISTORIES.units,8);
 assert.match(status.limitations,/NOT full primary text/i);
 assert.equal(status.modelCalls,0);assert.equal(status.externalEffectAuthority,'NONE');
});
test('all Prince chapters and all Discourses chapters have valid distinct indices',()=>{
 const keys=raw.addresses.map(x=>x.key);assert.equal(new Set(keys).size,183);
 for(let i=1;i<=26;i++)assert.equal(machiavelliChapter({work:'PRINCE',chapter:i}).address.key,`PRINCE:${i}`);
 for(const [book,total] of [[1,60],[2,33],[3,49]])for(let chapter=1;chapter<=total;chapter++){
   const x=machiavelliChapter({work:'DISCOURSES',book,chapter}); assert.equal(x.ok,true); assert.equal(x.originalTextLoaded,false);
 }
});
test('all source references and 106 interpreted principles are structurally valid',()=>{
 assert.equal(raw.principles.length,106);
 const addresses=new Set(raw.addresses.map(x=>x.key)),ids=new Set();
 for(const p of raw.principles){assert.match(p.id,/^MACH-\d{4}$/);assert.ok(!ids.has(p.id));ids.add(p.id);
  assert.ok(addresses.has(p.sectionKey));assert.ok(p.historicalParaphrase.length>=30);
  assert.ok(p.businessTranslation.length>=30);assert.equal(p.authority,'NO_EXTERNAL_EFFECTS');
  assert.ok(['CONTEXTUALIZE','HISTORICAL_HARMFUL__DO_NOT_OPERATIONALIZE'].includes(p.riskTreatment));}
});
test('dangerous historical content has explicit non-implementation guardrails',()=>{
 const bad=raw.principles.filter(x=>x.riskTreatment.startsWith('HISTORICAL_HARMFUL'));
 assert.ok(bad.length>=5);assert.equal(raw.principles.find(x=>x.sectionKey==='DISCOURSES:3.40').riskTreatment,'HISTORICAL_HARMFUL__DO_NOT_OPERATIONALIZE');
 assert.ok(raw.constraints.some(x=>x.includes('fraud')));
});
test('search retrieval keeps history and modern analogy apart; no made-up receipts',()=>{
 const r=searchMachiavelliPrinciples({query:'buyer trust negotiation incentives',limit:8});
 assert.equal(r.ok,true);assert.ok(r.matches.length>0);assert.ok(r.matches.length<=8);
 for(const m of r.matches){assert.match(m.workUrl,/gutenberg.org/);assert.ok(m.historicalParaphrase);assert.ok(m.businessTranslation);}
 assert.equal(r.modelCalls,0);assert.equal(r.businessEffectAuthority,'NONE');
 assert.match(r.evidenceBoundary,/NOT_FULL_PRIMARY_TEXT/);
});
test('untrusted inputs cannot change corpus or request unbounded retrieval',()=>{
 for(const input of [{query:''},{query:'x'.repeat(241)},{query:'love',limit:1000},{query:'<script>alert(1)</script>',limit:-1},{query:'power',work:'BAD'}])
  assert.equal(searchMachiavelliPrinciples(input).ok,false);
 const before=searchMachiavelliPrinciples({query:'reputation'});
 const p=getMachiavelliPrinciple('MACH-0001');p.principle.title='MUTATED';
 assert.notEqual(getMachiavelliPrinciple('MACH-0001').principle.title,'MUTATED');
 assert.deepEqual(before,searchMachiavelliPrinciples({query:'reputation'}));
});
test('exact source IDs are resolvable, missing sources refuse honestly',()=>{
 const p=getMachiavelliPrinciple('MACH-0001');assert.equal(p.ok,true);assert.match(p.guarantee,/NOT_MACHIAVELLI_QUOTE/);
 assert.equal(getMachiavelliPrinciple('MACH-9999').ok,false);
 assert.equal(machiavelliChapter({work:'DISCOURSES',book:4,chapter:1}).ok,false);
 assert.equal(machiavelliChapter({work:'ART_OF_WAR',book:7}).ok,true);
});
test('full book IDs are index-only and not falsely marked fully ingested',()=>{
 for(const work of ['ART_OF_WAR','FLORENTINE_HISTORIES']){
  const book=machiavelliChapter({work,book:1});assert.equal(book.originalTextLoaded,false);
  assert.match(book.address.coverage,/NOT_BOOK_FULL_TEXT_INGESTED/);
 }
});
