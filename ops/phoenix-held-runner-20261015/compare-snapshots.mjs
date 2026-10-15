// Compare two sanitized PHOENIX_SANITIZED_READONLY_SNAPSHOT receipts; no raw DB rows.
import { readFileSync } from 'node:fs';
const [baselinePath, sourcePath] = process.argv.slice(2);
if (!baselinePath || !sourcePath) { console.error('USAGE: node compare-snapshots.mjs <v2-receipt> <source-receipt>'); process.exit(2); }
const read = p => {
  const lines=readFileSync(p,'utf8').trim().split('\n');
  const line=lines.findLast(x=>x.startsWith('PHOENIX_SANITIZED_READONLY_SNAPSHOT '));
  if (!line) throw new Error('SANITIZED_RECEIPT_MISSING');
  const x=JSON.parse(line.slice('PHOENIX_SANITIZED_READONLY_SNAPSHOT '.length));
  if (x.version!=='PHOENIX_PRIVATE_READONLY_DELTA_V1' || !x.repeatableRead ||
      typeof x.tableCount!=='number' || !Array.isArray(x.tables)) throw new Error('RECEIPT_FORMAT');
  return x;
};
try {
  const baseline=read(baselinePath), current=read(sourcePath);
  const map=new Map(baseline.tables.map(x=>[x.table,x]));
  const actual=new Map(current.tables.map(x=>[x.table,x]));
  const tableNames=[...new Set([...map.keys(),...actual.keys()])].sort();
  const changed=tableNames.filter(t=>{
    const a=map.get(t), b=actual.get(t);
    return !a || !b || a.rows!==b.rows || a.contentSha256!==b.contentSha256;
  }).map(t=>({table:t,oldRows:map.get(t)?.rows??null,newRows:actual.get(t)?.rows??null}));
  const schemaChanged=['columnsSha256','indexesSha256','constraintsSha256'].some(x=>baseline[x]!==current[x]);
  const sequencesChanged=baseline.sequenceValuesVisible && current.sequenceValuesVisible
    ? baseline.sequencesSha256!==current.sequencesSha256 : 'UNKNOWN';
  const proof={
    kind:'PHOENIX_POST_SNAPSHOT_DELTA_COMPARISON_V1',
    baselineDatabase:baseline.database, sourceDatabase:current.database,
    baselineTime:baseline.observedAtUtc, sourceTime:current.observedAtUtc,
    baselineRows:baseline.rowCount, sourceRows:current.rowCount,
    baselineTables:baseline.tableCount, sourceTables:current.tableCount,
    changedTables:changed, schemaChanged, sequencesChanged,
    afterBaselineWritesObserved:changed.length>0 || schemaChanged || sequencesChanged===true,
    noWritesAfterComparisonProven:false, writersQuiesced:false,
    approvalForFinalSync:false, approvalForCutover:false
  };
  console.log('PHOENIX_SANITIZED_DELTA '+JSON.stringify(proof));
  if (sequencesChanged==='UNKNOWN') process.exitCode=3;
  else if (proof.afterBaselineWritesObserved) process.exitCode=4;
} catch { console.error('PHOENIX_DELTA_COMPARISON_REFUSED'); process.exitCode=2; }
