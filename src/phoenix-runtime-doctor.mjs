import crypto from 'node:crypto';
import { validatePhoenixLocalDraft } from './phoenix-owner-vault.mjs';

export const PHOENIX_RUNTIME_DOCTOR_VERSION='uberbond.phoenix-runtime-doctor.v1';

/**
 * Read-only production boot smoke. No private data read; LIMIT 0 proves only
 * table query/schema reachability. Synthetic cryptographic round-trip proves
 * the real Node crypto path, not an authenticated owner HTTP write.
 */
export async function runPhoenixRuntimeDoctor(store,{observedAt=new Date().toISOString()}={}){
  const body={
    schemaVersion:'uberbond.phoenix-local-draft.v1',
    sourceType:'MANUAL_LOCAL_DRAFT_NOT_FULL_CHAT_EXPORT',
    exportedAt:'2026-10-08T00:00:00.000Z',
    mainSha:null,
    moonshotCorpusSha:'23bb3c1813e3b5997d8ec76c801db2d5c59baf780573fb496da867d90d7017f0',
    entries:[{id:'checkpoint-1',kind:'UNKNOWN',summary:'Synthetic PHOENIX read-only diagnostic. No owner content.',source:'RESEARCH',recordedAt:'2026-10-08T00:00:00.000Z'}],
    truthBoundary:'MANUALLY_ENTERED_MATERIAL_ONLY; SOURCE_NOT_REVALIDATED; ZERO_EXTERNAL_EFFECT_AUTHORITY'
  };
  const envelope={body,digest:crypto.createHash('sha256').update(JSON.stringify(body)).digest('hex')};
  let cryptoVerified=false,forgeryRejected=false,tableQueryOk=false;
  try{cryptoVerified=validatePhoenixLocalDraft(envelope).ok===true}catch{}
  try{
    validatePhoenixLocalDraft({...envelope,body:{...body,entries:[{...body.entries[0],summary:'tampered synthetic note'}]}});
  }catch(error){forgeryRejected=error.phoenixCode==='DIGEST_MISMATCH';}
  try{
    const records=await store.list('phoenixCapsules',{limit:0});
    tableQueryOk=Array.isArray(records) && records.length===0;
  }catch{}
  const ok=cryptoVerified&&forgeryRejected&&tableQueryOk;
  return {schemaVersion:PHOENIX_RUNTIME_DOCTOR_VERSION,ok,status:ok?'PHOENIX_NATIVE_CRYPTO_AND_DB_SCHEMA_READY':'PHOENIX_RUNTIME_PROOF_INCOMPLETE',
    observedAt,cryptoVerified,forgeryRejected,tableQueryOk,
    ownerSessionRoundtripObserved:false,clientPayloadsRead:0,rowsWritten:0,
    secretsExposed:false,authority:'NONE',
    truthBoundary:'Native Node digest verification and read-only LIMIT 0 query only; not an authenticated HTTP save/restore test or proof of auto-capturing native ChatGPT conversations.'};
}
