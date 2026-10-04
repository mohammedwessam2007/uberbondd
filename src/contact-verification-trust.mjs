// Route validity is an external fact. Only an owned adapter's sealed response or
// an exact retained independent observation can supply it to the live read model.
import crypto from 'node:crypto';
import fs from 'node:fs';
const observationUrl = new URL('../artifacts/outreach/clearbounce-powerhouse-20261004.json', import.meta.url);
const payload = r => JSON.stringify({route:String(r.route||'').toLowerCase(),provider:r.provider,state:r.state,checkedAt:r.checkedAt,expiresAt:r.expiresAt||null,sourceUrl:r.sourceUrl,sourceRecordId:r.sourceRecordId,evidenceClass:r.evidenceClass,confidence:r.confidence,riskFlags:r.riskFlags||[]});
const signature = (r,key) => crypto.createHmac('sha256',key).update(payload(r)).digest('hex');
export function sealAdapterVerification(receipt, key = process.env.ADMIN_TOKEN) {
  return key?.length >= 16 ? {...receipt,receiptSignature:signature(receipt,key)} : receipt;
}
export function isTrustedContactVerification(receipt, key = process.env.ADMIN_TOKEN) {
  if (receipt?.provider === 'Hunter' && receipt.sourceUrl === 'https://api.hunter.io/v2/email-verifier' && key?.length >= 16) {
    const a=Buffer.from(String(receipt.receiptSignature||'')); const b=Buffer.from(signature(receipt,key));
    return a.length===b.length && crypto.timingSafeEqual(a,b);
  }
  if (receipt?.provider === 'ClearBounce') {
    try {
      const observed=JSON.parse(fs.readFileSync(observationUrl,'utf8'));
      return payload(receipt)===payload(observed) && observed.mailboxExists===true && observed.state==='VALID' && fs.existsSync(new URL('../'+observed.screenshotRef,import.meta.url));
    } catch { return false; }
  }
  return false;
}
