import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { runAuthProbeOnly, validateProbeRows, shredFile } from '../scripts/winnr-auth-probe-only.mjs';
import { assertPublicSafe } from '../src/winnr-public-artifact-guard.mjs';
import { WINNR_STARTUP_ROLES } from '../src/winnr-inventory-gate.mjs';

const REF = 'github-environment-approval:winnr-probe:run-1';
const STARTUP = Array.from({ length: 10 }, (_, i) => `startup-${String(i + 1).padStart(2, '0')}.test`);
const PILOT = ['pilot-fixture.test'];
const INVENTORY = JSON.stringify({ startupDomains: STARTUP, pilotDomains: PILOT });
const HEADER = 'domain,from_email,from_name,user_name,password,smtp_host,smtp_port,imap_host,imap_port,imap_username,imap_password,footer';
const SECRET_MARK = 'pw-fixture-leak-marker';

function rows50({ pwFor = () => `${SECRET_MARK}-pw` } = {}) {
  const out = [];
  for (const domain of STARTUP) for (const role of WINNR_STARTUP_ROLES) {
    const email = `${role}@${domain}`;
    out.push({ domain, email, pw: pwFor(email) });
  }
  return out;
}

function csvFor(rows) {
  return [HEADER, ...rows.map(r => `${r.domain},${r.email},Box,${r.email},${r.pw},inbound.test,${r.smtpPort ?? 465},inbound.test,${r.imapPort ?? 993},${r.email},${r.pw},`)].join('\n');
}

function okSmtp() {
  const calls = [];
  const factory = opts => { calls.push(opts); return { ok: true, probe: async () => ({ confirmed: true, messagesSent: 0 }) }; };
  return { factory, calls };
}

function okImap() {
  const calls = [];
  const probe = async opts => { calls.push(opts); return { loginAccepted: true, classification: 'AUTH_CONFIRMED' }; };
  return { probe, calls };
}

// ---- refusals happen before any connection --------------------------------------------------

test('no owner reference means no inventory read and no connection', async () => {
  const s = okSmtp(); const i = okImap();
  const { publicReceipt } = await runAuthProbeOnly({ csvText: csvFor(rows50()), ownerAuthorizationRef: '', expectedInventoryText: INVENTORY, smtpTransportFactory: s.factory, imapProbe: i.probe });
  assert.deepEqual(publicReceipt.reasonCodes, ['owner-authorization-ref-required']);
  assert.equal(s.calls.length + i.calls.length, 0);
});

test('a missing or malformed expected inventory refuses the run before any connection', async () => {
  for (const inv of ['', 'not json', JSON.stringify({ startupDomains: STARTUP.slice(1), pilotDomains: PILOT })]) {
    const s = okSmtp(); const i = okImap();
    const { publicReceipt } = await runAuthProbeOnly({ csvText: csvFor(rows50()), ownerAuthorizationRef: REF, expectedInventoryText: inv, smtpTransportFactory: s.factory, imapProbe: i.probe });
    assert.equal(publicReceipt.status, 'REFUSED_BEFORE_ANY_CONNECTION');
    assert.equal(s.calls.length + i.calls.length, 0);
  }
});

test('a pilot domain inside the export refuses the run before any connection', async () => {
  const rows = rows50();
  rows[0] = { domain: PILOT[0], email: `hello@${PILOT[0]}`, pw: 'x' };
  const s = okSmtp(); const i = okImap();
  const { publicReceipt } = await runAuthProbeOnly({ csvText: csvFor(rows), ownerAuthorizationRef: REF, expectedInventoryText: INVENTORY, smtpTransportFactory: s.factory, imapProbe: i.probe });
  assert.ok(publicReceipt.reasonCodes.includes('pilot-domain-present'));
  assert.equal(s.calls.length + i.calls.length, 0);
});

test('a 49-row partial export is refused and is never reported as AUTHENTICATED_ALL', async () => {
  const s = okSmtp(); const i = okImap();
  const { publicReceipt } = await runAuthProbeOnly({ csvText: csvFor(rows50().slice(1)), ownerAuthorizationRef: REF, expectedInventoryText: INVENTORY, smtpTransportFactory: s.factory, imapProbe: i.probe });
  assert.equal(publicReceipt.status, 'REFUSED_BEFORE_ANY_CONNECTION');
  assert.ok(publicReceipt.reasonCodes.includes('mailbox-count-not-50'));
  assert.equal(s.calls.length + i.calls.length, 0);
});

test('a port other than implicit TLS is refused before any connection, so no plaintext AUTH can occur', () => {
  const rows = rows50().map((r, i) => (i === 0 ? { ...r, smtpPort: 587 } : r));
  const v = validateProbeRows(require_rows(rows));
  assert.ok(v.reasonCodes.includes('non-implicit-tls-smtp-port-refused'));
  const w = validateProbeRows(require_rows(rows50().map((r, i) => (i === 0 ? { ...r, imapPort: 143 } : r))));
  assert.ok(w.reasonCodes.includes('non-implicit-tls-imap-port-refused'));
});

test('an export that offers plaintext submission (587) is refused end to end with no transport built', async () => {
  const rows = rows50().map((r, i) => (i === 0 ? { ...r, smtpPort: 587 } : r));
  const s = okSmtp(); const i = okImap();
  const { publicReceipt } = await runAuthProbeOnly({ csvText: csvFor(rows), ownerAuthorizationRef: REF, expectedInventoryText: INVENTORY, smtpTransportFactory: s.factory, imapProbe: i.probe });
  assert.equal(publicReceipt.status, 'REFUSED_BEFORE_ANY_CONNECTION');
  assert.ok(publicReceipt.reasonCodes.includes('non-implicit-tls-smtp-port-refused'));
  assert.equal(s.calls.length + i.calls.length, 0);
});

test('the public receipt publishes the approval reference under approvalRef and never under an identity-word key', async () => {
  const s = okSmtp(); const i = okImap();
  const { publicReceipt } = await runAuthProbeOnly({ csvText: csvFor(rows50()), ownerAuthorizationRef: REF, expectedInventoryText: INVENTORY, smtpTransportFactory: s.factory, imapProbe: i.probe });
  assert.equal(publicReceipt.approvalRef, REF);
  assert.equal('ownerAuthorizationRef' in publicReceipt, false);
  assert.equal(publicReceipt.inventory.expectedAccounts, 50);
  assert.equal(publicReceipt.identityFieldsPublished, false);
});

function require_rows(list) {
  return list.map(r => ({ from_email: r.email, domain: r.domain, user_name: r.email, password: r.pw, imap_password: r.pw, smtp_host: 'inbound.test', imap_host: 'inbound.test', smtp_port: String(r.smtpPort ?? 465), imap_port: String(r.imapPort ?? 993) }));
}

// ---- happy path, and the output discipline --------------------------------------------------

test('the valid 50-row export is probed once per mailbox and reported as AUTHENTICATED_ALL', async () => {
  const s = okSmtp(); const i = okImap();
  const { publicReceipt, privateDetail } = await runAuthProbeOnly({ csvText: csvFor(rows50()), ownerAuthorizationRef: REF, expectedInventoryText: INVENTORY, smtpTransportFactory: s.factory, imapProbe: i.probe });
  assert.equal(publicReceipt.status, 'AUTHENTICATED_ALL');
  assert.equal(publicReceipt.ok, true);
  assert.equal(publicReceipt.smtp.accepted, 50);
  assert.equal(publicReceipt.imap.accepted, 50);
  assert.equal(s.calls.length, 50);
  assert.equal(i.calls.length, 50);
  assert.ok(s.calls.every(c => c.port === 465 && c.secure === true && c.authorized === true && c.evidenceRef === REF));
  assert.equal(privateDetail.rows.length, 50);
});

test('the public receipt passes the artifact guard and contains no address, domain, host or password', async () => {
  const s = okSmtp(); const i = okImap();
  const { publicReceipt } = await runAuthProbeOnly({ csvText: csvFor(rows50()), ownerAuthorizationRef: REF, expectedInventoryText: INVENTORY, smtpTransportFactory: s.factory, imapProbe: i.probe });
  assertPublicSafe(publicReceipt);
  const text = JSON.stringify(publicReceipt);
  assert.equal(text.includes('@'), false);
  for (const d of [...STARTUP, ...PILOT]) assert.equal(text.includes(d), false, 'no domain name');
  assert.equal(text.includes(SECRET_MARK), false, 'no password');
  for (const role of WINNR_STARTUP_ROLES) assert.equal(text.includes(`"${role}"`), false, 'no role name in public output');
});

test('the private detail holds roles and domain positions, never addresses, domain names or passwords', async () => {
  const s = okSmtp(); const i = okImap();
  const { privateDetail } = await runAuthProbeOnly({ csvText: csvFor(rows50()), ownerAuthorizationRef: REF, expectedInventoryText: INVENTORY, smtpTransportFactory: s.factory, imapProbe: i.probe });
  const text = JSON.stringify(privateDetail);
  assert.equal(text.includes('@'), false);
  assert.equal(text.includes(SECRET_MARK), false);
  for (const d of STARTUP) assert.equal(text.includes(d), false);
  assert.ok(privateDetail.rows.every(r => Number.isInteger(r.domainIndex) && r.domainIndex >= 0 && r.domainIndex < 10));
});

// ---- classified failures and crash handling ------------------------------------------------

test('a partial acceptance is NOT_ALL_AUTHENTICATED, with each failure classified', async () => {
  const smtp = opts => {
    const bad = opts.username.startsWith('team@');
    return { ok: true, probe: async () => (bad ? { confirmed: false, errorClass: 'AUTH_REJECTED', messagesSent: 0 } : { confirmed: true, messagesSent: 0 }) };
  };
  const i = okImap();
  const { publicReceipt } = await runAuthProbeOnly({ csvText: csvFor(rows50()), ownerAuthorizationRef: REF, expectedInventoryText: INVENTORY, smtpTransportFactory: smtp, imapProbe: i.probe });
  assert.equal(publicReceipt.status, 'NOT_ALL_AUTHENTICATED');
  assert.equal(publicReceipt.smtp.accepted, 40);
  assert.equal(publicReceipt.smtp.classCounts.AUTH_REJECTED, 10);
});

test('an exception thrown by the transport is counted as PROBE_EXCEPTION and its text never reaches output', async () => {
  const smtp = opts => {
    if (opts.username.startsWith('hello@')) throw Object.assign(new Error(`crash containing ${SECRET_MARK}`), { code: 'EPROTO_LEAK' });
    return { ok: true, probe: async () => ({ confirmed: true, messagesSent: 0 }) };
  };
  const i = okImap();
  const { publicReceipt, privateDetail } = await runAuthProbeOnly({ csvText: csvFor(rows50()), ownerAuthorizationRef: REF, expectedInventoryText: INVENTORY, smtpTransportFactory: smtp, imapProbe: i.probe });
  assert.equal(publicReceipt.status, 'NOT_ALL_AUTHENTICATED');
  assert.equal(publicReceipt.probeExceptions, 10);
  assert.equal(publicReceipt.smtp.classCounts.PROBE_EXCEPTION, 10);
  const everything = JSON.stringify(publicReceipt) + JSON.stringify(privateDetail);
  assert.equal(everything.includes(SECRET_MARK), false);
  assert.equal(everything.includes('crash containing'), false);
  assert.equal(everything.includes('EPROTO_LEAK'), false, 'the raw code is not used; only the fixed class is');
});

test('an IMAP probe that throws is counted as PROBE_EXCEPTION, not as a success', async () => {
  const s = okSmtp();
  const imap = async () => { throw new Error('imap crash with fixture text'); };
  const { publicReceipt } = await runAuthProbeOnly({ csvText: csvFor(rows50()), ownerAuthorizationRef: REF, expectedInventoryText: INVENTORY, smtpTransportFactory: s.factory, imapProbe: imap });
  assert.equal(publicReceipt.imap.accepted, 0);
  assert.equal(publicReceipt.imap.classCounts.PROBE_EXCEPTION, 50);
  assert.notEqual(publicReceipt.status, 'AUTHENTICATED_ALL');
  assert.equal(JSON.stringify(publicReceipt).includes('imap crash'), false);
});

test('a transport that cannot be constructed is REFUSED_BY_TRANSPORT and never accepted', async () => {
  const i = okImap();
  const { publicReceipt } = await runAuthProbeOnly({ csvText: csvFor(rows50()), ownerAuthorizationRef: REF, expectedInventoryText: INVENTORY, smtpTransportFactory: () => ({ ok: false, reasonCodes: ['x'] }), imapProbe: i.probe });
  assert.equal(publicReceipt.smtp.accepted, 0);
  assert.equal(publicReceipt.smtp.classCounts.REFUSED_BY_TRANSPORT, 50);
});

test('an unreadable export is refused, not thrown', async () => {
  const { publicReceipt } = await runAuthProbeOnly({ csvText: null, ownerAuthorizationRef: REF, expectedInventoryText: INVENTORY });
  assert.equal(publicReceipt.ok, false);
  assert.equal(publicReceipt.status === 'REFUSED_BEFORE_ANY_CONNECTION' || publicReceipt.status === 'REFUSED', true);
});

// ---- CLI as a separate process: no secret on stdout or stderr, correct exit codes -----------

const SCRIPT = fileURLToPath(new URL('../scripts/winnr-auth-probe-only.mjs', import.meta.url));

test('the CLI refuses without an inventory, prints only a status line, and exits 3 with no connection', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'winnr-cli-test-'));
  try {
    const csv = path.join(dir, 'creds.csv');
    fs.writeFileSync(csv, csvFor(rows50()), { mode: 0o600 });
    const receipt = path.join(dir, 'receipt.json');
    const env = { ...process.env };
    delete env.WINNR_EXPECTED_INVENTORY_JSON;
    const r = spawnSync(process.execPath, [SCRIPT, `--csv=${csv}`, `--owner-ref=${REF}`, `--receipt-out=${receipt}`, '--shred'], { env, encoding: 'utf8', timeout: 20000 });
    assert.equal(r.status, 3);
    assert.equal(r.stderr, '');
    assert.equal(r.stdout.includes(SECRET_MARK), false);
    assert.equal(r.stdout.includes('@'), false);
    assert.match(r.stdout, /"status":"REFUSED_BEFORE_ANY_CONNECTION"/);
    assert.equal(fs.existsSync(csv), false, 'the credential file is removed even on refusal');
    assert.equal(fs.readFileSync(receipt, 'utf8').includes(SECRET_MARK), false);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('the CLI refuses a credential file inside the repository without reading it', () => {
  const inside = path.join(path.dirname(SCRIPT), '..', 'tests', `.cli-inside-${process.pid}.csv`);
  fs.writeFileSync(inside, csvFor(rows50()), { mode: 0o600 });
  try {
    const r = spawnSync(process.execPath, [SCRIPT, `--csv=${inside}`, `--owner-ref=${REF}`], { env: { ...process.env, WINNR_EXPECTED_INVENTORY_JSON: INVENTORY }, encoding: 'utf8', timeout: 20000 });
    assert.equal(r.status, 1);
    assert.match(r.stderr, /CSV_INSIDE_REPOSITORY/);
    assert.equal(r.stdout.includes(SECRET_MARK), false);
  } finally {
    fs.rmSync(inside, { force: true });
  }
});

test('shredding overwrites then removes a file (best effort, not a secure-erasure guarantee)', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'winnr-shred-test-'));
  const file = path.join(dir, 'creds.csv');
  fs.writeFileSync(file, 'pw-fixture-secret-line\n'.repeat(20));
  shredFile(file);
  assert.equal(fs.existsSync(file), false);
  fs.rmSync(dir, { recursive: true, force: true });
});
