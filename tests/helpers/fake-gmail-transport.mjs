// A fake Gmail HTTP transport for mocked contract tests
// (tests/omnia-v9-gmail-effect-adapter*.test.mjs). Implements only the
// Gmail adapter's interface surface (OAuth token endpoint, messages/send,
// messages list, messages get) -- NOT a real Gmail simulation, and
// explicitly NOT provider evidence per this mission's own instruction
// (section 10): these tests validate this repository's OWN adapter logic
// against a controlled fake, not Gmail's real behavior.
//
// Modeled on the same idea as null-sink-v2.mjs's separate provider ledger:
// a "mailbox" state independent of whatever the calling code remembers,
// so reconcile() genuinely has to look something up rather than reading
// back an in-memory value the test already knows.
import crypto from 'node:crypto';

export const FAKE_GMAIL_MODES = Object.freeze({
  DEFINITE_SUCCESS: 'DEFINITE_SUCCESS',
  DEFINITE_REJECTION: 'DEFINITE_REJECTION',
  TIMEOUT_BEFORE_REQUEST_RECEIVED: 'TIMEOUT_BEFORE_REQUEST_RECEIVED',
  TIMEOUT_AFTER_REQUEST_ACCEPTED: 'TIMEOUT_AFTER_REQUEST_ACCEPTED',
  RATE_LIMITED: 'RATE_LIMITED',
  SERVER_ERROR: 'SERVER_ERROR'
});

function decodeRawMessage(raw) {
  const text = Buffer.from(raw, 'base64url').toString('utf8');
  const [headerBlock, ...bodyParts] = text.split('\r\n\r\n');
  const headers = Object.fromEntries(headerBlock.split('\r\n').map(line => {
    const idx = line.indexOf(':');
    return [line.slice(0, idx).trim().toLowerCase(), line.slice(idx + 1).trim()];
  }));
  return { headers, body: bodyParts.join('\r\n\r\n') };
}

/**
 * Creates one fake transport + its own isolated mailbox. `mode` controls
 * dispatch()-time behavior; the mailbox can additionally be mutated
 * directly (via `mailbox`) to set up reconciliation-only scenarios (wrong
 * recipient, duplicate Message-ID, etc.) that don't correspond to any real
 * send call in the test.
 */
export function createFakeGmailTransport({ mode = FAKE_GMAIL_MODES.DEFINITE_SUCCESS } = {}) {
  const mailbox = []; // [{ id, threadId, headers, body }]
  let nextId = 1;

  async function fetchImpl(url, options = {}) {
    const urlStr = String(url);

    if (urlStr.startsWith('https://oauth2.googleapis.com/token')) {
      return jsonResponse(200, { access_token: 'fake-access-token', expires_in: 3600, refresh_token: 'fake-refresh-token' });
    }

    if (urlStr.includes('/messages/send')) {
      const body = JSON.parse(options.body);
      const { headers, body: text } = decodeRawMessage(body.raw);

      if (mode === FAKE_GMAIL_MODES.TIMEOUT_BEFORE_REQUEST_RECEIVED) {
        throw new TypeError('fetch failed: simulated network timeout before the provider ever received this request');
      }
      if (mode === FAKE_GMAIL_MODES.DEFINITE_REJECTION) {
        return jsonResponse(400, { error: { message: 'simulated definite rejection: invalid recipient domain' } });
      }
      if (mode === FAKE_GMAIL_MODES.RATE_LIMITED) {
        return jsonResponse(429, { error: { message: 'simulated rate limit' } });
      }
      if (mode === FAKE_GMAIL_MODES.SERVER_ERROR) {
        // The provider truly stores the message (it did process the request), matching a
        // real "5xx after processing" scenario -- but the client only ever sees the 5xx.
        mailbox.push({ id: `gmail-msg-${nextId}`, threadId: body.threadId || `gmail-thread-${nextId}`, headers, body: text });
        nextId += 1;
        return jsonResponse(500, { error: { message: 'simulated transient server error' } });
      }

      const id = `gmail-msg-${nextId}`;
      const threadId = body.threadId || `gmail-thread-${nextId}`;
      nextId += 1;
      mailbox.push({ id, threadId, headers, body: text });

      if (mode === FAKE_GMAIL_MODES.TIMEOUT_AFTER_REQUEST_ACCEPTED) {
        // The provider truly accepted and stored it -- the response to the caller is lost.
        throw new TypeError('fetch failed: simulated network failure after the provider had already accepted the request');
      }
      return jsonResponse(200, { id, threadId });
    }

    if (urlStr.includes('/messages?')) {
      const qs = new URL(urlStr).searchParams;
      const q = qs.get('q') || '';
      const match = /rfc822msgid:(.+)/.exec(q);
      const targetMessageId = match ? match[1].trim() : null;
      const found = mailbox.filter(m => stripAngle(m.headers['message-id']) === stripAngle(targetMessageId));
      return jsonResponse(200, { messages: found.map(m => ({ id: m.id, threadId: m.threadId })) });
    }

    if (urlStr.includes('/messages/')) {
      const id = urlStr.split('/messages/')[1].split('?')[0];
      const found = mailbox.find(m => m.id === id);
      if (!found) return jsonResponse(404, { error: { message: 'not found' } });
      return jsonResponse(200, {
        id: found.id, threadId: found.threadId, snippet: found.body.slice(0, 100),
        payload: {
          headers: Object.entries(found.headers).map(([name, value]) => ({ name, value })),
          mimeType: 'text/plain',
          body: { data: Buffer.from(found.body).toString('base64url') }
        }
      });
    }

    throw new Error(`fake-gmail-transport: unhandled URL ${urlStr}`);
  }

  return { fetchImpl, mailbox, injectMailboxEntry: entry => mailbox.push({ id: `gmail-msg-injected-${crypto.randomUUID()}`, ...entry }) };
}

function stripAngle(value) {
  return String(value || '').replace(/^</, '').replace(/>$/, '');
}

function jsonResponse(status, body) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
    text: async () => JSON.stringify(body)
  };
}
