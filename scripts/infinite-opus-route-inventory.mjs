import fs from 'node:fs';
import path from 'node:path';
import { cognitionRouteInventory } from '../src/cognition-route-inventory.mjs';
const root=path.resolve(new URL('..',import.meta.url).pathname),out=process.argv[process.argv.indexOf('--output')+1]||null;
const ignore=new Set(['node_modules','.git']);
const files=[];function walk(dir){for(const e of fs.readdirSync(dir,{withFileTypes:true})){if(ignore.has(e.name))continue;const p=path.join(dir,e.name);if(e.isDirectory())walk(p);else if(/\.(mjs|js|cjs|ts)$/.test(e.name)&&!p.includes(`${path.sep}tests${path.sep}`))files.push(p);}}
walk(root);
const patterns=[/api\.openai\.com/g,/api\.anthropic\.com/g,/openrouter\.ai\/api/g,/ai-gateway\.vercel\.sh/g,/\/v1\/chat\/completions/g,/\/v1\/responses/g];
const hits=[];for(const file of files){const rel=path.relative(root,file).replaceAll('\\','/'),lines=fs.readFileSync(file,'utf8').split(/\r?\n/);for(let i=0;i<lines.length;i++)for(const re of patterns){re.lastIndex=0;if(re.test(lines[i]))hits.push({path:rel,line:i+1,pattern:re.source});}}
const known=cognitionRouteInventory().routes;const knownPaths=new Set(known.map(r=>r.source));
const metadataOnly=new Set(['src/infinite-opus-market.mjs','scripts/infinite-opus-market-refresh.mjs','src/openrouter-market-catalog.mjs']);
const freeOnly=new Set(['api/founder-center.mjs']);
const unknown=[...new Set(hits.map(h=>h.path).filter(p=>!knownPaths.has(p)&&!metadataOnly.has(p)&&!freeOnly.has(p)&&p!=='scripts/infinite-opus-route-inventory.mjs'))];
const receipt={schemaVersion:'uberbond.cognition-route-scan.v1',observedAt:new Date().toISOString(),sourceRoot:root,hitCount:hits.length,hits,knownRoutes:known,metadataOnly:[...metadataOnly],freeOnly:[...freeOnly],unknownCashRouteCandidates:unknown,ok:unknown.length===0,truthBoundary:'Static source scan. Dynamic code generation or externally configured endpoints still require runtime policy and reconciliation.'};
const body=JSON.stringify(receipt,null,2)+'\n';if(out)fs.writeFileSync(path.resolve(out),body);process.stdout.write(body);if(!receipt.ok)process.exitCode=2;
