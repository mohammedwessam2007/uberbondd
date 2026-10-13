import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { runAuthProbeOnly, validateProbeRows, shredFile } from '../scripts/winnr-auth-probe-only.mjs';

const HEADER = 'domain,from_email,from_name,user_name,password,smtp_host,smtp_port,imap_host,imap_port,imap_username,imap_password,footer';
const REF = 'owner-mission:UBERBOND_WINNR_FLEET_FINAL_INTEGRATION_2026-10-13';

function csvFor(rows) {
  return [HEADER, ...rows.map(r => `${r.domain},${r.email},Box,${r.user ?? r.email},${r.pw ?? 'pw-fixture-' + r.email.split('@')[0]},${r.smtpHost ?? 'inbound.example.test'},${r.smtpPort ?? 465},${r.imapHost ?? 'inbound.example.test'},${r.imapPort ?? 993},${r.email},${r.pw ?? 'pw-fixture-' + r.email.split('@')[0]},`)].join('\n');
}

const GOOD = [
  { domain: 'startup-fixture.co', email: 'hello@startup-fixture.co' },
  { domain: 'startup-fixture.co', email: 'team@startup-fixture.co' },
  { domain: 'startup-fixture.co', email: 'connect@startup-fixture.co' }
];

// Fake SMTP transport: exposes only `probe`. If the runner tried any other method, the call would throw.
function fakeSmtp(behaviour = () => ({ confirmed: true, messagesSent: 0 }), calls = []) {
  return opts => {
    calls.push(opts);
    return { ok: true, probe: async () => behaviour(opts) };
  };
}

function fakeImap(behaviour = () => ({ loginAccepted: true, classification: 'AUTH_CONFIRMED' }), calls = []) {
  return async opts => { calls.push(opts); return behaviour(opts); };
}

test('no owner authorization reference means no connection at all', async () => {
  const smtpCalls = [];
  const imapCalls = [];
  const r = await runAuthProbeOnly({ csvText: csvFor(GOOD), ownerAuthorizationRef: '', smtpTransportFactory: fakeSmtp(undefined, smtpCalls), imapProbe: fakeImap(undefined, imapCalls) });
  assert.equal(r.ok, false);
  assert.deepEqual(r.reasonCodes, ['owner-authorization-ref-required']);
  assert.equal(smtpCalls.length + imapCalls.length, 0);
});

test('a pilot domain in the file refuses the whole run before any connection', async () => {
  const pilot = [...GOOD, { domain: 'cedarpointdomains.com', email: 'pilot@cedarpointdomains.com' }];
  const smtpCalls = [];
  const imapCalls = [];
  const r = await runAuthProbeOnly({ csvText: csvFor(pilot), ownerAuthorizationRef: REF, excludeDomains: ['cedarpointdomains.com'], smtpTransportFactory: fakeSmtp(undefined, smtpCalls), imapProbe: fakeImap(undefined, imapCalls) });
  assert.equal(r.status, 'REFUSED_BEFORE_ANY_CONNECTION');
  assert.ok(r.reasonCodes.includes('excluded-domain-present'));
  assert.equal(smtpCalls.length + imapCalls.length, 0);
});

test('non-implicit-TLS ports and STARTTLS-style rows are refused: no plaintext AUTH is ever attempted', () => {
  const v1 = validateProbeRows({ rows: [{ domain: 'x.co', from_email: 'a@x.co', user_name: 'a@x.co', password: 'p', imap_password: 'p', smtp_host: 'h', imap_host: 'h', smtp_port: '587', imap_port: '993', domain_: '' }] });
  assert.equal(v1.ok, false);
  assert.ok(v1.reasonCodes.includes('non-implicit-tls-smtp-port-refused'));
  const v2 = validateProbeRows({ rows: [{ domain: 'x.co', from_email: 'a@x.co', user_name: 'a@x.co', password: 'p', imap_password: 'p', smtp_host: 'h', imap_host: 'h', smtp_port: '465', imap_port: '143' }] });
  assert.ok(v2.reasonCodes.includes('non-implicit-tls-imap-port-refused'));
});

test('a domain column that disagrees with the address refuses the run', () => {
  const v = validateProbeRows({ rows: [{ domain: 'other.co', from_email: 'a@x.co', user_name: 'a@x.co', password: 'p', imap_password: 'p', smtp_host: 'h', imap_host: 'h', smtp_port: '465', imap_port: '993' }] });
  assert.ok(v.reasonCodes.includes('domain-column-address-mismatch'));
});

test('a duplicate address refuses the run', () => {
  const row = { domain: 'x.co', from_email: 'a@x.co', user_name: 'a@x.co', password: 'p', imap_password: 'p', smtp_host: 'h', imap_host: 'h', smtp_port: '465', imap_port: '993' };
  assert.ok(validateProbeRows({ rows: [row, row] }).reasonCodes.includes('duplicate-mailbox-address'));
});

test('every mailbox is probed once over SMTP and once over IMAP, and the receipt holds digests only', async () => {
  const smtpCalls = [];
  const imapCalls = [];
  const r = await runAuthProbeOnly({ csvText: csvFor(GOOD), ownerAuthorizationRef: REF, smtpTransportFactory: fakeSmtp(undefined, smtpCalls), imapProbe: fakeImap(undefined, imapCalls) });
  assert.equal(r.status, 'AUTHENTICATED_ALL');
  assert.equal(r.smtp.accepted, 3);
  assert.equal(r.imap.accepted, 3);
  assert.equal(smtpCalls.length, 3);
  assert.equal(imapCalls.length, 3);
  assert.ok(smtpCalls.every(c => c.port === 465 && c.secure === true && c.authorized === true && c.evidenceRef === REF));
  assert.ok(imapCalls.every(c => c.port === 993 && c.secure === true));
  const text = JSON.stringify(r);
  for (const row of GOOD) assert.equal(text.includes(row.email), false, 'no address in the receipt');
  assert.equal(/pw-fixture/.test(text), false, 'no password in the receipt');
  assert.equal(text.includes('inbound.example.test'), false, 'no host in the receipt');
  assert.equal(r.messagesSent, 0);
  assert.equal(r.credentialsPersisted, false);
});

test('network blocks, auth rejections and TLS failures are counted in separate buckets', async () => {
  const pick = new Map([
    ['hello@startup-fixture.co', { smtp: { errorClass: 'CONNECT_TIMEOUT' }, imap: { classification: 'TRANSPORT_UNREACHABLE' } }],
    ['team@startup-fixture.co', { smtp: { errorClass: 'AUTH_REJECTED' }, imap: { classification: 'AUTH_REJECTED' } }],
    ['connect@startup-fixture.co', { smtp: { errorClass: 'TLS_FAILED' }, imap: { classification: 'TLS_OR_GREETING_FAILED' } }]
  ]);
  const smtp = fakeSmtp(opts => {
    const row = [...pick.keys()].find(k => k.startsWith(opts.username.split('@')[0] + '@'));
    return { confirmed: false, errorClass: pick.get(row).smtp.errorClass, messagesSent: 0 };
  });
  const imap = fakeImap(opts => {
    const row = [...pick.keys()].find(k => k.startsWith(opts.username.split('@')[0] + '@'));
    return { loginAccepted: false, classification: pick.get(row).imap.classification };
  });
  const r = await runAuthProbeOnly({ csvText: csvFor(GOOD), ownerAuthorizationRef: REF, smtpTransportFactory: smtp, imapProbe: imap });
  assert.equal(r.status, 'NOT_ALL_AUTHENTICATED');
  assert.equal(r.smtp.classCounts.NETWORK_BLOCKED, 1);
  assert.equal(r.smtp.classCounts.AUTH_REJECTED, 1);
  assert.equal(r.smtp.classCounts.TLS_FAILED, 1);
  assert.equal(r.imap.classCounts.NETWORK_BLOCKED, 1);
  assert.equal(r.imap.classCounts.AUTH_REJECTED, 1);
  assert.equal(r.imap.classCounts.TLS_FAILED, 1);
  assert.equal(r.networkBlocked.smtp, 1);
  assert.equal(r.networkBlocked.imap, 1);
  assert.equal(r.smtp.accepted, 0);
});

test('a transport that refuses to construct is counted as refused, never as accepted', async () => {
  const r = await runAuthProbeOnly({ csvText: csvFor(GOOD), ownerAuthorizationRef: REF, smtpTransportFactory: () => ({ ok: false, reasonCodes: ['smtp-route-authorization-required'] }), imapProbe: fakeImap() });
  assert.equal(r.smtp.accepted, 0);
  assert.equal(r.smtp.classCounts.REFUSED_BY_TRANSPORT, 3);
});

test('concurrency never exceeds the configured bound', async () => {
  let inFlight = 0;
  let peak = 0;
  const imap = async () => {
    inFlight += 1;
    peak = Math.max(peak, inFlight);
    await new Promise(resolve => setTimeout(resolve, 5));
    inFlight -= 1;
    return { loginAccepted: true };
  };
  const many = Array.from({ length: 10 }, (_, i) => ({ domain: 'startup-fixture.co', email: `box${i}@startup-fixture.co` }));
  const r = await runAuthProbeOnly({ csvText: csvFor(many), ownerAuthorizationRef: REF, concurrency: 3, smtpTransportFactory: fakeSmtp(), imapProbe: imap });
  assert.equal(r.imap.accepted, 10);
  assert.ok(peak <= 3, `peak in-flight ${peak}`);
});

test('shredding overwrites and removes the credential file', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'winnr-shred-test-'));
  const file = path.join(dir, 'creds.csv');
  fs.writeFileSync(file, 'pw-fixture-secret-line\n'.repeat(20));
  shredFile(file);
  assert.equal(fs.existsSync(file), false);
  fs.rmSync(dir, { recursive: true, force: true });
});

test('the probe-only module has no encryption, store, database or Winnr API dependency', () => {
  const source = fs.readFileSync(new URL('../scripts/winnr-auth-probe-only.mjs', import.meta.url), 'utf8');
  assert.equal(/TOKEN_ENCRYPTION_KEY|DATABASE_URL|WINNR_API_TOKEN|createStore|JsonStore|encryptJson|decryptJson/.test(source), false);
  assert.equal(/(?<!stdout|stderr)\.write\(/.test(source.replace(/fs\.writeFileSync|writeFileSync/g, '')), false, 'no socket writes in the runner (stdout and stderr output excluded)');
});
