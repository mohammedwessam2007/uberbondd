#!/usr/bin/env node
import crypto from 'node:crypto';
import { readFileSync, writeFileSync, existsSync, readdirSync, mkdirSync } from 'node:fs';
import { resolve, dirname, join, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { compileSemanticRequirementTribunal, inferSemanticRequirementClass } from '../src/semantic-requirement-tribunal.mjs';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const readJson=path=>JSON.parse(readFileSync(join(root,path),'utf8'));
const H=value=>`sha256:${crypto.createHash('sha256').update(String(value)).digest('hex')}`;
const norm=value=>String(value??'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
const safeRead=path=>{try{return readFileSync(join(root,path),'utf8');}catch{return'';}};
const walk=(dir,ext='.mjs')=>{const out=[];const rec=rel=>{let es=[];try{es=readdirSync(join(root,rel),{withFileTypes:true});}catch{return;}for(const e of es){const p=`${rel}/${e.name}`;if(e.isDirectory())rec(p);else if(e.name.endsWith(ext))out.push(p);}};rec(dir);return out;};
const implementationFiles=[...walk('src'),...walk('scripts'),...walk('api')];
const implementationBodies=new Map(implementationFiles.map(path=>[path,safeRead(path)]));

function parseNumberedSections(path){
  const body=safeRead(path);if(!body)return[];
  const lines=body.split(/\r?\n/),sections=[];let current=null;
  const flush=()=>{if(!current)return;current.body=current.lines.join('\n').trim();current.bodyDigest=H(current.body);delete current.lines;sections.push(current);};
  for(let i=0;i<lines.length;i++){
    const m=lines[i].match(/^(#{1,6})\s+(\d+(?:\.\d+)*)(?:\.)?\s+(.+?)\s*$/);
    if(m){flush();current={path,level:m[1].length,number:m[2],title:m[3].trim(),startLine:i+1,lines:[]};}
    else if(current)current.lines.push(lines[i]);
  }
  flush();return sections;
}
const markdownSections=[
  ...parseNumberedSections('docs/SOVEREIGN_COGNITIVE_CONTINUUM_TOTAL_NORTH_STAR.md'),
  ...parseNumberedSections('docs/PERSONAL_CIVILIZATION_ENGINE_NORTH_STAR.md'),
  ...parseNumberedSections('docs/SOVEREIGN_COGNITIVE_CONTINUUM_CHAT_COMPLETENESS_APPENDIX.md')
];
function sectionFor(names=[]){
  const normalized=names.map(norm).filter(Boolean);
  for(const n of normalized){const exact=markdownSections.find(s=>norm(s.title)===n&&s.body.length>0);if(exact)return exact;}
  for(const n of normalized){const containing=markdownSections.filter(s=>s.body.length>0&&norm(s.body).includes(n)).sort((a,b)=>a.body.length-b.body.length)[0];if(containing)return containing;}
  return null;
}
function findStructuredValue(value,names,path='$',depth=0){
  if(depth>20)return null;const normalized=new Set(names.map(norm));
  if(typeof value==='string')return normalized.has(norm(value))?{path,value}:null;
  if(Array.isArray(value)){for(let i=0;i<value.length;i++){const found=findStructuredValue(value[i],names,`${path}[${i}]`,depth+1);if(found)return found;}return null;}
  if(value&&typeof value==='object'){
    const identity=value.name||value.alias||value.id||value.title||value.capabilityId||value.atomId;
    if(identity&&normalized.has(norm(identity)))return{path,value};
    for(const [key,child] of Object.entries(value)){const found=findStructuredValue(child,names,`${path}.${key}`,depth+1);if(found)return found;}
  }
  return null;
}
function meaningFor(row){
  const names=row.literalNames||[];const section=sectionFor(names);
  if(section)return{sourceClass:'SECTION_BODY',sourceRef:`${section.path}#${section.number}:${section.startLine}`,bodyDigest:section.bodyDigest,headingOnly:false};
  for(const artifact of row.sourceArtifacts||[]){if(!artifact.endsWith('.json')||!existsSync(join(root,artifact)))continue;try{const found=findStructuredValue(readJson(artifact),names);if(found){const serialized=JSON.stringify(found.value);return{sourceClass:artifact.includes('aliases')?'ALIAS_CANONICAL_HOME':'STRUCTURED_CANONICAL_VALUE',sourceRef:`${artifact}${found.path}`,bodyDigest:H(serialized),headingOnly:false};}}catch{/* diagnostic tribunal handles absence */}}
  return{sourceClass:'HEADING_ONLY',sourceRef:(row.sourceArtifacts||[])[0]||'UNKNOWN',bodyDigest:H((names||[]).join('|')),headingOnly:true};
}
let manifest=[];try{manifest=readJson('artifacts/sovereign/implementation-manifest.json').entries||[];}catch{/* fail closed through missing behavior */}
const manifestByName=new Map(manifest.map(entry=>[norm(entry.concept),entry]));
function testTitles(paths=[]){const titles=[];for(const path of paths){const body=safeRead(path);for(const match of body.matchAll(/\btest\s*\(\s*(['"`])([^'"`]+)\1/g))titles.push(`${path}#${match[2].trim()}`);}return[...new Set(titles)];}
function exportsFor(paths=[]){const refs=[];for(const path of paths){const body=safeRead(path);for(const match of body.matchAll(/\bexport\s+(?:async\s+)?(?:function|class|const|let|var)\s+([A-Za-z_$][\w$]*)/g))refs.push(`${path}#${match[1]}`);}return[...new Set(refs)];}
function callersFor(paths=[]){const refs=[];for(const source of paths){const target=basename(source);for(const [candidate,body] of implementationBodies){if(candidate===source)continue;if(body.includes(target))refs.push(candidate);}if(source.startsWith('scripts/')||source.startsWith('api/'))refs.push(`ENTRYPOINT:${source}`);}return[...new Set(refs)];}
const NEGATIVE=/refus|reject|block|tamper|cannot|must not|without|invalid|stale|wrong|duplicate|revok|unauthor|mismatch|fail|deny|expired|missing/i;
const RECOVERY=/recover|restart|resume|rollback|retry|restore|revoke|delete|reconcile|crash|idempot/i;
const STATEFUL=/persist|store|queue|database|postgres|writeFile|scheduler|worker|runtime|checkpoint|state\b|ledger|receipt/i;
function buildContract(row){
  const requirementClass=inferSemanticRequirementClass(row,null),meaning=meaningFor(row);
  if(requirementClass==='STRUCTURAL_CONSTITUTION')return{requirementId:row.canonicalId,requirementClass,meaning,structuralRationale:`${row.class||'STRUCTURAL'} is a canonical structure/classification whose executable descendants carry behavior; this row itself must not manufacture implementation credit.`,implementationClaim:false,externalEvidenceRequirement:'NONE_FOR_STRUCTURAL_CONSTITUTION'};
  if(requirementClass==='EXTERNAL')return{requirementId:row.canonicalId,requirementClass,meaning,implementationClaim:false,externalEvidenceRequirement:`Real external or owner-origin evidence required for canonical state ${row.currentState}; repository source cannot satisfy this boundary.`};
  if(requirementClass==='ELAPSED')return{requirementId:row.canonicalId,requirementClass,meaning,implementationClaim:false,externalEvidenceRequirement:'Real elapsed-time longitudinal observation is required; clocks, fixtures and source merges cannot manufacture it.'};
  const names=row.literalNames||[],entry=names.map(n=>manifestByName.get(norm(n))).find(Boolean)||null;
  const sourceRefs=[...(row.currentEvidence?.sourceModules||[])],testRefs=[...(row.currentEvidence?.testModules||[])],titles=testTitles(testRefs),sourceText=sourceRefs.map(path=>safeRead(path)).join('\n');
  const hostile=titles.filter(title=>NEGATIVE.test(title));const recovery=titles.filter(title=>RECOVERY.test(title));
  return{
    requirementId:row.canonicalId,requirementClass,meaning,
    inputRefs:exportsFor(sourceRefs),
    observableBehaviorsOrRefusals:[entry?.note,...titles].filter(Boolean),
    ownerRef:entry?.lane||row.owningLane||null,
    callerRefs:callersFor(sourceRefs),
    stateRefs:[`coverage-state:${row.currentState}`,row.currentEvidence?.reachability?`reachability:${row.currentEvidence.reachability}`:null].filter(Boolean),
    sourceRefs,testRefs,hostileFalsifiers:hostile,
    recoveryBehavior:recovery.length?recovery.join(' | '):(!STATEFUL.test(sourceText)?'NOT_APPLICABLE__STATIC_ANALYSIS_FOUND_NO_STATEFUL_OR_LONG_RUNNING_SURFACE':null),
    runtimeEvidenceRequirement:row.currentEvidence?.reachability==='PRODUCTION'?'EXACT_CURRENT_SOURCE_PRODUCTION_EXECUTION_REQUIRED':row.currentEvidence?.reachability==='OPERATOR_ONLY'?'EXACT_CURRENT_SOURCE_OPERATOR_EXECUTION_REQUIRED':'EXACT_CURRENT_SOURCE_EXECUTION_AND_REACHABILITY_PROOF_REQUIRED',
    externalEvidenceRequirement:'NONE_FOR_INTERNAL_BEHAVIOR__EXTERNAL_OR_OUTCOME_CLAIMS_REMAIN_SEPARATE',
    implementationClaim:true
  };
}

function summarizeInvalidContracts(invalid=[]){
  const familyCounts=new Map();
  for(const item of invalid){
    for(const reason of item?.reasonCodes||[]){
      const family=String(reason).split(':',1)[0];
      familyCounts.set(family,(familyCounts.get(family)||0)+1);
    }
  }
  return{
    reasonFamilyHistogram:Object.fromEntries([...familyCounts.entries()].sort((a,b)=>b[1]-a[1]||a[0].localeCompare(b[0]))),
    sampleInvalidContracts:(invalid||[]).slice(0,25).map(item=>({requirementId:item.requirementId,reasonFamilies:[...new Set((item.reasonCodes||[]).map(reason=>String(reason).split(':',1)[0]))].sort()}))
  };
}

const coverage=readJson('artifacts/sovereign/implementation-coverage-matrix.json');
const contracts=(coverage.rows||[]).map(buildContract);
const tribunal=compileSemanticRequirementTribunal({coverage,contracts});
const diagnostics=summarizeInvalidContracts(tribunal.invalidContracts||[]);
const output={...tribunal,contracts,diagnostics,generatedAt:new Date().toISOString(),generator:'scripts/semantic-requirement-tribunal.mjs',truthBoundary:'Generated contracts are admitted only through the semantic tribunal. Static extraction can propose evidence links; it cannot turn a heading, filename, source presence, test presence or synthetic execution into runtime/external truth.'};
mkdirSync(join(root,'artifacts/sovereign'),{recursive:true});writeFileSync(join(root,'artifacts/sovereign/semantic-requirement-tribunal.json'),`${JSON.stringify(output,null,2)}\n`,'utf8');
console.log(JSON.stringify({ok:tribunal.ok,status:tribunal.status,counts:tribunal.counts,semanticOrphans:tribunal.semanticOrphans?.length||0,floatingContracts:tribunal.floatingContracts?.length||0,invalidContracts:tribunal.invalidContracts?.length||0,...diagnostics,output:'artifacts/sovereign/semantic-requirement-tribunal.json'},null,2));
if(!tribunal.ok)process.exitCode=2;
