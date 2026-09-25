#!/usr/bin/env node
// Plan a first-touch cohort: eligibility -> lawful channel -> invitation codes.
//   CONSENT_BRIDGE_SECRET=<32+ chars> node scripts/consent-bridge-plan.mjs \
//     --context ctx.json --prospects prospects.ndjson [--ledger ~/.uberbond/invitations.ndjson]
// ctx.json: senderJurisdiction, postalIdentity (UberPostal result), postalIdentityReady,
//   counselAttestationRef, senderCompliance, transportColdB2BRule, offerRelevance,
//   channels.postal{authorized,costCentsPerLetter}, budgetRemainingCents, campaignId.
// Each prospect line: ref, company, website, jurisdiction, recipientType, postalAddressRef,
//   optional email + source (for the cold-email check) and partner/relationship refs.
// Invitation records go to the ledger (keep it outside the repository); stdout never
// contains an email address. Nothing is sent, printed or bought.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { compileRecipientEligibility } from '../src/uberoutbound-recipient-eligibility.mjs';
import { routeCohort } from '../src/lawful-channel-router.mjs';
import { issueInvitation } from '../src/consent-bridge.mjs';

const arg = name => { const i = process.argv.indexOf(name); return i > 0 ? process.argv[i + 1] : null; };
const ctxPath = arg('--context');
const prospectsPath = arg('--prospects');
const ledgerPath = arg('--ledger') || path.join(os.homedir(), '.uberbond', 'invitations.ndjson');
if (!ctxPath || !prospectsPath) { process.stderr.write('--context and --prospects are required\n'); process.exit(2); }
const secret = process.env.CONSENT_BRIDGE_SECRET || '';
const ctx = JSON.parse(fs.readFileSync(ctxPath, 'utf8'));
const prospects = fs.readFileSync(prospectsPath, 'utf8').split('\n').map(l => l.trim()).filter(Boolean).map(l => JSON.parse(l));
const now = new Date();

const entries = prospects.map(p => ({
  prospect: p,
  eligibility: p.email ? compileRecipientEligibility({
    recipient: { email: p.email, type: p.recipientType, jurisdiction: p.jurisdiction },
    source: p.source || {},
    offerRelevance: ctx.offerRelevance || {},
    senderJurisdiction: ctx.senderJurisdiction,
    senderCompliance: ctx.senderCompliance || {},
    postalIdentity: ctx.postalIdentity || null,
    transportColdB2BRule: ctx.transportColdB2BRule || 'UNKNOWN',
    suppression: { suppressed: p.suppressed === true },
    now
  }) : null
}));
const cohort = routeCohort({ prospects: entries, context: ctx });
const plan = [];
const ledger = [];
for (const [i, decision] of cohort.decisions.entries()) {
  const channel = decision.selected?.channel || null;
  const row = { ref: decision.prospectRef, channel, state: decision.state, unlockableBy: decision.unlockableBy };
  if (channel && !['COLD_EMAIL', 'INBOUND_CONTENT'].includes(channel)) {
    const inv = issueInvitation({ prospect: prospects[i], campaignId: ctx.campaignId || 'consent-bridge', channel, secret, now });
    if (inv.ok) { row.printableCode = inv.printableCode; row.landingPath = inv.landingPath; ledger.push({ ref: decision.prospectRef, record: inv.record }); }
    else row.invitationRefused = inv.reasonCodes;
  }
  plan.push(row);
}
if (ledger.length) {
  fs.mkdirSync(path.dirname(ledgerPath), { recursive: true, mode: 0o700 });
  fs.appendFileSync(ledgerPath, ledger.map(x => JSON.stringify(x)).join('\n') + '\n', { mode: 0o600 });
}
const { decisions, ...summary } = cohort;
process.stdout.write(`${JSON.stringify({ summary, invitationsIssued: ledger.length, ledger: ledger.length ? ledgerPath : null, plan }, null, 2)}\n`);
