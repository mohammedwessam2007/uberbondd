// Read-only recipient-side Gmail transport. No sending, label changes, OAuth
// enrollment, approval minting or signed-reference assertion lives here.
import { createHash } from 'node:crypto';
import { UBERWARM2_SEED_TEMPLATE } from './uberwarm2-seed-executor.mjs';

const EMAIL = /^[A-Za-z0-9._%+-]{1,64}@[A-Za-z0-9-]{1,63}(?:\.[A-Za-z0-9-]{1,63})+$/;
const MESSAGE_ID = /^<?[A-Za-z0-9.!#$%&'*+\-/=?^_`{|}~]+@[A-Za-z0-9.-]+>?$/;
const PROBE_ID = /^[A-Za-z0-9._:-]{1,200}$/;
const digest = x => `sha256:${createHash('sha256').update(JSON.stringify(x)).digest('hex')}`;
const denied = reason => Object.freeze({ ok: false, reasonCodes: [reason], observations: [], sends: 0 });
const ownAddress = value => {
  if (typeof value !== 'string') return null;
  const match = /^(?:[^<>\r\n,]*<([^<>]+)>|([^<>\s,]+))$/.exec(value.trim());
  const email = match && (match[1] || match[2]);
  return email && EMAIL.test(email) ? email.toLowerCase() : null;
};

function singleHeader(message, name) {
  const found = (message?.payload?.headers || []).filter(h => h?.name?.toLowerCase() === name);
  return found.length === 1 && typeof found[0].value === 'string' ? found[0].value : null;
}

function plainBodies(part, depth = 0) {
  if (!part || depth > 8 || part.filename || part.body?.attachmentId) return [];
  if (part.mimeType === 'text/plain' && typeof part.body?.data === 'string') {
    const value = part.body.data;
    if (value.length > 65536 || !/^[A-Za-z0-9_-]*={0,2}$/.test(value)) return [];
    return [Buffer.from(value, 'base64url').toString('utf8')];
  }
  return Array.isArray(part.parts) && part.parts.length <= 32
    ? part.parts.flatMap(p => plainBodies(p, depth + 1)) : [];
}

/** getAccessToken must be an already configured, owner-authorized receiver
 * credential provider. It stays in this closure, never appears in a receipt.
 * The returned observation still needs the EXISTING independently verified
 * signed reference before the protected placement wiring can admit it.
 */
export function createUberWarm2GmailPlacementReader({ receiverEmail, getAccessToken,
  fetchImpl = globalThis.fetch, clock = () => Date.now() } = {}) {
  const receiver = typeof receiverEmail === 'string' ? receiverEmail : '';
  const configured = EMAIL.test(receiver) && receiver === receiver.toLowerCase() &&
    typeof getAccessToken === 'function' && typeof fetchImpl === 'function' && typeof clock === 'function';

  async function inspect(query = {}) {
    if (!configured) return denied('authenticated-receiver-credential-provider-required');
    let probeId, senderEmail, seedEmail, seedProvider, providerMessageId, bodyToken, at, start;
    try {
      if (!query || ![Object.prototype, null].includes(Object.getPrototypeOf(query)))
        return denied('exact-receiver-message-and-live-query-required');
      const fields = ['probeId','senderEmail','seedEmail','seedProvider','providerMessageId','bodyToken','at'];
      const values = fields.map(key => {
        const d = Object.getOwnPropertyDescriptor(query, key);
        if (!d || !Object.hasOwn(d, 'value')) throw Error('plain-query-required');
        return d.value;
      });
      [probeId,senderEmail,seedEmail,seedProvider,providerMessageId,bodyToken,at] = values;
      if (values.slice(0,6).some(v => typeof v !== 'string')) throw Error('primitive-query-required');
      start = Number(clock());
    } catch { return denied('exact-receiver-message-and-live-query-required'); }
    if (!PROBE_ID.test(probeId || '') || bodyToken !== probeId ||
        !EMAIL.test(senderEmail || '') || senderEmail !== senderEmail.toLowerCase() ||
        seedEmail !== receiver || senderEmail === receiver || seedProvider !== 'google' ||
        typeof providerMessageId !== 'string' || !MESSAGE_ID.test(providerMessageId) ||
        providerMessageId.startsWith('<') !== providerMessageId.endsWith('>') ||
        !Number.isFinite(at) || !Number.isFinite(start) || at > start || start - at > 300000)
      return denied('exact-receiver-message-and-live-query-required');
    try {
      const token = await getAccessToken();
      if (typeof token !== 'string' || !token.trim() || /[\r\n]/.test(token))
        return denied('receiver-credential-unavailable');
      const get = async path => {
        const response = await fetchImpl(`https://gmail.googleapis.com/gmail/v1/users/me/${path}`, {
          method: 'GET', redirect: 'error', signal: AbortSignal.timeout(10000),
          headers: { authorization: `Bearer ${token}`, accept: 'application/json' }
        });
        if (response.status !== 200) throw Error('recipient-provider-read-rejected');
        const reader = response.body?.getReader();
        if (!reader) throw Error('bounded-recipient-provider-response-required');
        const chunks = []; let size = 0;
        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            size += value.byteLength;
            if (size > 262144) { await reader.cancel(); throw Error('recipient-provider-response-too-large'); }
            chunks.push(Buffer.from(value));
          }
        } finally { reader.releaseLock(); }
        return JSON.parse(Buffer.concat(chunks, size).toString('utf8'));
      };
      const profile = await get('profile');
      if (profile.emailAddress?.toLowerCase() !== receiver) return denied('authenticated-receiver-identity-mismatch');
      const searchId = providerMessageId.replace(/^<|>$/g, '');
      const params = new URLSearchParams({ q: `in:anywhere rfc822msgid:${searchId}`, includeSpamTrash: 'true', maxResults: '2' });
      const listing = await get(`messages?${params}`);
      if (listing.nextPageToken || !Array.isArray(listing.messages) || listing.messages.length !== 1)
        return denied('exactly-one-independent-receiving-message-required');
      const gmailId = listing.messages[0]?.id;
      if (typeof gmailId !== 'string' || !/^[a-fA-F0-9]{1,64}$/.test(gmailId))
        return denied('recipient-provider-message-identity-invalid');
      const message = await get(`messages/${gmailId}?format=full`);
      if (message.id !== gmailId || singleHeader(message, 'message-id') !== providerMessageId ||
          ownAddress(singleHeader(message, 'from')) !== senderEmail ||
          ownAddress(singleHeader(message, 'to')) !== receiver ||
          singleHeader(message, 'subject') !== UBERWARM2_SEED_TEMPLATE.subject ||
          !plainBodies(message.payload).some(body => body.replace(/\r\n/g, '\n').trimEnd() === UBERWARM2_SEED_TEMPLATE.bodyPrefix + probeId))
        return denied('receiving-message-correlation-mismatch');
      const labels = message.labelIds;
      if (!Array.isArray(labels) || labels.includes('TRASH') ||
          (labels.includes('INBOX') && labels.includes('SPAM')))
        return denied('receiving-folder-ambiguous-or-deleted');
      const finalNow = Number(clock());
      if (!Number.isFinite(finalNow) || finalNow < start || finalNow - at > 300000)
        return denied('receiving-observation-expired-during-read');
      const providerFolder = labels.includes('SPAM') ? 'SPAM' : labels.includes('INBOX') ? 'INBOX' : 'OTHER';
      const identity = { probeId, senderEmail, seedEmail: receiver, provider: 'google',
        messageId: providerMessageId, bodyToken, providerFolder,
        observedAt: new Date(finalNow).toISOString() };
      const receivingProviderEvidenceRef = `gmail-receiving:${digest({ ...identity, gmailId, labels: [...labels].sort() })}`;
      return Object.freeze({ ok: true, status: 'AUTHENTICATED_RECEIVING_MESSAGE_OBSERVED',
        observation: Object.freeze({ ...identity, authenticated: true, receivingProviderEvidenceRef }),
        referenceSignatureVerified: false, protectedReferenceVerificationRequired: true,
        sends: 0, externalEffectAuthority: 'GMAIL_GET_ONLY' });
    } catch { return denied('authenticated-receiver-read-failed'); }
  }
  const readAuthenticatedReceivingEvidence = async query => {
    const result = await inspect(query);
    return result.ok ? [result.observation] : [];
  };
  return Object.freeze({ configured, inspect, readAuthenticatedReceivingEvidence,
    sends: 0, externalEffectAuthority: 'GMAIL_GET_ONLY' });
}
