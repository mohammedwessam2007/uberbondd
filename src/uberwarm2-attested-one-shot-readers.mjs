/**
 * A narrowly scoped cryptographic gate for real UberWarm one-shot evidence.
 * Public keys come exclusively from the protected operator environment; the
 * untrusted manifest can never introduce or replace a trust anchor.
 *
 * This is a verifier, NOT a provider/recipient attestor. Tests with a generated
 * signing key are fixtures and do not establish any real live authority.
 */
import { createPublicKey, verify as verifySignature } from 'node:crypto';
import { readFileSync } from 'node:fs';

export const UBERWARM2_ATTESTED_READERS_VERSION = 'uberbond.uberwarm2-attested-readers.v1';
export const ONE_SHOT_EVIDENCE_ROLES = Object.freeze({
  readVerifiedHttpsTransport: 'independent-transport-operator',
  readLocalHold: 'owner-risk-operator',
  readVerifiedDnsAlignment: 'dns-authentication-operator',
  readAuthenticatedConsent: 'authenticated-recipient-controller',
  readCurrentReceiveReady: 'receiver-availability-operator',
  readSuppression: 'recipient-suppression-operator'
});
const BOUND_MS = 60000;
const kinds = Object.keys(ONE_SHOT_EVIDENCE_ROLES);
const strict = (v,max=300) => typeof v === 'string' && v.length>0 && v.length<=max && v===v.trim();

function stable(value, depth=0) {
  if(depth>12) throw Error('object-too-deep');
  if(value===null || typeof value==='boolean'||typeof value==='string') return JSON.stringify(value);
  if(typeof value==='number' && Number.isFinite(value)) return JSON.stringify(value);
  if(Array.isArray(value)) {
    if(value.length>70) throw Error('array-too-long');
    return '['+value.map(v=>stable(v,depth+1)).join(',')+']';
  }
  if(!value||typeof value!=='object'||Object.getPrototypeOf(value)!==Object.prototype) throw Error('non-plain-value');
  const keys=Object.keys(value).sort();
  if(keys.length>70||keys.some(k=>['__proto__','constructor','prototype'].includes(k))) throw Error('unsafe-object-key');
  return '{'+keys.map(k=>JSON.stringify(k)+':'+stable(value[k],depth+1)).join(',')+'}';
}
export const attestedOneShotSigningPayload = ({kind,signerId,observedAt,expiresAt,row}) =>
  Buffer.from(stable({version:UBERWARM2_ATTESTED_READERS_VERSION,kind,signerId,observedAt,expiresAt,row}));

function parseKeys(keys) {
  try {
    if(typeof keys!=='object'||!keys||Array.isArray(keys)) return null;
    const entries=Object.entries(keys);
    if(entries.length<6||entries.length>30)return null;
    const out={};
    for(const [id,value] of entries){
      if(!/^[A-Za-z0-9._:-]{1,120}$/.test(id)||!strict(value?.role,80)||
         !Object.values(ONE_SHOT_EVIDENCE_ROLES).includes(value.role)||
         typeof value?.publicKeyPem!=='string'||value.publicKeyPem.length>1000||
         !value.publicKeyPem.includes('-----BEGIN PUBLIC KEY-----'))return null;
      const key=createPublicKey(value.publicKeyPem);
      if(key.asymmetricKeyType!=='ed25519')return null;
      out[id]={role:value.role,key};
    }
    return out;
  }catch{return null;}
}

/**
 * Reads evidence afresh on every preflight call. All roles must be held by
 * distinct operator identities (different signing public keys), preventing a
 * single consent/suppression record from impersonating independent sources.
 * Identity proof still requires a REAL correctly delegated attestor; producing
 * an arbitrary private key and signing a claim is never authoritative.
 */
export function createUberWarm2AttestedOneShotReaders({readEvidence, trustedPublicKeys, clock=Date.now}={}){
  const trusted=parseKeys(trustedPublicKeys);
  const usable=typeof readEvidence==='function'&&typeof clock==='function'&&trusted!==null;
  const keyIds=trusted?Object.entries(trusted):[];
  // A single key reused under different IDs is not six independent sources.
  const fingerprints=keyIds.map(([,value])=>value.key.export({type:'spki',format:'der'}).toString('base64'));
  const unique=fingerprints.length===new Set(fingerprints).size;
  const allRoles=Object.values(ONE_SHOT_EVIDENCE_ROLES).every(role=>keyIds.some(([,v])=>v.role===role));
  const configured=usable&&unique&&allRoles;
  const readers={};
  for(const kind of kinds){
    readers[kind]=async ({email,domain,probeId}={})=>{
      if(!configured||!strict(email,320))return [];
      let evidence;
      try { evidence=JSON.parse(await readEvidence()); } catch {return [];}
      const entries=evidence?.attestations?.[kind];
      if(!Array.isArray(entries)||entries.length!==1)return [];
      const x=entries[0],key=trusted[x?.signerId];
      if(!key||key.role!==ONE_SHOT_EVIDENCE_ROLES[kind]||x?.kind!==kind||
        !strict(x?.signature,200)||!strict(x?.signerId,120)||
        !x.row||typeof x.row!=='object'||Array.isArray(x.row))return [];
      if(Object.prototype.hasOwnProperty.call(x.row,'signed')||Object.prototype.hasOwnProperty.call(x.row,'verified'))return [];
      if(x.row.email!==email||domain!==undefined&&x.row.domain!==domain||
        probeId!==undefined&&x.row.probeId!==undefined&&x.row.probeId!==probeId)return [];
      const now=Number(clock()),observed=Date.parse(x.observedAt),expires=Date.parse(x.expiresAt);
      if(!Number.isFinite(now)||!Number.isFinite(observed)||!Number.isFinite(expires)||
        observed>now||now-observed>BOUND_MS||expires<=now||expires-observed>BOUND_MS)return [];
      if(new Date(observed).toISOString()!==x.observedAt||new Date(expires).toISOString()!==x.expiresAt)return [];
      try {
        const sig=Buffer.from(x.signature,'base64url');
        if(sig.length!==64||!verifySignature(null,attestedOneShotSigningPayload(x),key.key,sig))return [];
        // Ed25519 validation, not a caller's `signed:true` claim. The row's
        // original source provenance is preserved, never impersonated.
        if(!strict(x.row.evidenceRef,500)||!strict(x.row.observedAt,40)||x.row.observedAt!==x.observedAt)return [];
        return [Object.freeze({...x.row,verified:true,signed:true,receiptId:x.row.receiptId||x.signerId})];
      }catch{return []}
    };
  }
  return Object.freeze({configured,reasonCodes:configured?[]:['six-independent-pinned-ed25519-evidence-operators-required'],readers:Object.freeze(readers)});
}

export function createUberWarm2AttestedFileReaders({path,publicKeys,clock}={}){
  return createUberWarm2AttestedOneShotReaders({
    readEvidence:async()=>readFileSync(path,{encoding:'utf8',flag:'r'}),
    trustedPublicKeys:publicKeys,clock
  });
}
