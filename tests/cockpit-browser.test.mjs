import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import http from 'node:http';
import { chromium } from 'playwright';

let server;
let base;
let browser;
const requests = [];

const cockpit = {
  generatedAt: '2026-07-18T04:00:00.000Z',
  defaultView: 'attention',
  statuses: ['discovered', 'queued', 'crawling', 'audit-failed', 'rejected', 'qualified', 'contact-found', 'draft-ready', 'needs-review', 'approved', 'scheduled', 'sent', 'replied', 'interested', 'objection', 'not-interested', 'unsubscribed', 'bounced', 'complaint', 'proposal-ready', 'checkout-sent', 'paid', 'delivery-queued', 'delivered'],
  counts: { 'audit-failed': 1, 'needs-review': 1, interested: 1, paid: 1, 'delivery-queued': 1 },
  rows: [
    { id: 'urgent-1', company: 'Urgent Clinic', status: 'audit-failed', score: 0, country: 'AE', issueTitle: '', urgentReasons: ['audit-failed'] },
    { id: 'draft-1', company: 'Draft Clinic', status: 'needs-review', score: 88, draftQuality: 94, country: 'AE', issueTitle: 'Booking action is difficult to find' },
    { id: 'reply-1', replyId: 'gmail-reply-1', replyLabel: 'meeting-requested', company: 'Reply Clinic', status: 'interested', score: 84, country: 'AE', issueTitle: 'Contact path is unclear' },
    { id: 'paid-1', company: 'Paid Clinic', status: 'paid', score: 90, country: 'AE' },
    { id: 'delivery-1', company: 'Delivery Clinic', status: 'delivery-queued', score: 90, country: 'AE' }
  ],
  attention: {
    urgent: [{ id: 'urgent-1', company: 'Urgent Clinic', status: 'audit-failed', score: 0, country: 'AE', urgentReasons: ['audit-failed'] }],
    drafts: [{ id: 'draft-1', company: 'Draft Clinic', status: 'needs-review', score: 88, draftQuality: 94, country: 'AE', issueTitle: 'Booking action is difficult to find' }],
    positiveReplies: [{ id: 'reply-1', replyId: 'gmail-reply-1', replyLabel: 'meeting-requested', company: 'Reply Clinic', status: 'interested', score: 84, country: 'AE', issueTitle: 'Contact path is unclear' }],
    payments: [{ id: 'payment-1', prospectId: 'paid-1', status: 'paid', amountCents: 4900, currency: 'USD', occurredAt: '2026-07-18T03:00:00.000Z' }],
    delivery: [{ id: 'delivery-1', company: 'Delivery Clinic', status: 'delivery-queued', score: 90, country: 'AE' }]
  },
  filters: {
    campaigns: [{ id: 'campaign-a', name: 'UAE clinics', enabled: true, paused: false, dryRun: true, autoSend: false }],
    countries: ['AE'], niches: ['dentist']
  },
  controls: {
    globalOutboundPaused: false, globalPauseReason: '',
    systemOutbound: { enabled: false, dryRun: true, liveSendApproved: false },
    campaigns: [{ id: 'campaign-a', name: 'UAE clinics', enabled: true, paused: false, dryRun: true, autoSend: false }],
    inboxes: [{ slot: 'A', paused: false, pauseReason: '', hardBouncesToday: 0, complaintsToday: 0, failureStreak: 0 }]
  }
};

test.before(async () => {
  const [html, css, js] = await Promise.all([
    fs.readFile(new URL('../public/admin.html', import.meta.url), 'utf8'),
    fs.readFile(new URL('../public/styles.css', import.meta.url), 'utf8'),
    fs.readFile(new URL('../public/admin.js', import.meta.url), 'utf8')
  ]);
  server = http.createServer(async (req, res) => {
    if (req.url === '/admin.html' || req.url === '/') { res.writeHead(200, { 'content-type': 'text/html' }); return res.end(html); }
    if (req.url === '/styles.css') { res.writeHead(200, { 'content-type': 'text/css' }); return res.end(css); }
    if (req.url === '/admin.js') { res.writeHead(200, { 'content-type': 'text/javascript' }); return res.end(js); }
    if (req.url === '/manifest.webmanifest') { res.writeHead(200, { 'content-type': 'application/manifest+json' }); return res.end('{}'); }
    if (req.url === '/icon.svg') { res.writeHead(200, { 'content-type': 'image/svg+xml' }); return res.end('<svg xmlns="http://www.w3.org/2000/svg"/>'); }
    const body = await new Promise(resolve => { let value = ''; req.on('data', chunk => { value += chunk; }); req.on('end', () => resolve(value)); });
    requests.push({ method: req.method, url: req.url, body });
    res.setHeader('content-type', 'application/json');
    if (req.url.startsWith('/api/cockpit')) return res.end(JSON.stringify(cockpit));
    if (req.url === '/api/replies/gmail-reply-1' && req.method === 'GET') return res.end(JSON.stringify({
      id: 'gmail-reply-1', prospectId: 'reply-1', from: 'owner@reply.example', subject: 'Re: Contact path', body: 'Could we schedule a call?',
      classification: { label: 'meeting-requested', confidence: 0.96, source: 'deterministic' }, match: { source: 'gmail-thread' },
      responseDraft: { status: 'needs-owner-approval', subject: 'Re: Contact path', body: 'Thanks. Which time zone should I use?', sendEligible: false }
    }));
    if (req.url === '/api/replies/gmail-reply-1/draft') return res.end(JSON.stringify({ id: 'gmail-reply-1', responseDraft: { status: 'needs-owner-approval', sendEligible: false } }));
    if (req.url === '/api/replies/gmail-reply-1/approve-response') return res.end(JSON.stringify({ alreadyApproved: false, sent: false }));
    if (req.url === '/api/prospects/draft-1/approve') return res.end(JSON.stringify({ ok: true, approval: { liveSendEligible: false } }));
    if (req.url === '/api/outbound/pause') return res.end(JSON.stringify({ outboundPaused: true }));
    if (req.url === '/api/summary') return res.end(JSON.stringify({ paused: false, running: false, workerOnline: false, autopilot: false, prospects: 0, queued: 0, completed: 0, qualified: 0, qualificationRate: 0, ready: 0, replied: 0, positive: 0, accounts: [], revenue: {}, outbound: { enabled: false, dryRun: true, globalPaused: false, senderHealth: [] } }));
    if (req.url === '/api/campaigns') return res.end(JSON.stringify([]));
    return res.end(JSON.stringify([]));
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  base = `http://127.0.0.1:${server.address().port}`;
  browser = await chromium.launch({ headless: true, ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}), args: ['--no-sandbox', '--disable-dev-shm-usage'] });
});

test.after(async () => {
  await browser?.close();
  await new Promise(resolve => server.close(resolve));
});

test('iPad cockpit opens on the attention view with safe, touch-sized owner controls', async () => {
  const context = await browser.newContext({ viewport: { width: 1024, height: 1366 }, isMobile: true, hasTouch: true });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(`${base}/admin.html`, { waitUntil: 'networkidle' });
  await page.waitForSelector('#attention-drafts .approve-one');

  assert.equal(await page.locator('#attention-main').isVisible(), true);
  assert.equal(await page.locator('#operations-main').isVisible(), false);
  assert.equal(await page.locator('.attention-grid > article').count(), 5);
  const body = await page.locator('body').innerText();
  for (const visible of ['Urgent Clinic', 'Draft Clinic', 'Reply Clinic', 'Paid Clinic', 'Delivery Clinic']) assert.match(body, new RegExp(visible));
  for (const forbidden of ['private@example.com', 'Stored evidence-bound outreach body', 'oauth-token', 'provider-reference']) assert.doesNotMatch(body, new RegExp(forbidden));

  await Promise.all([
    page.waitForResponse(response => response.url().endsWith('/api/replies/gmail-reply-1')),
    page.locator('#attention-positive [data-reply-open]').click()
  ]);
  assert.match(await page.locator('#dossier').innerText(), /Could we schedule a call\?/);
  assert.match(await page.locator('#dossier').innerText(), /Approval records your decision only/);
  await page.locator('#reply-body').fill('Thanks. Which time zone should I use for the meeting options?');
  await Promise.all([
    page.waitForResponse(response => response.url().endsWith('/api/replies/gmail-reply-1/draft')),
    page.locator('#save-reply-draft').click()
  ]);
  page.once('dialog', dialog => dialog.accept());
  await Promise.all([
    page.waitForResponse(response => response.url().endsWith('/api/replies/gmail-reply-1/approve-response')),
    page.locator('#approve-reply-draft').click()
  ]);
  assert(requests.some(request => request.method === 'POST' && request.url === '/api/replies/gmail-reply-1/draft'));
  assert(requests.some(request => request.method === 'POST' && request.url === '/api/replies/gmail-reply-1/approve-response'));
  await page.locator('#close-modal').click();

  const dimensions = await page.locator('#attention-drafts .approve-one').evaluate(element => ({ height: element.getBoundingClientRect().height, touchAction: getComputedStyle(element).touchAction }));
  assert(dimensions.height >= 44);
  assert.equal(dimensions.touchAction, 'manipulation');

  await Promise.all([
    page.waitForResponse(response => response.url().endsWith('/api/prospects/draft-1/approve')),
    page.locator('#attention-drafts .approve-one').click()
  ]);
  assert(requests.some(request => request.method === 'POST' && request.url === '/api/prospects/draft-1/approve'));

  await Promise.all([
    page.waitForResponse(response => response.url().endsWith('/api/outbound/pause')),
    page.locator('#cockpit-kill').click()
  ]);
  assert(requests.some(request => request.method === 'POST' && request.url === '/api/outbound/pause'));

  await page.locator('#view-operations').click();
  assert.equal(await page.locator('#operations-main').isVisible(), true);
  await page.locator('#view-attention').click();
  assert.equal(await page.locator('#attention-main').isVisible(), true);
  assert.deepEqual(errors, []);
  await context.close();
});
