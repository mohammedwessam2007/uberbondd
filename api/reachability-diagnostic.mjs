import { readdirSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { reachableFromEntryPoints } from '../scripts/system-readiness.mjs';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const productionEntries = ['server.mjs','worker.mjs','scripts/agent-mesh-tick.mjs'];

function entryPointsIn(dir, extension='.mjs') {
  const found=[];
  const walk=relative=>{
    let entries=[];
    try { entries=readdirSync(join(repoRoot,relative),{withFileTypes:true}); } catch { return; }
    for (const entry of entries) {
      const child=`${relative}/${entry.name}`;
      if (entry.isDirectory()) walk(child);
      else if (entry.name.endsWith(extension)) found.push(child);
    }
  };
  walk(dir);
  return found;
}

export default async function handler(req,res) {
  const api=entryPointsIn('api').filter(file=>file!=='api/reachability-diagnostic.mjs');
  const scripts=entryPointsIn('scripts');
  const all=entryPointsIn('src');
  const production=reachableFromEntryPoints([...productionEntries,...api]);
  const anyEntry=reachableFromEntryPoints(['server.mjs','worker.mjs',...scripts,...api]);
  const productionFiles=all.filter(file=>production.has(file));
  const operatorOnly=all.filter(file=>!production.has(file)&&anyEntry.has(file));
  const unreachable=all.filter(file=>!anyEntry.has(file));
  let classified=[];
  try { classified=Object.keys(JSON.parse(readFileSync(join(repoRoot,'config/reachability-classification.json'),'utf8')).modules||{}); } catch {}
  const classifiedSet=new Set(classified);
  const unclassified=unreachable.filter(file=>!classifiedSet.has(file));
  const stale=classified.filter(file=>production.has(file)||anyEntry.has(file));
  res.status(200).json({sourceModules:all.length,production:productionFiles.length,operatorOnly:operatorOnly.length,unreachable:unreachable.length,unclassified,stale});
}
