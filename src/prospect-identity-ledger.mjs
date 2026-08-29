import crypto from 'node:crypto';

export const PROSPECT_IDENTITY_POLICY_VERSION = 'uberbond.prospect-identity-ledger.v1';
const sha = (v) => crypto.createHash('sha256').update(String(v)).digest('hex');
const text = (v, m = 300) => String(v ?? '').trim().slice(0, m);

function normalizeDomain(value) {
  let raw = text(value, 500).toLowerCase();
  if (!raw) return '';
  if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(raw)) raw = `https://${raw}`;
  try {
    const host = new URL(raw).hostname.toLowerCase().replace(/^www\./,'').replace(/\.$/,'');
    return /^[a-z0-9.-]+$/.test(host) && host.includes('.') ? host : '';
  } catch { return ''; }
}

function normalizePhone(value) {
  const raw = text(value, 80);
  if (!raw) return '';
  const plus = raw.trim().startsWith('+');
  const digits = raw.replace(/\D/g,'');
  if (digits.length < 7 || digits.length > 15) return '';
  return plus ? `+${digits}` : digits;
}

function normalizeEmail(value) {
  const email = text(value, 320).toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : '';
}

export function deriveProspectIdentity(input = {}) {
  const domain = normalizeDomain(input.domain || input.website);
  const phone = normalizePhone(input.phone);
  const email = normalizeEmail(input.email);
  const reasons = [];
  if (!domain && !phone && !email) reasons.push('at-least-one-stable-business-identity-key-required');
  if (reasons.length) return { ok:false, policyVersion:PROSPECT_IDENTITY_POLICY_VERSION, status:'BLOCKED', reasonCodes:reasons };
  const keys = [];
  if (domain) keys.push({ kind:'DOMAIN', canonical:domain, digest:sha(`domain:${domain}`) });
  if (phone) keys.push({ kind:'PHONE', canonical:phone, digest:sha(`phone:${phone}`) });
  if (email) keys.push({ kind:'EMAIL', canonical:email, digest:sha(`email:${email}`) });
  const primary = keys.find((k)=>k.kind==='DOMAIN') || keys.find((k)=>k.kind==='PHONE') || keys[0];
  return { ok:true, policyVersion:PROSPECT_IDENTITY_POLICY_VERSION, status:'IDENTITY_DERIVED', identity:{ primaryKind:primary.kind, primaryDigest:primary.digest, domain:domain||null, phone:phone||null, email:email||null, keys } };
}

export function deriveOutboundDailyGuard(input = {}) {
  const identity = deriveProspectIdentity(input);
  if (!identity.ok) return identity;
  const channel = text(input.channel,40).toUpperCase();
  const offerRef = text(input.offerRef,160);
  const campaignRef = text(input.campaignRef,160) || 'none';
  const date = new Date(input.occurredAt || Date.now());
  const recipientEmail = normalizeEmail(input.recipientEmail || input.email);
  const reasons=[];
  if (!channel) reasons.push('channel-required');
  if (!offerRef) reasons.push('offer-ref-required');
  if (!Number.isFinite(date.getTime())) reasons.push('valid-occurred-at-required');
  if (channel === 'EMAIL' && !recipientEmail) reasons.push('recipient-email-required-for-email-guard');
  if (reasons.length) return { ok:false, policyVersion:PROSPECT_IDENTITY_POLICY_VERSION, status:'BLOCKED', reasonCodes:reasons };
  const day = date.toISOString().slice(0,10);
  const contactDigest = channel === 'EMAIL' ? sha(`email:${recipientEmail}`) : identity.identity.primaryDigest;
  const guardKey = sha(['outbound-day', identity.identity.primaryDigest, contactDigest, channel, offerRef, campaignRef, day].join('|'));
  return { ok:true, policyVersion:PROSPECT_IDENTITY_POLICY_VERSION, status:'OUTBOUND_GUARD_DERIVED', guard:{ guardKey, day, channel, offerRef, campaignRef, primaryIdentityDigest:identity.identity.primaryDigest, contactDigest }, businessEffectAuthority:'NONE' };
}
