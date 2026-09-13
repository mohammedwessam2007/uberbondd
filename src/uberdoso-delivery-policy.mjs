import crypto from 'node:crypto';
import { ZERO_EXTERNAL_EFFECTS } from './effect-ledgers.mjs';

export const UBERDOSO_DELIVERY_POLICY_VERSION='uberbond.uberdoso-delivery-policy.v1';
export const UBERDOSO_ALLOWED_RELATIONSHIPS=Object.freeze(['TRANSACTIONAL','USER_INITIATED','EXPLICIT_OPT_IN']);
const zero=()=>structuredClone(ZERO_EXTERNAL_EFFECTS);
const text=(v,m=500)=>String(v??'').trim().slice(0,m);
const hash=v=>crypto.createHash('sha256').update(String(v??'')).digest('hex');
const fail=(codes)=>({ok:false,status:'UBERDOSO_DELIVERY_REFUSED',reasonCodes:[...new Set(codes.filter(Boolean))],externalEffectAuthority:'NONE',externalEffectLedger:zero()});

export function compileUberDosoDeliveryEligibility({recipient='',relationship='',evidenceRefs=[],purpose='',date=new Date()}={}){
  const address=text(recipient,320).toLowerCase();
  const rel=text(relationship,80).toUpperCase();
  const refs=(Array.isArray(evidenceRefs)?evidenceRefs:[]).map(v=>text(v,1000)).filter(Boolean);
  const at=date instanceof Date?date:new Date(date);
  const reasons=[];
  if(!address.includes('@'))reasons.push('valid-recipient-required');
  if(!UBERDOSO_ALLOWED_RELATIONSHIPS.includes(rel))reasons.push('permissioned-relationship-required');
  if(!refs.length)reasons.push('relationship-evidence-required');
  if(!Number.isFinite(at.getTime()))reasons.push('valid-date-required');
  if(reasons.length)return fail(reasons);
  const receipt={
    schemaVersion:'uberdoso.delivery-eligibility.v1',
    observedAt:at.toISOString(),
    recipientDigest:hash(address),
    relationship:rel,
    purpose:text(purpose,500)||null,
    evidenceRefs:refs.slice(0,24),
    status:'UBERDOSO_PERMISSIONED_DELIVERY_ELIGIBLE',
    truthBoundary:'This receipt proves only that a permitted relationship was evidenced for this recipient. It does not send a message, grant campaign authority, bypass suppression, prove sender health, or override unsubscribe/bounce/complaint gates.',
    externalEffectAuthority:'NONE',
    externalEffectLedger:zero()
  };
  receipt.receiptDigest=hash(JSON.stringify(receipt));
  return{ok:true,...receipt};
}
