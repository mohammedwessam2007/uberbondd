import test from 'node:test';
import assert from 'node:assert/strict';
import {reconcileBibliographicIdentities} from '../src/phoenix-bibliographic-identity.mjs';
test('Wave 7 one DOI/arXiv/title paper keeps separate source records',()=>{
  const r=reconcileBibliographicIdentities({sources:[
    {sourceId:'doi',doi:'https://doi.org/10.1234/example',title:'A Research Paper',sourceRef:'receipt:doi'},
    {sourceId:'arxiv',arxiv:'arXiv:2401.12345v2',title:'A Research Paper!',sourceRef:'receipt:arxiv'},
    {sourceId:'title',title:'a research paper',sourceRef:'receipt:title'}
  ]});
  assert.equal(r.ok,true);
  assert.equal(r.originalSources,3);
  assert.equal(r.distinctPaperCandidates,1);
  assert.deepEqual(r.papers[0].sourceRecords.map(x=>x.sourceId),['arxiv','doi','title']);
  assert.equal(r.papers[0].doi,'10.1234/example');
  assert.equal(r.papers[0].arxiv,'2401.12345');
  assert.equal(r.externalEffectLedger.providerCalls,0);
});
test('conflicting DOI identifiers do not merge merely due title equality',()=>{
  const r=reconcileBibliographicIdentities({sources:[
    {sourceId:'a',doi:'10.1234/aa',title:'A Common Title'},
    {sourceId:'b',doi:'10.5678/bb',title:'A Common Title'}
  ]});
  assert.equal(r.ok,true);
  assert.equal(r.distinctPaperCandidates,2);
});
test('identical DOI reconciles titles with different punctuation and wording',()=>{
  const r=reconcileBibliographicIdentities({sources:[
    {sourceId:'a',doi:'10.1234/ab',title:'Different Title A'},
    {sourceId:'b',doi:'https://doi.org/10.1234/ab',title:'Another Title B'}
  ]});
  assert.equal(r.ok,true);assert.equal(r.distinctPaperCandidates,1);
  assert.equal(r.papers[0].sourceRecords.length,2);
});
test('malformed citation input or duplicate source identity fails closed',()=>{
  for(const sources of [
    [{sourceId:'a',title:'x'}],
    [{sourceId:'a',doi:'notdoi',title:'Valid Paper'}],
    [{sourceId:'a',title:'Valid Paper'},{sourceId:'a',title:'Other Paper'}]
  ])assert.equal(reconcileBibliographicIdentities({sources}).ok,false);
});

test('CoS gateway performs actual bibliographic source reconciliation',async()=>{
  const {runPhoenixCosCommand}=await import('../scripts/phoenix-cos-operator.mjs');
  const result=runPhoenixCosCommand(['paper-reconcile',JSON.stringify({
    sources:[{sourceId:'one',doi:'10.1234/case',title:'Paper With DOI'},{sourceId:'two',doi:'10.1234/case',title:'Paper via PDF'}]
  })]);
  assert.equal(result.ok,true);assert.equal(result.distinctPaperCandidates,1);
  assert.equal(result.externalEffectAuthority,'NONE');
});
