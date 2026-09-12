import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { compileSleepWealthCycle, UNIVERSAL_WEALTH_ENGINE_VERSION } from './universal-wealth-engine.mjs';

export const UNIVERSAL_WEALTH_JOB_VERSION='uberbond.universal-wealth-job.v1';
const digest=value=>crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
const hashId=value=>crypto.createHash('sha256').update(String(value??'')).digest('hex').slice(0,16);

async function readJson(file){
  try{return JSON.parse(await fs.readFile(file,'utf8'));}
  catch(error){if(error?.code==='ENOENT') return null; throw error;}
}

export async function runUniversalWealthJob({root=process.cwd(),inputPath='private/universal-wealth-input.json',outputPath='artifacts/universal-wealth-latest.json',maxSearchCells=256,maxCanaries=5,maxCapitalAtRisk=0}={}){
  const resolvedRoot=path.resolve(root);
  const inputFile=path.resolve(resolvedRoot,inputPath);
  if(!inputFile.startsWith(`${resolvedRoot}${path.sep}`)) throw new Error('wealth-input-path-must-stay-under-root');
  const outputFile=path.resolve(resolvedRoot,outputPath);
  if(!outputFile.startsWith(`${resolvedRoot}${path.sep}`)) throw new Error('wealth-output-path-must-stay-under-root');
  const input=await readJson(inputFile)||{};
  const cycle=compileSleepWealthCycle({
    signals:Array.isArray(input.signals)?input.signals:[],
    candidates:Array.isArray(input.candidates)?input.candidates:[],
    constraints:input.constraints&&typeof input.constraints==='object'?input.constraints:{},
    maxSearchCells,
    maxCanaries,
    maxCapitalAtRisk
  });
  const receipt={
    schema:UNIVERSAL_WEALTH_JOB_VERSION,
    engineVersion:UNIVERSAL_WEALTH_ENGINE_VERSION,
    generatedAt:new Date().toISOString(),
    inputDigest:digest(input),
    searchCellCount:cycle.searchLattice.cellCount,
    candidateCount:Array.isArray(input.candidates)?input.candidates.length:0,
    canaryCount:cycle.portfolio.canaries.length,
    canaryDigests:cycle.portfolio.canaries.map(hashId),
    externalEffectAuthority:'NONE',
    capitalDeploymentAuthority:'NONE',
    tradingAuthority:'NONE',
    status:cycle.status,
    truthBoundary:'PRIVATE_WEALTH_INPUT_STAYS_RUNTIME_LOCAL; RECEIPT_PERSISTS_ONLY_DIGESTS_COUNTS_AND_AUTHORITY_STATE'
  };
  await fs.mkdir(path.dirname(outputFile),{recursive:true});
  await fs.writeFile(outputFile,`${JSON.stringify(receipt,null,2)}\n`,'utf8');
  return receipt;
}
