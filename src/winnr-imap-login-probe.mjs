import { connectImapSocket, openImapCredential } from './uberimap.mjs';

// Login-only IMAP authentication check for one Winnr mailbox.
// The protocol is: TLS connect -> server greeting -> LOGIN -> LOGOUT. It never issues SELECT, SEARCH, FETCH,
// STORE or EXPUNGE, so no message content, headers or flags are read or changed. The output is a bounded
// classification. Raw server text, usernames and passwords are never returned or logged.

export const WINNR_IMAP_LOGIN_PROBE_VERSION = 'uberbond.winnr-imap-login-probe.v1';

const clean = (value, max = 120) => String(value ?? '').trim().slice(0, max);
const quote = value => `"${String(value ?? '').replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
const UNREACHABLE = new Set(['ETIMEDOUT', 'ECONNREFUSED', 'EHOSTUNREACH', 'ENETUNREACH', 'ECONNRESET', 'EAI_AGAIN', 'ENOTFOUND']);

const safeCode = error => {
  const code = clean(error?.code || error?.name || 'UNKNOWN', 80).toUpperCase().replace(/[^A-Z0-9_-]/g, '_');
  return code || 'UNKNOWN';
};

const bounded = fields => Object.freeze({
  version: WINNR_IMAP_LOGIN_PROBE_VERSION,
  ...fields,
  mailboxSelected: false,
  messageContentRead: false,
  messagesRead: 0,
  messagesSent: 0,
  rawProviderTextLogged: false,
  credentialsLogged: false
});

function runTagged(socket, tag, line, timeoutMs) {
  return new Promise((resolve, reject) => {
    let buffer = '';
    const timer = setTimeout(() => done(Object.assign(new Error('imap-login-probe-timeout'), { code: 'ETIMEDOUT' })), timeoutMs);
    const onData = chunk => {
      buffer += Buffer.from(chunk).toString('latin1');
      if (buffer.length > 65536) return done(Object.assign(new Error('imap-login-probe-response-too-large'), { code: 'IMAP_RESPONSE_TOO_LARGE' }));
      const match = buffer.match(new RegExp(`(?:^|\\r\\n)${tag} (OK|NO|BAD)(?: \\[([A-Z0-9_-]{1,80})\\])?`, 'i'));
      if (match) done(null, { status: match[1].toUpperCase(), responseCode: (match[2] || 'NONE').toUpperCase() });
    };
    const onError = error => done(error);
    const onClose = () => done(Object.assign(new Error('imap-login-probe-connection-closed'), { code: 'IMAP_CONNECTION_CLOSED' }));
    function done(error, value) {
      clearTimeout(timer);
      socket.off('data', onData);
      socket.off('error', onError);
      socket.off('close', onClose);
      buffer = '';
      if (error) reject(error);
      else resolve(value);
    }
    socket.on('data', onData);
    socket.once('error', onError);
    socket.once('close', onClose);
    socket.write(`${tag} ${line}\r\n`);
  });
}

export async function probeWinnrImapLoginOnly({
  account = {},
  encryptionKey = '',
  connectFactory = connectImapSocket,
  timeoutMs = 15000
} = {}) {
  let credential;
  try {
    credential = openImapCredential(account, encryptionKey);
  } catch (error) {
    return bounded({ classification: 'CREDENTIAL_UNAVAILABLE', stage: 'CREDENTIAL', errorClass: safeCode(error), connectAttempted: false, loginAttempted: false, loginAccepted: false });
  }
  if (/[\r\n\0]/.test(`${credential.username}${credential.password}`)) {
    return bounded({ classification: 'CREDENTIAL_UNSAFE_FOR_LITERAL', stage: 'CREDENTIAL', connectAttempted: false, loginAttempted: false, loginAccepted: false });
  }

  const route = account.imapRoute || {};
  let socket;
  try {
    socket = await connectFactory({ host: route.host, port: route.port, secure: route.secure !== false, timeoutMs });
  } catch (error) {
    const code = safeCode(error);
    return bounded({
      classification: UNREACHABLE.has(code) ? 'TRANSPORT_UNREACHABLE' : 'TLS_OR_GREETING_FAILED',
      stage: 'CONNECT',
      errorClass: code,
      connectAttempted: true,
      loginAttempted: false,
      loginAccepted: false
    });
  }

  try {
    const login = await runTagged(socket, 'WL0001', `LOGIN ${quote(credential.username)} ${quote(credential.password)}`, timeoutMs);
    if (login.status !== 'OK') {
      return bounded({
        classification: login.status === 'NO' ? 'AUTH_REJECTED' : 'PROTOCOL_REJECTED',
        stage: 'LOGIN',
        responseCode: login.responseCode,
        connectAttempted: true,
        loginAttempted: true,
        loginAccepted: false
      });
    }
    try { await runTagged(socket, 'WL0002', 'LOGOUT', timeoutMs); } catch { /* logout is best effort; login already answered */ }
    return bounded({
      classification: 'AUTH_CONFIRMED',
      stage: 'LOGIN',
      responseCode: login.responseCode,
      connectAttempted: true,
      loginAttempted: true,
      loginAccepted: true
    });
  } catch (error) {
    return bounded({
      classification: UNREACHABLE.has(safeCode(error)) ? 'TRANSPORT_UNREACHABLE' : 'PROTOCOL_FAILED',
      stage: 'LOGIN',
      errorClass: safeCode(error),
      connectAttempted: true,
      loginAttempted: true,
      loginAccepted: false
    });
  } finally {
    try { socket.end(); } catch { /* socket already closed */ }
  }
}
