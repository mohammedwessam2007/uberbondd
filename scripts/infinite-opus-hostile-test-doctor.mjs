import fs from 'node:fs';
import path from 'node:path';
const root=path.resolve(new URL('..',import.meta.url).pathname);
const matrix=JSON.parse(fs.readFileSync(path.join(root,'config/infinite-opus-hostile-test-matrix.json'),'utf8'));
const reasons=[];
if(matrix?.schemaVersion!=='uberbond.infinite-opus.hostile-test-matrix.v1')reasons.push('matrix-schema-mismatch');
if(!Array.isArray(matrix?.cases)||matrix.cases.length!==27||matrix.requiredCount!==27)reasons.push('all-27-hostile-cases-required');
const ids=new Set();
for(const row of matrix?.cases??[]){
 if(!row.id||ids.has(row.id))reasons.push('duplicate-or-missing-case-id:'+String(row.id));ids.add(row.id);
 const file=path.join(root,String(row.file||''));if(!fs.existsSync(file)){reasons.push('missing-test-file:'+String(row.file));continue;}
 const source=fs.readFileSync(file,'utf8');if(!String(row.needle||'')||!source.includes(row.needle))reasons.push('missing-test-needle:'+String(row.id));
}
const receipt={ok:reasons.length===0,status:reasons.length?'HOSTILE_MATRIX_REFUSED':'ALL_PROMPT_HOSTILE_CASES_BOUND_TO_TEST_SOURCE',required:27,bound:(matrix?.cases??[]).length,reasons,truthBoundary:'This verifies source bindings for every mandated hostile case. The test runner must still execute them.'};
console.log(JSON.stringify(receipt,null,2));if(!receipt.ok)process.exitCode=2;
