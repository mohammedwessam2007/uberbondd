# Live Bridge Patch 1 -- XLSX Schema Map

Documents `revenue-os/src/xlsx-import.mjs` (commit 14): what it accepts, how it maps real-world
column spellings to the canonical fields, and every safety decision behind it.

## Parser decision: exceljs, not xlsx (SheetJS)

Both were inspected before either was installed. `exceljs@4.4.0` was chosen and pinned exact in
`package.json`/`package-lock.json`:

| | exceljs | xlsx (SheetJS) |
|---|---|---|
| Native bindings | none (pure JS) | none (pure JS) |
| npm-registry maintenance | actively published there | latest security fixes ship from SheetJS's own CDN, not always npm first |
| Formula engine | none -- has no code path that evaluates a formula | none, same property |
| VBA macro handling | never reads a `.xlsm`'s `vbaProject.bin` part | same |
| License | MIT | Apache-2.0 |

The "no formula evaluation" and "no macros" requirements are structural for both libraries (neither
ships a formula engine or a macro interpreter), but exceljs's npm-first maintenance pattern was the
deciding factor for "select a maintained parser and pin it in package-lock."

## Format gate (before any parse is attempted)

1. **Extension**: only `.xlsx` is accepted. `.xlsm` (macro-enabled), `.xlsb` (binary, also
   zip-based OOXML but a different serialization exceljs doesn't target), and `.xls` (legacy binary)
   are all rejected by filename extension alone, before the buffer is even inspected.
2. **Container signature**: the first bytes are checked against the ZIP local-file-header signature
   (`PK\x03\x04`). A CFB/OLE-compound-document signature (`D0 CF 11 E0 A1 B1 1A E1`) -- the container
   both encrypted OOXML workbooks and legacy `.xls` files actually use -- is rejected immediately as
   `encrypted-or-legacy-format`, before exceljs ever sees the buffer.
3. **exceljs parse**: any parse failure (truncated zip, corrupt central directory, malformed XML
   parts) surfaces as `corrupt-workbook` with the underlying exceljs error message.

## Formula-cell policy

The formula *text* of a cell (`cell.formula`) is never read anywhere in this module -- only
`cell.result`, exceljs's cached last-computed value, and only as inert data.

- A formula in a **mandatory** field (`organizationDomain`, `channel`, `sourceUrl`, `capturedAt`) is
  discarded entirely: the field is left unset on the raw record, so the existing
  `importer.mjs#normalizeRecord` quarantines the row for a missing mandatory field, exactly as it
  would for a genuinely blank cell. A safety-critical fact is never allowed to ride in on a value an
  attacker fully controls the *shape* of, even though this importer never executes it as a formula.
- A formula in a non-mandatory field (e.g. `notes`) uses the cached `result` as ordinary inert text.

Disclosed in `disclosures.formulaCells` on every import result: `{sheet, row, field, address,
mandatory}` for every formula cell encountered, mandatory or not.

## Hidden content

- **Hidden sheets** (`worksheet.state` is `'hidden'` or `'veryHidden'`) are excluded by default and
  listed in `disclosures.hiddenSheets`. Pass `includeHiddenSheets: true` to include them.
- **Hidden rows** (`row.hidden`) are excluded by default and listed in `disclosures.hiddenRows`, with
  a per-sheet `rowsSkippedHidden` count in the mapping report. Pass `includeHiddenRows: true` to
  include them.

Both are always disclosed regardless of whether they're included, so a caller reviewing the mapping
report always knows hidden content existed even when the default (excluded) behavior was used.

## Limits (all caller-overridable, defaults in `DEFAULT_LIMITS`)

| Limit | Default | Enforced |
|---|---|---|
| File size | 25 MB | before parse |
| Sheets | 50 | after parse, before row extraction |
| Rows per sheet | 20,000 | per sheet, before row extraction |
| Cells per row | 200 | per row, during extraction |

## Column aliasing and the mapping report

`COLUMN_ALIASES` maps each canonical field (`organizationDomain`, `organization`, `channel`,
`sourceUrl`, `capturedAt`, `confidence`, `verified`, `inferredBasis`, `notes`) to a list of
real-world header spellings, matched case- and punctuation-insensitively (`"Source URL"`,
`"source_url"`, `"Evidence URL"` all resolve to `sourceUrl`). Every import result includes a
per-sheet `sheetReports[]` entry with:

- `columnMap`: which column number each resolved field landed on
- `unmappedHeaders`: header cells that didn't match any alias (visible for review, not silently
  dropped)
- `missingMandatoryColumns`: which of the 4 mandatory fields had no resolvable column at all

If **none** of the 4 mandatory fields resolve on a sheet, that sheet is skipped entirely
(`skippedReason: 'no-mandatory-columns-resolved'`) rather than attempting row-by-row extraction
against a sheet that clearly isn't one of the expected Work-agent formats.

## The 5 named Work-agent file types

The mission names five: qualified agencies, buyer-intent opportunities, priority lists, approval
queues, and channel/signal evidence. The pre-existing `PACK_TYPES` in `importer.mjs` already covered
the first two (`qualified_agency`, `buyer_intent`); this patch added three disclosed entries so all
five have a home: `priority_list`, `approval_queue`, `channel_signal_evidence`. No other `PACK_TYPES`
consumer (scoring, opportunity creation) treats any pack type differently from another, so nothing
else needed to change.

## Deduplication

Two layers, not one:

1. **Within-workbook, domain+organization** (this module's own `dedupeByDomainAndOrganization`):
   catches the same organization/domain appearing twice across different sheets of one workbook
   even when the channel column differs between the two appearances.
2. **Within-pack, domain+channel** (the existing, unmodified `importer.mjs#prepareImportBatch`):
   applied on top, unchanged from every other format importer.

## Lineage

Every extracted raw record carries: `__sheet`, `__row`, `__sourceFile`, `__workbookHash` (sha256 of
the whole workbook buffer), and `__cellRefs` (a `{field: "A2"}`-shaped map of the exact cell address
each resolved field came from). This survives into both accepted records (`record.raw`) and
quarantined records (`quarantined[].raw`), so any row's provenance is fully traceable back to a
specific cell in a specific sheet of a specific workbook.

## Reuse, not reimplementation

Every raw record this module produces is handed to the existing, already-tested
`importer.mjs#prepareImportBatch`/`normalizeRecord`, which still owns all 9 quarantine reasons and
the domain+channel dedup. `xlsx-import.mjs` is a new *producer* of `rawRecords` for that same
pipeline, not a parallel validation path -- exactly the same pattern CSV/JSON/JSONL/Markdown already
use.

## Test coverage

`revenue-os/fixtures/xlsx-fixtures.mjs` builds every hostile fixture programmatically with exceljs
itself: formula-injection (mandatory + non-mandatory), an oversized-row-count workbook (tested
against a small caller-supplied limit rather than a genuinely huge file), a hidden sheet, a hidden
row, a cross-sheet duplicate, four date representations (native Excel date, ISO string, loose
English string, unparseable string), a truncated/corrupt zip, a CFB-signature "encrypted" file, and
aliased headers. `tests/revenue-os/xlsx-import.test.mjs` (16 tests) exercises all of them plus the
sheet allowlist and the plain happy path.
