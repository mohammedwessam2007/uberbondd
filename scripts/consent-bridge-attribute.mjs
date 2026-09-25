#!/usr/bin/env node
// Which requests on the website came from a printed code, and were they valid
// when they arrived? Reads the app's /api/export.json (or a JSON array of leads)
// and one or more invitations.json files written by consent-bridge-letters.
// Read-only; prints counts per channel and one row per attributed request.
//
//   node scripts/consent-bridge-attribute.mjs --leads ~/Downloads/uberbond-export.json \
//     --invitations ~/.uberbond/bridge/2026-09-26/invitations.json[,more.json]

import fs from 'node:fs';
import os from 'node:os';
import { attributeBridgeLeads } from '../src/consent-bridge.mjs';

const args = process.argv.slice(2);
const opt = name => { const i = args.indexOf(`--${name}`); return i >= 0 ? args[i + 1] || '' : ''; };
const expand = p => p.replace(/^~(?=$|\/)/, os.homedir());
const read = file => JSON.parse(fs.readFileSync(expand(file), 'utf8'));

if (!opt('leads') || !opt('invitations')) {
  console.error('--leads <export.json> and --invitations <invitations.json[,...]> are required');
  process.exit(2);
}
const exported = read(opt('leads'));
const leads = Array.isArray(exported) ? exported : exported.leads || [];
const invitations = opt('invitations').split(',').filter(Boolean).flatMap(file => read(file));
const result = attributeBridgeLeads({ leads, invitations });
console.log(JSON.stringify({ ...result, rows: result.rows.map(({ leadId, invitationId, channel, campaignId, validity, hasConsentReceipt }) => ({ leadId, invitationId, channel, campaignId, validity, hasConsentReceipt })) }, null, 2));
