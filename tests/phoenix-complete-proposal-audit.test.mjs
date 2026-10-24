import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const originals=[
 [3,'PHOENIX_CAPABILITY_GENOME_WAVE3_320_2026-10-17.json',320,'capabilities'],
 [4,'PHOENIX_CROSS_PLATFORM_LEVERAGE_WAVE4_256_2026-10-17.json',256,'candidates'],
 [5,'PHOENIX_WAVE5_TRANSCENDENT_AUTOMATION_204_2026-10-17.json',204,'candidates'],
 [6,'PHOENIX_WAVE6_PROOF_CARRYING_EVOLUTION_120_2026-10-17.json',120,'candidates'],
 [7,'PHOENIX_WAVE7_DISCOVERY_ENGINE_120_2026-10-17.json',120,'candidates'],
 [8,'PHOENIX_WAVE8_UNKNOWN_WORLD_TRANSFER_160_2026-10-17.json',160,'candidates'],
 [9,'PHOENIX_WAVE9_MISSING_MACHINERY_180_2026-10-17.json',180,'candidates'],
 [10,'PHOENIX_WAVE10_AUTONOMOUS_POSSIBILITY_ENGINE_200_2026-10-17.json',200,'candidates']
];
test('every source-backed proposal is individually described exactly once in the complete PHOENIX wave docs',()=>{
 const ids=new Set();let total=0;
 for(const [wave,name,count,key] of originals){
  const original=JSON.parse(readFileSync('artifacts/research/phoenix-ten-wave-intake/original-genomes/'+name,'utf8'));
  const rows=original[key];assert.equal(rows.length,count,'wave '+wave);
  const md=readFileSync('docs/PHOENIX_CAPABILITIES_WAVE'+wave+'_EXPLAINED.md','utf8');
  const listed=(md.match(/^\d+\. \*\*(phoenix-(?:capability|wave\d+)-\d{4})\b/gm)||[]);
  assert.equal(listed.length,count,'wave '+wave+' listed rows');
  for(const [i,row] of rows.entries()){
   assert.equal(listed[i],(i+1)+'. **'+row.id,'exact order '+row.id);
   assert.equal(ids.has(row.id),false,'duplicate '+row.id);
   ids.add(row.id);
  }
  total+=rows.length;
 }
 assert.equal(total,1560);
 assert.equal(ids.size,1560);
});
