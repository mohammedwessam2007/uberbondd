// Apify shell. Decisions live in src/ (tested in tests/definitive-email-verifier.test.mjs).
import { Actor, log } from 'apify';
import { dohResolver, nativeResolver, trustedResolvers, witnessedMailLookup } from './src/dns.mjs';
import { extractEmails, runVerificationSale } from './src/sale.mjs';
import { smtpReachable } from './src/smtp.mjs';

const EVENT = 'verified-email';
const HOSTNAME = /^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/i;
const MAILBOX = /^[A-Za-z0-9._%+-]{1,64}@(?:[a-z0-9-]+\.)+[a-z]{2,63}$/i;

await Actor.init();
const input = (await Actor.getInput()) ?? {};
const maxEmails = Math.min(200_000, Math.max(1, Number(input.maxEmails ?? 50_000)));

const emails = (input.emails ?? []).map(String);
if (input.datasetId) {
  const dataset = await Actor.openDataset(String(input.datasetId), { forceCloud: Actor.isAtHome() });
  await dataset.forEach(item => { if (emails.length < maxEmails) emails.push(...extractEmails(item, input.emailField ?? 'email')); });
}
const rows = emails.slice(0, maxEmails).map(email => ({ email }));
if (!rows.length) await Actor.fail('No email addresses found. Provide "emails" or a "datasetId" with an "emailField".');

// DNS: only resolvers that answer a known domain correctly are used, and a negative needs two of them.
const resolvers = await trustedResolvers([nativeResolver(), dohResolver(), dohResolver({ endpoint: 'https://cloudflare-dns.com/dns-query', name: 'doh:cloudflare' })]);
if (!resolvers.length) await Actor.fail('No DNS resolver passed the self-check, so no verdict would be trustworthy. Nothing was charged.');
const lookupMail = witnessedMailLookup(resolvers);

// SMTP: a truthful address-literal greeting unless the publisher configured a domain; null reverse-path by default.
let heloName = HOSTNAME.test(input.heloName ?? '') ? input.heloName : HOSTNAME.test(process.env.VERIFIER_HELO_DOMAIN ?? '') ? process.env.VERIFIER_HELO_DOMAIN : null;
if (!heloName) {
  try { const ip = (await (await fetch('https://api.ipify.org', { signal: AbortSignal.timeout(5000) })).text()).trim(); if (/^\d{1,3}(\.\d{1,3}){3}$/.test(ip)) heloName = `[${ip}]`; } catch { /* fall through */ }
}
heloName ??= 'localhost';
const mailFrom = MAILBOX.test(input.mailFrom ?? '') ? input.mailFrom : '';
let smtpAvailable = false;
if (input.dnsOnly !== true) {
  const canaries = (await Promise.all(['gmail.com', 'outlook.com'].map(lookupMail))).flatMap(m => m.hosts.slice(0, 1).map(h => h.exchange));
  smtpAvailable = canaries.length > 0 && await smtpReachable(canaries);
  if (!smtpAvailable) log.warning('Port 25 is not reachable from this run. Mailbox checks are skipped and reported as unknown (free).');
}

const { summary } = await runVerificationSale({
  rows,
  verifyOptions: { lookupMail, smtpAvailable, heloName, mailFrom, domainConcurrency: Math.min(25, Math.max(1, Number(input.concurrency ?? 10))) },
  pushCharged: rec => Actor.pushData(rec, EVENT),
  pushFree: rec => Actor.pushData(rec)
});
const report = { ...summary, smtpAvailable, dnsWitnesses: resolvers.map(r => r.name) };
await Actor.setValue('REPORT', report);
await Actor.exit(`${report.rowsProcessed} of ${report.rowsIn} rows: ${report.deliverable} deliverable, ${report.undeliverable} undeliverable, ${report.risky} risky, ${report.unknown} unknown, ${report.duplicates} duplicate. Charged for ${report.billedEvents} proven results.`);
