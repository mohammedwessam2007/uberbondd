#!/usr/bin/env node
// Decide lawful eligibility for a batch of candidate recipients.
//   node scripts/recipient-eligibility.mjs                       # print policy coverage
//   node scripts/recipient-eligibility.mjs --context ctx.json --recipients candidates.ndjson [--decisions]
// ctx.json carries shared facts: senderJurisdiction, senderCompliance, postalIdentity,
// transportColdB2BRule, offerRelevance. Each NDJSON line carries recipient/source/relationship.
// Output never contains raw addresses; no message is sent and no authority is created.
import fs from 'node:fs';
import { compileRecipientEligibilityPortfolio, recipientEligibilityCoverage } from '../src/uberoutbound-recipient-eligibility.mjs';

const arg = name => { const i = process.argv.indexOf(name); return i > 0 ? process.argv[i + 1] : null; };
const contextPath = arg('--context');
const recipientsPath = arg('--recipients');
if (!contextPath || !recipientsPath) {
  process.stdout.write(`${JSON.stringify(recipientEligibilityCoverage(), null, 2)}\n`);
} else {
  const context = JSON.parse(fs.readFileSync(contextPath, 'utf8'));
  const recipients = fs.readFileSync(recipientsPath, 'utf8').split('\n').map(l => l.trim()).filter(Boolean).map(l => JSON.parse(l));
  const portfolio = compileRecipientEligibilityPortfolio({ recipients, context });
  if (!process.argv.includes('--decisions')) delete portfolio.decisions;
  process.stdout.write(`${JSON.stringify(portfolio, null, 2)}\n`);
}
