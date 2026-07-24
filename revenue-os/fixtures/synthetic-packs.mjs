// Synthetic research packs for tests and the demo pipeline. Every domain uses the reserved
// .invalid TLD so nothing here can ever resolve to a real organization -- these are never to be
// represented as market proof (mission's own instruction, workstream 18).
const NOW = () => new Date().toISOString();

export function agencyPackCsv() {
  return 'organizationDomain,channel,sourceUrl,capturedAt,confidence,verified\n' +
    `northgate-agency.invalid,published_contact_form,https://northgate-agency.invalid/contact,${NOW()},0.9,true\n` +
    `riverside-agency.invalid,referral_intro,https://riverside-agency.invalid/,${NOW()},0.85,true\n`;
}

export function buyerIntentPackJson() {
  return JSON.stringify({
    records: [
      { organizationDomain: 'demandco.invalid', channel: 'linkedin_public_profile', sourceUrl: 'https://demandco.invalid/careers', capturedAt: NOW(), confidence: 0.8, verified: 'true' }
    ]
  });
}

export function marketplacePackJsonl() {
  const good = { organizationDomain: 'openmarket.invalid', channel: 'public_directory_listing', sourceUrl: 'https://openmarket.invalid/', capturedAt: NOW(), confidence: 0.6, verified: 'false', inferredBasis: 'directory listing pattern match' };
  return `${JSON.stringify(good)}\n`;
}

export function partnerPackMarkdown() {
  return `| organizationDomain | channel | sourceUrl | capturedAt | confidence | verified |\n` +
    `|---|---|---|---|---|---|\n` +
    `| partnerco.invalid | referral_intro | https://partnerco.invalid/ | ${NOW()} | 0.95 | true |\n`;
}

// --- invalid / duplicate / malicious packs (for hostile tests) ---

export function invalidPackCsv() {
  return 'organizationDomain,channel,sourceUrl,capturedAt,confidence,verified\n' +
    `,published_email,https://x.invalid,${NOW()},0.5,true\n` + // missing domain
    `bad domain,published_email,https://x.invalid,${NOW()},0.5,true\n` + // invalid domain shape
    `stale.invalid,published_email,https://stale.invalid,2000-01-01T00:00:00.000Z,0.5,true\n`; // stale
}

export function duplicatePackCsv() {
  const row = `dupe.invalid,published_email,https://dupe.invalid,${NOW()},0.7,true\n`;
  return `organizationDomain,channel,sourceUrl,capturedAt,confidence,verified\n${row}${row}`;
}

export function maliciousPackCsv() {
  return 'organizationDomain,channel,sourceUrl,capturedAt,confidence,verified\n' +
    `=cmd|'/c calc'!A1,published_email,https://evil.invalid,${NOW()},0.7,true\n`;
}

export function maliciousArchiveEntries() {
  return [
    { name: '../../etc/passwd', uncompressedSize: 100, compressedSize: 50 },
    { name: 'normal.csv', uncompressedSize: 500_000_000, compressedSize: 100 }
  ];
}

// --- fake replies ---

export function fakeReplies() {
  return [
    { organizationDomain: 'northgate-agency.invalid', body: 'How much does this cost?' },
    { organizationDomain: 'riverside-agency.invalid', body: 'Sounds good, tell me more.' }
  ];
}

// --- fake payment evidence ---

export function fakePaymentEvidence({ amountCents, reference = 'demo-txn-0001' }) {
  return { reference, amountCents, currency: 'USD', payer: 'Northgate Agency LLC', timestamp: NOW() };
}
