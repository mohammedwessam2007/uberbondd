import {createHash} from 'node:crypto';

export const MECHANISM_IDENTITY_VERSION='uberbond.mechanism-identity.v1';
const clean=v=>String(v??'').trim().toLowerCase().replace(/\s+/g,' ');
const stable=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');

export function canonicalMechanismIdentity({intent,inputContract=[],outputContract=[],mechanism=[],operatingConditions={}}={}){
 if(!clean(intent)) throw new Error('intent required');
 const payload={
  intent:clean(intent),
  inputContract:[...inputContract].map(clean).filter(Boolean).sort(),
  outputContract:[...outputContract].map(clean).filter(Boolean).sort(),
  mechanism:[...mechanism].map(clean).filter(Boolean).sort(),
  operatingConditions:Object.fromEntries(Object.entries(operatingConditions||{}).sort(([a],[b])=>a.localeCompare(b)).map(([k,v])=>[clean(k),Array.isArray(v)?v.map(clean).sort():clean(v)]))
 };
 return {version:MECHANISM_IDENTITY_VERSION,mechanismId:`mechanism:${stable(payload)}`,payload};
}

export function sameMechanism(a,b){
 return canonicalMechanismIdentity(a).mechanismId===canonicalMechanismIdentity(b).mechanismId;
}
