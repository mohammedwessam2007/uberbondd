// Agency Revenue Leak pipeline: scanner rules (stubbed web) and the Python sender (fake local SMTP).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';
import { execFileSync, spawn } from 'node:child_process';
import { companyInboxes, draftEmail, externalSites, extractLinks, isHomeServiceSite, pitchableFindings, portfolioPages, projectPages, scanAgency, writeOutputs, PITCHABLE_CODES } from '../scripts/agency-leak-scan.mjs';

const finding = (code, title = `${code} title`) => ({ code, title, why: 'why', thirtySecondDisproof: 'check', evidence: [{ url: 'https://client.test/', excerpt: 'x' }], firstTouchUse: 'MAY_STATE_AS_OBSERVED_FACT' });
const AGENCY = `<html><head><title>Acme Web | HVAC sites</title></head><body><a href="/portfolio">Our Work</a><a href="/contact-us">Contact</a><a href="https://facebook.com/acme">fb</a></body></html>`;
const CONTACT = `<html><body><p>Email us at <a href="mailto:hello@acmeweb.test">hello@acmeweb.test</a> or jane@gmail.com</p></body></html>`;
const PORTFOLIO = `<html><body><a href="/portfolio/cool-air">Cool Air</a><a href="https://www.coolairhvac.test/">site</a><a href="https://bakery.test/">bakery</a><a href="https://www.google.com/maps">map</a></body></html>`;
const PROJECT = `<html><body><a href="https://plumbpros.test/">Plumb Pros</a></body></html>`;
const CLIENT_HVAC = `<html><head><title>Cool Air Heating &amp; Cooling</title></head><body>HVAC repair</body></html>`;
const CLIENT_PLUMB = `<html><head><title>Plumb Pros</title></head><body>Plumbing and drain service</body></html>`;
const BAKERY = `<html><head><title>Best Bakery</title></head><body>Bread</body></html>`;
const pages = { 'https://acmeweb.test/': AGENCY, 'https://acmeweb.test/contact-us': CONTACT, 'https://acmeweb.test/portfolio': PORTFOLIO, 'https://acmeweb.test/portfolio/cool-air': PROJECT, 'https://www.coolairhvac.test/': CLIENT_HVAC, 'https://plumbpros.test/': CLIENT_PLUMB, 'https://bakery.test/': BAKERY };
const fetcher = { get: async url => ({ status: pages[url] ? 200 : 404, url, text: pages[url] ?? '' }) };

test('link, portfolio, client and inbox extraction', () => {
  const links = extractLinks(AGENCY, 'https://acmeweb.test/');
  assert.deepEqual(portfolioPages(links, 'acmeweb.test'), ['https://acmeweb.test/portfolio']);
  const plinks = extractLinks(PORTFOLIO, 'https://acmeweb.test/portfolio');
  assert.deepEqual(externalSites(plinks, 'acmeweb.test'), ['https://www.coolairhvac.test/', 'https://bakery.test/'], 'social and map links are not clients');
  assert.deepEqual(projectPages(plinks, 'https://acmeweb.test/portfolio', 'acmeweb.test'), ['https://acmeweb.test/portfolio/cool-air']);
  assert.equal(isHomeServiceSite(CLIENT_HVAC), true); assert.equal(isHomeServiceSite(BAKERY), false);
  assert.deepEqual(companyInboxes(CONTACT, 'https://acmeweb.test/contact-us', 'acmeweb.test', '2026-11-15T00:00:00Z').map(x => x.email), ['hello@acmeweb.test'], 'free-mail and personal addresses are never kept');
  assert.deepEqual(companyInboxes('<p>Contact Jane Smith at info@acmeweb.test</p>', 'https://acmeweb.test/c', 'acmeweb.test', '2026-11-15T00:00:00Z'), [], 'a role inbox named for a person is personal');
  assert.deepEqual(companyInboxes('<p>info@other.test</p>', 'https://acmeweb.test/c', 'acmeweb.test', '2026-11-15T00:00:00Z'), [], 'another domain is not the agency inbox');
});
test('only hard, path-breaking defects are pitchable; call-tracking-sensitive ones never are', () => {
  const receipt = { analysis: { findings: [finding('TEL_LABEL_DIALS_DIFFERENT_NUMBER'), finding('MACHINE_READABLE_PHONE_DIVERGES'), { ...finding('FORM_SUBMITS_TO_NONEXISTENT_HOST'), firstTouchUse: 'ASK_DONT_ASSERT' }, finding('STRUCTURED_DATA_UNPARSEABLE')] } };
  assert.deepEqual(pitchableFindings(receipt).map(f => f.code), ['STRUCTURED_DATA_UNPARSEABLE']);
  assert.deepEqual([...PITCHABLE_CODES].sort(), ['FORM_SUBMITS_TO_NONEXISTENT_HOST', 'STRUCTURED_DATA_UNPARSEABLE', 'TEL_LINK_MALFORMED']);
});
test('draft follows the first-touch rules: short, one idea, permission ask, no price', () => {
  const d = draftEmail({ agencyName: 'Acme Web', clientHost: 'coolairhvac.test', finding: finding('FORM_SUBMITS_TO_NONEXISTENT_HOST'), senderName: 'Mohamed' });
  assert.ok(d.words >= 40 && d.words <= 100, `${d.words} words`);
  assert.match(d.body, /Want me to send it\?/); assert.doesNotMatch(d.body, /\$|price|call|meeting/i);
  assert.ok(d.subject.split(' ').length <= 5);
});
test('scan: verified defect on a home-service client -> SEND_CANDIDATE with draft and evidence', async () => {
  const seen = [];
  const probe = async site => { seen.push(site); return site === 'https://plumbpros.test/' ? { analysis: { findings: [finding('FORM_SUBMITS_TO_NONEXISTENT_HOST', 'Form submits to dead.test, a hostname that does not resolve')] } } : { analysis: { findings: [] } }; };
  const r = await scanAgency('https://acmeweb.test/', { fetcher, probe, now: () => '2026-11-15T00:00:00Z' });
  assert.equal(r.status, 'SEND_CANDIDATE'); assert.equal(r.email, 'hello@acmeweb.test');
  assert.deepEqual(r.clients.sort(), ['https://plumbpros.test/', 'https://www.coolairhvac.test/']);
  assert.equal(r.verified[0].clientHost, 'plumbpros.test');
  assert.equal(seen.filter(s => s === 'https://plumbpros.test/').length, 2, 'the defect was observed twice');
  const out = fs.mkdtempSync(path.join(os.tmpdir(), 'scan-'));
  writeOutputs([r], out, 'Mohamed');
  const csv = fs.readFileSync(path.join(out, 'review.csv'), 'utf8');
  assert.match(csv, /"SEND_CANDIDATE"/); assert.match(csv, /,""$/m, 'approve column starts empty');
  assert.match(fs.readFileSync(path.join(out, 'artifacts/001.md'), 'utf8'), /dead\.test/);
});
test('scan refuses: defect that does not reproduce, no company inbox, no home-service clients', async () => {
  let n = 0; const flaky = async () => (n++ % 2 === 0 ? { analysis: { findings: [finding('TEL_LINK_MALFORMED')] } } : { analysis: { findings: [] } });
  assert.equal((await scanAgency('https://acmeweb.test/', { fetcher, probe: flaky })).reason, 'NO_VERIFIED_DEFECT');
  const noInbox = { get: async url => ({ status: 200, url, text: url.includes('contact') ? '<p>Use our form</p>' : AGENCY }) };
  assert.equal((await scanAgency('https://acmeweb.test/', { fetcher: noInbox, probe: flaky })).reason, 'NO_PUBLISHED_COMPANY_INBOX');
  const onlyBakery = { get: async url => ({ status: 200, url, text: url === 'https://acmeweb.test/portfolio' ? '<a href="https://bakery.test/">b</a>' : (pages[url] ?? '') }) };
  assert.equal((await scanAgency('https://acmeweb.test/', { fetcher: onlyBakery, probe: flaky })).reason, 'NO_HOME_SERVICE_CLIENT_SITES_FOUND');
});

// ---- sender ---------------------------------------------------------------
function fakeSmtp() {
  const messages = []; let current = null;
  const server = net.createServer(s => {
    s.setEncoding('latin1'); s.write('220 fake\r\n'); let buf = ''; let data = false;
    s.on('data', chunk => { buf += chunk; let i;
      while ((i = buf.indexOf('\r\n')) >= 0) { const line = buf.slice(0, i); buf = buf.slice(i + 2);
        if (data) { if (line === '.') { data = false; messages.push(current); s.write('250 queued\r\n'); } else current.data += `${line}\n`; continue; }
        if (/^(EHLO|HELO)/i.test(line)) s.write('250 fake\r\n');
        else if (/^MAIL FROM/i.test(line)) { current = { from: line, rcpt: [], data: '' }; s.write('250 ok\r\n'); }
        else if (/^RCPT TO/i.test(line)) { current.rcpt.push(line); s.write('250 ok\r\n'); }
        else if (/^DATA/i.test(line)) { data = true; s.write('354 go\r\n'); }
        else if (/^QUIT/i.test(line)) s.end('221 bye\r\n');
        else s.write('250 ok\r\n'); } });
    s.on('error', () => {});
  });
  return new Promise(res => server.listen(0, '127.0.0.1', () => res({ port: server.address().port, messages, close: () => new Promise(r => server.close(r)) })));
}
function workspace(port, rows, extra = {}) {
  const out = fs.mkdtempSync(path.join(os.tmpdir(), 'send-'));
  fs.mkdirSync(path.join(out, 'drafts'));
  const header = 'id,agency,agency_site,to,client_site,defect,status,reason,subject,draft_file,artifact_file,approve';
  fs.writeFileSync(path.join(out, 'review.csv'), `${[header, ...rows.map(r => [r.id, 'A', 'https://a.test', r.to, 'https://c.test', 'X', r.status ?? 'SEND_CANDIDATE', '', 'c.test contact issue', `drafts/${r.id}.txt`, '', r.approve ?? 'SEND'].map(v => `"${v}"`).join(','))].join('\n')}\n`);
  for (const r of rows) fs.writeFileSync(path.join(out, 'drafts', `${r.id}.txt`), `Hi team,\n\nBody ${r.id}.\n\nMohamed\n`);
  const cfg = path.join(out, 'sender.json');
  fs.writeFileSync(cfg, JSON.stringify({ sender_name: 'Mohamed', postal_address: '1 Example St, Cairo, Egypt', mailboxes: [{ address: 'm1@sender.test', smtp_host: '127.0.0.1', smtp_port: port }, { address: 'm2@sender.test', smtp_host: '127.0.0.1', smtp_port: port }], min_delay_s: 0, max_delay_s: 0, ...extra }));
  return { out, cfg };
}
// Async on purpose: the fake SMTP server lives in this process, so a synchronous spawn would deadlock.
const runSender = (ws, ...flags) => new Promise(resolve => {
  const p = spawn('python3', ['scripts/agency-leak-send.py', '--out', ws.out, '--config', ws.cfg, '--insecure-local-test', '--no-delay', ...flags]);
  let stdout = ''; let stderr = ''; p.stdout.on('data', d => { stdout += d; }); p.stderr.on('data', d => { stderr += d; });
  const t = setTimeout(() => p.kill(), 30000);
  p.on('close', status => { clearTimeout(t); resolve({ status, stdout, stderr }); });
});

test('sender: dry run sends nothing; only approved rows go; footer carries address, notice and opt-out', async t => {
  const smtp = await fakeSmtp(); t.after(() => smtp.close());
  const ws = workspace(smtp.port, [{ id: '001', to: 'info@a1.test' }, { id: '002', to: 'info@a2.test', approve: '' }, { id: '003', to: 'info@a3.test', approve: 'send' }, { id: '004', to: 'info@a4.test', status: 'DO_NOT_SEND' }]);
  const dry = await runSender(ws); assert.equal(dry.status, 0, dry.stderr); assert.equal(smtp.messages.length, 0); assert.match(dry.stdout, /DRY RUN: 1 approved/);
  const real = await runSender(ws, '--send'); assert.equal(real.status, 0, real.stderr);
  assert.equal(smtp.messages.length, 1, 'only the row with exactly SEND was sent');
  assert.match(smtp.messages[0].rcpt[0], /info@a1\.test/);
  assert.match(smtp.messages[0].data, /Commercial message from Mohamed, 1 Example St, Cairo, Egypt\./);
  assert.match(smtp.messages[0].data, /Reply "stop" and I won't email you again\./);
});
test('sender: never emails an address twice, honours suppression, and respects caps across mailboxes', async t => {
  const smtp = await fakeSmtp(); t.after(() => smtp.close());
  const rows = Array.from({ length: 8 }, (_, i) => ({ id: String(i + 1).padStart(3, '0'), to: `info@b${i}.test` })).concat([{ id: '009', to: 'INFO@B0.TEST' }]);
  const ws = workspace(smtp.port, rows, { per_mailbox_per_day: 2, per_run: 30 });
  fs.writeFileSync(path.join(ws.out, 'suppression.txt'), 'info@b1.test\n');
  await runSender(ws, '--send');
  assert.equal(smtp.messages.length, 4, 'two mailboxes x two per day');
  const second = await runSender(ws, '--send'); assert.match(second.stdout, /every mailbox is at its daily cap/);
  assert.equal(smtp.messages.length, 4);
  const log = fs.readFileSync(path.join(ws.out, 'sent-log.jsonl'), 'utf8').trim().split('\n').map(JSON.parse);
  assert.ok(!log.some(e => e.to === 'info@b1.test'), 'suppressed address never sent');
  assert.equal(new Set(log.map(e => e.to.toLowerCase())).size, log.length, 'no duplicates, case-insensitive');
  assert.deepEqual([...new Set(log.map(e => e.from))].sort(), ['m1@sender.test', 'm2@sender.test']);
});
test('sender: hard caps cannot be raised by config', () => {
  const ws = workspace(1, [{ id: '001', to: 'x@y.test' }], { per_mailbox_per_day: 500, per_run: 500 });
  const py = `import importlib.util,sys;s=importlib.util.spec_from_file_location('s','scripts/agency-leak-send.py');m=importlib.util.module_from_spec(s);s.loader.exec_module(m);c=m.load_config(sys.argv[1]);print(c['per_mailbox_per_day'],c['per_run'])`;
  assert.equal(execFileSync('python3', ['-c', py, ws.cfg], { encoding: 'utf8' }).trim(), '15 30');
});
