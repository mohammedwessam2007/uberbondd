// Read-only provider observation. No enroll, resume, campaign, or billing methods.
import { createHash } from 'node:crypto';
import { extractHealthMetrics, compileMailboxHealth, mailboxDigest } from './uberwarm2-health-metrics.mjs';
const base = 'https://app-emailwarmup.bobwork.ai/api/v1';
const hash = value => 'sha256:' + createHash('sha256').update(value).digest('hex');
const domains = ['uberbond.site','uberbondai.shop','uberbondapp.site','uberbondcloud.shop',
  'uberbondconnect.online','uberbondcore.space','uberbondengine.website','uberbondflow.space',
  'uberbondforge.space','uberbondglobal.website'];
const owned = new Set(domains.flatMap(d => ['hello@'+d, 'growth@'+d]));
const empty = status => ({status, authenticated: false, enrolled: null,
  expected: 20, independentPlacementVerified: false, sendAuthority: 'NONE', endpointDigests: {}});

export async function observeBobwork({apiKey, fetchImpl = globalThis.fetch} = {}) {
  if (!apiKey) return empty('NOT_CONFIGURED');
  const receipt = empty('READ_FAILED');
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);
  try {
    // Fixed origin, fixed paths, GET only, redirect refusal: credentials cannot follow redirects.
    const bodies = {};
    for (const path of ['/me', '/mailboxes', '/usage', '/stats']) {
      const response = await fetchImpl(base + path, {method:'GET', redirect:'error',
        headers:{Authorization:'Bearer '+apiKey, Accept:'application/json'}, signal:controller.signal});
      if (!response.ok) return empty(response.status === 429 ? 'RATE_LIMITED' : 'READ_FAILED');
      if (!response.body?.getReader) return empty('SCHEMA_UNVERIFIED');
      const reader = response.body.getReader();
      let bytes = 0; const chunks = [];
      try {
        for (;;) {
          const {done, value} = await reader.read();
          if (done) break;
          bytes += value.byteLength;
          if (bytes > 262144) { await reader.cancel(); return empty('RESPONSE_TOO_LARGE'); }
          chunks.push(Buffer.from(value));
        }
      } finally { reader.releaseLock(); }
      const text = Buffer.concat(chunks).toString('utf8');
      bodies[path] = JSON.parse(text);
      receipt.endpointDigests[path.slice(1)] = hash(text);
    }
    if (bodies['/me']?.email !== 'uberbond.co@gmail.com') return empty('ACCOUNT_IDENTITY_HOLD');
    receipt.authenticated = true;
    const payload = bodies['/mailboxes'];
    const mailboxes = Array.isArray(payload) ? payload : payload?.mailboxes;
    if (!Array.isArray(mailboxes)) return {...receipt, status:'SCHEMA_UNVERIFIED'};
    const identities = mailboxes.map(m => m?.email);
    if (identities.some(e => typeof e !== 'string' || !owned.has(e)) ||
        new Set(identities).size !== identities.length) return {...receipt, status:'MAILBOX_IDENTITY_HOLD'};
    receipt.enrolled = identities.length;
    receipt.mailboxHealth = compileMailboxHealth(mailboxes.map(m => ({mailboxDigest:mailboxDigest(m.email), metrics:extractHealthMetrics(m)})));
    receipt.healthStatus = receipt.mailboxHealth.some(m=>Object.keys(m.metrics).length) ? 'PROVIDER_METRICS_OBSERVED' : 'HEALTH_SCHEMA_UNVERIFIED';
    // Only verified inventory is normalized. Undocumented stats/usage fields remain digest-only.
    // Enrollment and authenticated API access never attest traffic or inbox placement.
    receipt.status = identities.length === 20 ? 'INVENTORY_OBSERVED' : 'ENROLLMENT_GAP';
    return receipt;
  } catch { return empty('READ_FAILED'); }
  finally { clearTimeout(timer); }
}

export function compileBobworkObservation(input) {
  const states = ['NOT_CONFIGURED','READ_FAILED','RATE_LIMITED','SCHEMA_UNVERIFIED',
    'RESPONSE_TOO_LARGE','ACCOUNT_IDENTITY_HOLD','MAILBOX_IDENTITY_HOLD','INVENTORY_OBSERVED','ENROLLMENT_GAP'];
  const output = empty(states.includes(input?.status) ? input.status : 'SCHEMA_UNVERIFIED');
  output.authenticated = input?.authenticated === true;
  output.enrolled = Number.isSafeInteger(input?.enrolled) && input.enrolled >= 0 && input.enrolled <= 20 ? input.enrolled : null;
  for (const name of ['me','mailboxes','usage','stats']) {
    if (/^sha256:[a-f0-9]{64}$/.test(input?.endpointDigests?.[name] || '')) output.endpointDigests[name] = input.endpointDigests[name];
  }
  output.mailboxHealth = compileMailboxHealth(input?.mailboxHealth);
  output.healthStatus = output.mailboxHealth.some(m=>Object.keys(m.metrics).length) ? 'PROVIDER_METRICS_OBSERVED' : 'HEALTH_SCHEMA_UNVERIFIED';
  return output;
}
