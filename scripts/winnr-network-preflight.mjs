#!/usr/bin/env node
// Network-only reachability preflight for the Winnr SMTP and IMAP endpoints.
//
// What it does: opens a TCP connection, and for TLS ports performs a TLS handshake with certificate verification,
// then reads the server's greeting line and stops. It never writes a byte to the server.
// What it does not do: no EHLO, STARTTLS, AUTH, LOGIN, MAIL FROM, RCPT TO, DATA or any other command. It reads no
// environment secret, no credential, no database, no encryption key, and calls no provider API.
//
// A completed handshake and greeting proves only that this runtime can reach that endpoint. It is not authentication,
// not deliverability and not permission to contact anyone.
//
// Usage: node scripts/winnr-network-preflight.mjs [--out=<file>] [--timeout-ms=10000]

import net from 'node:net';
import tls from 'node:tls';
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

export const WINNR_NETWORK_PREFLIGHT_VERSION = 'uberbond.winnr-network-preflight.v1';

// kind: TLS_ONLY (control), SMTP_IMPLICIT_TLS (465), SMTP_PLAIN_BANNER (587, banner only, no STARTTLS), IMAP_IMPLICIT_TLS (993).
export const WINNR_PREFLIGHT_TARGETS = Object.freeze([
  Object.freeze({ label: 'control-https-443', host: 'api.winnr.app', port: 443, kind: 'TLS_ONLY' }),
  Object.freeze({ label: 'smtp-implicit-tls-465', host: 'inbound.winnr.app', port: 465, kind: 'SMTP_IMPLICIT_TLS' }),
  Object.freeze({ label: 'smtp-submission-587', host: 'inbound.winnr.app', port: 587, kind: 'SMTP_PLAIN_BANNER' }),
  Object.freeze({ label: 'imap-implicit-tls-993', host: 'inbound.winnr.app', port: 993, kind: 'IMAP_IMPLICIT_TLS' })
]);

const TCP_CODES = new Set(['ECONNREFUSED', 'ETIMEDOUT', 'EHOSTUNREACH', 'ENETUNREACH', 'ECONNRESET', 'ENOTFOUND', 'EAI_AGAIN']);

// Maps a socket or TLS error to a closed vocabulary. Message text never leaves this function.
export function classifyPreflightError(error) {
  const code = String(error?.code || '');
  if (code === 'PREFLIGHT_TIMEOUT') return 'TIMEOUT';
  if (TCP_CODES.has(code)) return code;
  if (/^(CERT_|DEPTH_ZERO|SELF_SIGNED|UNABLE_TO_VERIFY|ERR_TLS_CERT|ERR_TLS_(?!HANDSHAKE))/.test(code)) return 'TLS_VERIFY_FAILED';
  if (/^ERR_SSL|^ERR_TLS|EPROTO/.test(code)) return 'TLS_HANDSHAKE_FAILED';
  return 'UNCLASSIFIED';
}

function greetingOk(kind, line) {
  if (kind === 'IMAP_IMPLICIT_TLS') return /^\* (OK|PREAUTH)\b/.test(line);
  return /^220[ -]/.test(line);
}

// Opens one socket. The timer destroys the socket itself, so a timeout never leaves a live handshake behind.
function openSocket({ kind, host, port, timeoutMs, connectOptions = {} }) {
  return new Promise((resolve, reject) => {
    const plain = kind === 'SMTP_PLAIN_BANNER';
    const s = plain
      ? net.connect({ host, port, ...connectOptions })
      : tls.connect({ host, port, servername: net.isIP(host) ? undefined : host, rejectUnauthorized: true, ...connectOptions });
    const timer = setTimeout(() => {
      s.destroy();
      const error = new Error('connect-timeout');
      error.code = 'PREFLIGHT_TIMEOUT';
      reject(error);
    }, timeoutMs);
    s.once(plain ? 'connect' : 'secureConnect', () => { clearTimeout(timer); resolve(s); });
    s.once('error', error => { clearTimeout(timer); s.destroy(); reject(error); });
  });
}

// Reads the first line the server sends, then stops. The client writes nothing. The timer destroys the socket.
function readGreeting(socket, timeoutMs) {
  return new Promise((resolve, reject) => {
    let buffered = '';
    const timer = setTimeout(() => {
      socket.destroy();
      const error = new Error('greeting-timeout');
      error.code = 'PREFLIGHT_TIMEOUT';
      reject(error);
    }, timeoutMs);
    const finish = () => {
      clearTimeout(timer);
      socket.removeListener('data', onData);
      resolve(buffered.split(/\r?\n/)[0] || '');
    };
    const onData = chunk => {
      buffered += chunk.toString('latin1');
      if (buffered.includes('\n') || buffered.length > 1024) { socket.destroy(); finish(); }
    };
    socket.on('data', onData);
    socket.once('error', error => { clearTimeout(timer); reject(error); });
    socket.once('close', finish);
  });
}

// Probes one endpoint. `connectOptions` lets tests point at local servers and trust a test CA. Production callers use
// the defaults, which verify the certificate chain against the runtime's trust store.
export async function probeEndpoint({ host, port, kind, timeoutMs = 10000, connectOptions = {} } = {}) {
  const started = Date.now();
  const result = { host, port, kind, tcp: 'NOT_ATTEMPTED', tls: 'NOT_APPLICABLE', greeting: 'NOT_READ', outcome: 'UNCLASSIFIED', bytesWrittenByClient: 0, elapsedMs: 0 };
  let socket = null;
  try {
    socket = await openSocket({ kind, host, port, timeoutMs, connectOptions });
    result.tcp = 'CONNECTED';
    if (kind === 'SMTP_PLAIN_BANNER') {
      const line = await readGreeting(socket, timeoutMs);
      result.greeting = /^220[ -]/.test(line) ? 'SMTP_220' : 'UNEXPECTED_GREETING';
      result.outcome = result.greeting === 'SMTP_220' ? 'BANNER_OK' : 'BANNER_UNEXPECTED';
      return finish(result, socket, started);
    }
    result.tls = socket.authorized === true ? 'VERIFIED' : 'NOT_VERIFIED';
    if (result.tls !== 'VERIFIED') {
      result.outcome = 'TLS_VERIFY_FAILED';
      return finish(result, socket, started);
    }
    if (kind === 'TLS_ONLY') {
      result.outcome = 'TLS_VERIFIED';
      return finish(result, socket, started);
    }
    const line = await readGreeting(socket, timeoutMs);
    const ok = kind === 'IMAP_IMPLICIT_TLS' ? /^\* (OK|PREAUTH)\b/.test(line) : /^220[ -]/.test(line);
    result.greeting = ok ? (kind === 'IMAP_IMPLICIT_TLS' ? 'IMAP_OK' : 'SMTP_220') : 'UNEXPECTED_GREETING';
    result.outcome = ok ? 'GREETING_OK' : 'GREETING_UNEXPECTED';
  } catch (error) {
    const cls = classifyPreflightError(error);
    if (cls === 'TLS_VERIFY_FAILED' || cls === 'TLS_HANDSHAKE_FAILED') {
      result.tls = cls === 'TLS_VERIFY_FAILED' ? 'NOT_VERIFIED' : 'HANDSHAKE_FAILED';
      result.outcome = cls;
    } else {
      result.outcome = cls === 'UNCLASSIFIED' ? 'UNCLASSIFIED' : `TCP_${cls}`;
      if (result.tcp === 'NOT_ATTEMPTED') result.tcp = cls;
    }
  }
  return finish(result, socket, started);
}

function finish(result, socket, started) {
  try { socket?.destroy(); } catch { /* already closed */ }
  return { ...result, elapsedMs: Date.now() - started };
}

export async function runNetworkPreflight({ timeoutMs = 10000, targets = WINNR_PREFLIGHT_TARGETS, probe = probeEndpoint } = {}) {
  const results = [];
  for (const target of targets) {
    const outcome = await probe({ host: target.host, port: target.port, kind: target.kind, timeoutMs });
    results.push({ label: target.label, ...outcome });
  }
  const byLabel = Object.fromEntries(results.map(r => [r.label, r.outcome]));
  return Object.freeze({
    version: WINNR_NETWORK_PREFLIGHT_VERSION,
    checkedAt: new Date().toISOString(),
    runtime: { platform: process.platform, node: process.version },
    targets: results,
    summary: {
      controlTlsReachable: byLabel['control-https-443'] === 'TLS_VERIFIED',
      smtp465Ready: byLabel['smtp-implicit-tls-465'] === 'GREETING_OK',
      smtp587BannerReachable: byLabel['smtp-submission-587'] === 'BANNER_OK',
      imap993Ready: byLabel['imap-implicit-tls-993'] === 'GREETING_OK',
      allAuthenticationPortsReachable: ['smtp-implicit-tls-465', 'imap-implicit-tls-993'].every(l => byLabel[l] === 'GREETING_OK')
    },
    bytesWrittenToAnyServer: results.reduce((sum, r) => sum + (r.bytesWrittenByClient || 0), 0),
    credentialsUsed: false,
    authenticationAttempted: false,
    messagesSent: 0,
    truthBoundary: 'Reachability and certificate verification only. A greeting is not authentication. Authentication is verified separately by a no-send AUTH or LOGIN probe, and deliverability is not established here.'
  });
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) {
  const args = Object.fromEntries(process.argv.slice(2).map(a => {
    const [k, ...v] = a.replace(/^--/, '').split('=');
    return [k, v.join('=') || true];
  }));
  const timeoutMs = Number(args['timeout-ms']) || 10000;
  const report = await runNetworkPreflight({ timeoutMs });
  const text = `${JSON.stringify(report, null, 2)}\n`;
  if (typeof args.out === 'string') writeFileSync(args.out, text, { mode: 0o600 });
  process.stdout.write(text);
}
