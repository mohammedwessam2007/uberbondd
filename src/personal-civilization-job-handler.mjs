import fs from 'node:fs/promises';
import path from 'node:path';
import { buildPersonalCivilizationPulse, PERSONAL_CIVILIZATION_KERNEL_VERSION } from './personal-civilization-kernel.mjs';

export const PERSONAL_CIVILIZATION_JOB_VERSION='uberbond.personal-civilization-job.v1';

async function readPrivateSnapshot(root, relativePath) {
  const target=path.resolve(root,relativePath);
  const rootPath=path.resolve(root);
  if(!target.startsWith(rootPath + path.sep)) throw new Error('personal-civilization-private-snapshot-path-refused');
  try {
    const raw=await fs.readFile(target,'utf8');
    const parsed=JSON.parse(raw);
    return parsed && typeof parsed==='object' ? parsed : null;
  } catch(error) {
    if(error?.code==='ENOENT') return null;
    throw error;
  }
}

export async function runPersonalCivilizationJob({ root=process.cwd(), snapshot=null, privateSnapshotPath='private/personal-civilization-input.json', persist=true, overrides={} }={}) {
  let source = snapshot && typeof snapshot === 'object' ? snapshot : null;
  if(!source) source=await readPrivateSnapshot(root,privateSnapshotPath);
  if (!source) return { ok:true,status:'PERSONAL_CIVILIZATION_NO_PRIVATE_SNAPSHOT',externalEffectAuthority:'NONE' };
  const pulse=buildPersonalCivilizationPulse({ ...source, ...(overrides && typeof overrides==='object' ? overrides : {}) });
  const receipt={
    schemaVersion:PERSONAL_CIVILIZATION_JOB_VERSION,
    kernelVersion:PERSONAL_CIVILIZATION_KERNEL_VERSION,
    status:pulse.status,
    privateStateDigest:pulse.privateStateDigest,
    organCount:Object.keys(pulse.organs).length,
    missionCandidateIds:pulse.lifeAutopoiesis.missionCandidates.map(m=>m.id),
    vetoedActionIds:pulse.constitutionalContinuity.vetoedIds,
    externalEffectAuthority:'NONE',
    truthBoundary:pulse.truthBoundary
  };
  if(persist){
    const target=path.join(root,'artifacts','personal-civilization-latest.json');
    await fs.mkdir(path.dirname(target),{recursive:true});
    await fs.writeFile(target,JSON.stringify(receipt,null,2)+'\n','utf8');
  }
  return { ok:true,status:'PERSONAL_CIVILIZATION_PULSE_RECORDED',receipt,pulse };
}
