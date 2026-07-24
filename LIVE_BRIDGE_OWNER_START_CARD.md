# Live Bridge Patch -- Owner Start Card (addendum)

Read `UBERBOND_FIRST_PAYMENT_REVENUE_OS_OWNER_START_CARD.md` first -- everything there still
applies. This addendum covers only the two new capabilities this patch adds.

## Importing an XLSX research pack

```js
import { importXlsxPack } from './revenue-os/src/xlsx-import.mjs';
import fs from 'node:fs/promises';

const buffer = await fs.readFile('qualified-agencies.xlsx');
const result = await importXlsxPack(buffer, {
  packType: 'qualified_agency',   // or buyer_intent / priority_list / approval_queue / channel_signal_evidence
  packVersion: 1,
  sourceFile: 'qualified-agencies.xlsx'
});

console.log(result.accepted.length, 'accepted');
console.log(result.quarantined.length, 'quarantined');
console.log(result.sheetReports);   // review column-mapping and any unmapped headers before trusting a large import
console.log(result.disclosures);    // hidden sheets/rows and formula cells encountered, even ones that were excluded/discarded
```

Before trusting a large real workbook: check `sheetReports[].unmappedHeaders` for columns that
didn't match any known alias (they were simply ignored, not imported), and check
`disclosures.hiddenSheets`/`hiddenRows` for content you may want to explicitly review with
`includeHiddenSheets`/`includeHiddenRows: true` before deciding whether it should count as evidence.
Full column-alias list and safety details: `LIVE_BRIDGE_XLSX_SCHEMA_MAP.md`.

## Running the real crawler against real sites (requires your explicit action every time)

The real crawler is disabled by construction until you supply all three of: `enabled: true`, a
non-empty `allowlist`, and an `ownerApproval` object. Nothing in this codebase enables it on its
own. To capture evidence from up to 3 real, owner-approved sites:

1. Write a project file (JSON):
   ```json
   {
     "sites": [
       {"id": "site1", "url": "https://real-agency-one.example"},
       {"id": "site2", "url": "https://real-agency-two.example"},
       {"id": "site3", "url": "https://real-agency-three.example"}
     ],
     "allowlist": ["real-agency-one.example", "real-agency-two.example", "real-agency-three.example"],
     "ownerApproval": {"approvedBy": "your name", "approvedAt": "2026-01-01T00:00:00.000Z", "note": "why you're approving this batch"}
   }
   ```
2. Set a signing secret: `export REVENUE_OS_EVIDENCE_SIGNING_SECRET="<a long random secret>"`
3. Run: `node revenue-os/scripts/crawl.mjs --project project.json --out evidence-pack.json`
4. Review `evidence-pack.json` -- every site's capture status, check results, and any defect cards,
   all signed so later tampering is detectable (`report.mjs#verifyReportManifest`).

Nothing about this session enabled the real crawler against a real external site -- every
demonstration and every test in this patch used a local, loopback-only controlled server. Full
safety details, including exactly what is and isn't allowed even when enabled:
`LIVE_BRIDGE_CRAWLER_SAFETY.md`.

## Updated honest limits

The original start card's "no XLSX import" limit is resolved (see above). "No live crawler" is now
more precisely "no *automatic* live crawler, and no crawling of any real site without your explicit
per-batch allowlist and approval, entered by you every time" -- still no automated/unsupervised real
crawling exists anywhere in this codebase. Every other limit in the original start card (no live
sending, no live payment API, no live AI, no live web server, JSON storage backend only, no real
statistical significance testing) is unchanged.
