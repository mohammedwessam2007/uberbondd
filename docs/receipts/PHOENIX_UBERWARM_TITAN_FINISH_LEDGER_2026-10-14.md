# PHOENIX UBERWARM TITAN — finish ledger (2026-10-14)

Canonical progress ledger for the "finish the verified remaining work" mission on
branch `claude/phoenix-titan-trident-monster-c-20261014`, working PR #1405, coordination
issue #1188. Entries are append-only. A superseded conclusion stays in place and is marked
`SUPERSEDED BY <entry>`, never overwritten.

Record classes: **SOURCE** (code on the branch), **LOCAL** (local test on a named SHA),
**HOSTED** (GitHub Actions on a named checkout), **DEPLOY** (running service), **PROVIDER**
(live provider read), **EXTERNAL** (effects in the world). These are never merged into one claim.

## Baseline (observed 2026-10-14, UTC)

| Item | Value | Source |
|---|---|---|
| main | `298bd585d3ba0cf1fe5cdc2f81a525eb67819608` | `git fetch origin main` |
| #1405 branch head | `2a36f22eb8b733dd861c4f4e6906b201d79883fe` | `git rev-parse origin/claude/phoenix-…` |
| Hosted CI checkout for #1405 | `ccac26a656f89d6b41ce494b5be26d3ff3b1278a` = GitHub PR merge ref `refs/pull/1405/merge` (merge of 2a36f22e into 298bd585) | `git fetch origin refs/pull/1405/merge` |
| Last complete local receipt | `f87e5e9008a530726a65aa4c8c33998f75321d05` | PR #1405 body (superseded as final by this ledger) |

Hosted CI runs test the **merge ref**, not the branch head. Its tree equals the branch head's
tree (main is an ancestor of the branch), so a freshness artifact generated at the branch head
is valid on the merge ref.

## Entries

### E-001 — T-CI-01 hosted red root causes (reproduced)
- Hosted runs: CI `38538015489` deterministic FAILURE; Night Verification `38538015438` core-verification FAILURE; Night Postal `38538015392` postal-focused FAILURE; UberOutbound `38538015456` SUCCESS.
- **Night Postal**: `git diff --check origin/main...HEAD` failed with `unknown revision` because `actions/checkout` used the default shallow depth. Not a code defect and not a billing issue.
- **Night Verification core-verification**: 2 failures. Reproduced in a `--depth 1` clone of the branch: both are `tests/canon-freshness.test.mjs` assertions (commit-in-history, and artifact-describes-current-source). The history check needs full history; the freshness check needs regenerated artifacts.
- **CI deterministic**: 1 failure, the freshness assertion (`docs/CURRENT_SYSTEM_STATE.md` and `artifacts/system-readiness.json` describe `aeba82fc`, while `src/uberwarm2-*` changed at `2a36f22e`). Reproduced locally on the merge ref `ccac26a6` in a detached worktree (`scratchpad/ci-ccac`): `# fail 1`, the same assertion.
- Earlier "2 failures" in the core-verification log were the same two freshness subtests, not a second independent defect.
- **SOURCE fix (workflow only)**: `.github/workflows/night-postal-focused.yml` and `.github/workflows/night-verification.yml` `core-verification` now use `fetch-depth: 0`. Both files parse as YAML (validated locally). `ci.yml` already used `fetch-depth: 0`.
- **Pending**: the freshness regeneration must happen after the final source commit, then be committed as a separate artifacts-only commit so the sourceSha is the parent of that commit (the same two-step pattern as `aeba82fc`).

### E-002 — Winnr live reconciliation (read-only)
Token: `MCP · Claude`, **permissions `["read"]` only**. Holds, cap changes and other writes are NOT available through this token, and no write was attempted or worked around.

- Account `DfIijISE95q4YK2jPoIL`, plan `startup`, `stripe_subscription_status: active`, `prewarmed_subscription_status: trialing`, `email_users_limit 50 / used 50`, `domains_limit 20 / used 10`, `domain_credits 0`.
- Inventory, verified from paginated list calls: **53 identities** = 50 Startup identities on 10 domains (5 each: `uberbond.site`, `uberbondai.shop`, `uberbondapp.site`, `uberbondcloud.shop`, `uberbondconnect.online`, `uberbondcore.space`, `uberbondengine.website`, `uberbondflow.space`, `uberbondforge.space`, `uberbondglobal.website`) plus **3 pilot identities** on `cedarpointdomains.com` (pre-warmed, tag `pre-warmed`, `payment_status: paid`, `payment_amount: 9`). Email addresses are not recorded here (private identities); the protected stable-ID mapping is held outside Git.
- Provider daily sending cap: `daily_send_limit: 50` on **all 53** identities. This is the provider-side value, not zero. Local policy holds (ordinal quarantine, pause) are not mirrored in the provider. Gap recorded.
- Warming: `winnr_list_warming` total 0; `winnr_get_warming_overview` `total_mailboxes 0`, `monthly_cost 0.0`. No mailbox is enrolled in warming per the API.
- `prewarmedSubscriptionStatus: trialing` applies to the **pre-warmed pool** (the 3-identity $9 pilot). Its domain shows `payment_status: paid`, `$9`. The API does not expose trial end date, invoice history or renewal date, so the financial consequence at trial end is **not verifiable here**. It does not indicate the $30 add-on, which is not enrolled.
- Invoice truth (renewal date, paid Startup invoice, extra charges) is **not exposed by the available Winnr MCP tools**. Reported as unverified rather than inferred.
- Jobs: 15 most recent `domain_setup` jobs, all `completed`, dated 2026-10-13T00:55Z. No failed or in-progress jobs.

### E-003 — DNS and provider evidence (read-only, freshness)
`winnr_get_dns_status` for all 11 domains: every domain `all_verified: true`, `ns_status: true`.
- **MX**: `10 inbound.<domain>` verified on all 11.
- **SPF**: `include:amazonses.com include:s1.<domain> -all` on the 10 Startup domains; pilot domain `include:amazonses.com ip4:190.102.107.128/27 ip4:107.155.97.234/32 -all`.
- **DKIM**: provider-issued selector is **`dkim`** (host `dkim._domainkey.<domain>`, `has_txt: true`) on all 11. The selector is taken from the provider's record, not guessed. The key material and whether DKIM signs real messages are not returned, so **signing/alignment is not proven**.
- **DMARC**: `p=reject` on all 10 Startup domains with `rua` to the domain; **pilot `cedarpointdomains.com` is `p=none`** (weaker policy, recorded as a finding).
- **NS**: `ns1/ns2.myauto1transport.com` on all.
- **Still missing** (as the mission lists): Return-Path behaviour, sending IP/PTR and TLS observed at the transport, and registrar ownership/renewal evidence. The Winnr `registrar` field reads `external` on all 11 domains; registrar evidence is not in the API.
- No DNS record was written. No authentication probe was repeated.

### E-004 — T-EH-01 event-horizon provenance (investigation, no change)
- `8f0de479` is commit `8f0de47995e7a408809220cef3deacf721a192c2`, dated 2026-08-31, "Regenerate the readiness canon at the merged head (#271)". It is referenced by 1,131 remote refs and by no tag.
- **Main and that commit share no common ancestor** (`git merge-base` is empty). Main-only commits: 50. Commits only in the August history: 754. So `8f0de479` is not "unmerged work" that main is missing. It belongs to a disjoint history.
- The tree of `8f0de479` (`39344cfe073e…`) was not verified as present in main.
- **Proposed lineage-preserving resolution (owner decision required; not implemented)**: keep the check's `NOT_AN_ANCESTOR_OF_HEAD` red until the owner decides. The two honest options are: (a) add an explicit, reviewed state such as `PRESERVED_IN_DISJOINT_HISTORY` to the doctor that requires a durable archive reference and a tree-hash match, recorded in the research receipt; or (b) record the research start as "not verifiable against current main" and leave the red. Option (a) is only truthful if an archive ref (for example `refs/archive/event-horizon-2026-08-31`) is created first. Moving the research start to a current main SHA would be an invented claim and is rejected.

### E-005 — Defect repairs A–H (isolated worktrees)
Dispatched as a workflow (`wf_cad93fd3-4b8`), one isolated worktree per defect from `2a36f22e`. Each agent reproduces before fixing and proves with real PostgreSQL where required. Results to be merged here with their commit SHAs and independent review verdicts.
- Status at this entry: **running**.

### E-006 — Items not yet recovered (blocked, stated, not invented)
- **E21/E22, E23/E24, H01–H12**: definitions are not in the repository (`git grep` on main found no match) and were not in #1188 pages 1–4. They are NOT evaluated and NOT marked complete.
- **"Monster Mission W" full text and the UberWarm Monster Mission C document**: not in the repository and not located in #1188 pages 1–4. The mission text supplied in the prompt is used as the work order.
- **Render production DB (`dpg-dali9dbl550s73bcf520-a`, expiry 2026-10-16 23:22:29 UTC)**: no Render access tool in this session and no connection credentials. Items P0 1–10 are not executed here. Blocker recorded in the owner queue.

### E-007 — External effects this checkpoint
- Attempted: read-only GitHub reads (issue comments, PR state, check runs, job logs), `git fetch`, a read-only Winnr API read set (account, usage, domains, email users, warming, jobs, DNS status for 11 domains), local tests on local clones.
- Confirmed: none beyond reads.
- Refused / not performed: no Winnr write, hold, purchase, subscription change; no send; no DNS change; no Render deployment; no production database connection; no PR merge; no PR body update yet; no comment posted.
- Uncertain: none.

## Owner action queue (current, maximum three items)
1. Decide the event-horizon provenance option (E-004 a or b) and create the archive ref if option (a) is chosen.
2. Provide Render production-database custody evidence before 2026-10-16 23:22:29 UTC: confirm the preserved archives are restorable and approve the non-pooler migration connection plan. Without owner-side access, this cannot be executed from the sandbox.
3. Winnr: a token with write scope is needed before any protective hold or cap change can be applied, and the owner should confirm the current invoice/renewal state from the Winnr billing screen, since the API does not expose it.

## Next executable actions
1. Commit this checkpoint (CI workflow fetch-depth + this ledger); push; verify the remote SHA; link from #1188.
2. When the defect workflow returns: merge each proven fix as its own commit, run focused and real-PostgreSQL proofs on the merged result, then the full chain on the final source.
3. Regenerate `docs/CURRENT_SYSTEM_STATE.md` and `artifacts/system-readiness.json` with `npm run readiness` after the final source commit, commit them separately, and re-run the freshness tests on the new head and on its merge ref.
4. Update the PR #1405 body to the final head and attach the hosted-checkout (merge-ref) receipt.

### E-008 — CORRECTION to E-006: P0 Render database rescue exists and is verified
- E-006 said the Render production DB was not addressed. That was wrong. Issue #1188 comment `6154414447` (2026-10-13 20:20 UTC) reports the Render-to-Neon **point-in-time rescue executed and verified**: source `dpg-dali9dbl550s73bcf520-a` (`uberbond_control_postgres`, read-only, allowlist unchanged), destination Neon project `misty-moon-35132124`, database `uberbond_render_rescue`, empty before the run.
- Receipt: `ops/phoenix-rescue/RESTORE_RECEIPT_20261013.json` on remote branch `ops/phoenix-render-neon-rescue-20261013` (fetched `69236e35`; the comment's `9b37035c` link is not present on remote refs now).
- **Independently recomputed from the receipt, not from the live database**: 57 tables; table row counts sum to **1,254**; dump SHA-256 `ba643e2545cd…` and archive SHA-256 `ce8fc45bbe20…` match the comment; `encrypted_backup_roundtrip_verified: true`; `production_cutover: false`; `source_read_only: true`; `source_external_allowlist_changed: false`.
- The receipt field `policies: 57` counts table RLS-state rows, not 57 policies, as the comment states.
- **Not verified by me this session**: any live Render or Neon state (no access here), the helper's suspension, the `RESCUE_ARCHIVE_KEY` custody, the 2026-10-16 23:22:29 UTC expiry.
- **P0 status after correction**: items 1–2 (source availability, backup custody, preservation of earlier archives) are supported by the receipt, with live re-confirmation still owed. Items 3–10 (non-pooler migration enforcement, original-key binding, boolean decryptability evidence for account credentials, isolated boot and crash/rollback acceptance, writer inventory, quiescence and buffering, post-snapshot reconciliation, one-writer cutover and rollback instructions) remain **OPEN**. The rescue is a point-in-time snapshot, not replication; later production writes are not copied.
- Next executable action: repository work on item 3 (refuse migration locks through a transaction-pooler URL) can proceed without access; items 4–10 need owner-side access to the protected original key and the production runtime.

### E-009 — P0 item 3 implemented: migrations refuse transaction-pooler connections
- SOURCE: `src/postgres-migration-connection.mjs` (new) exports `assertDirectMigrationConnection`. It refuses port 6543, a host naming a pooler, `pgbouncer=true`, `pool_mode=transaction`, and an unparseable URL. Errors carry code `MIGRATION_REQUIRES_DIRECT_CONNECTION` and never echo the password.
- SOURCE: `src/store.mjs` `PostgresStore.migrate()` calls the guard before any lock or connection. It is also the boot path (`init()` calls `migrate()`), so application startup is covered.
- LOCAL: `node --test tests/postgres-migration-direct-connection.test.mjs tests/store-migration-lock-hostile.test.mjs tests/context-journal-migration-lock.test.mjs` → 17/17 pass. `node --test tests/store*.test.mjs` → 25 pass, 0 fail, rest skipped by the PG gate.
- LIMIT: this detects known indicators. It cannot prove that an arbitrary custom host is not a transaction pooler. The owner-supplied direct URL remains the real control. A pool passed in without a URL is not inspected.
- Commit: see the git log entry following this one.

### E-010 — A1 receipt sent to Work (#1188 comment `6168606252`)
- Exact A1 commits: `813cb17b`, `185a9ed1`, `10d0c132`. Receipt on `bd8146e4`: 9/9 real-PG hostile migration tests pass.
- Not an immutable final-source admission. Boot isolation, original-key decryption, writer freeze and the final-source chain are not covered and remain open.

### E-011 — Security incident: metadata only, no values (from Work comment `6158705896`, item 3)
- Event as reported by Work: a Render copy step exposed the archive key into a private tool output; a later environment-group preparation loaded production environment values, and some credentials appeared in private tool output. The draft was discarded and no key was copied to the helper.
- Names known from the report: `RESCUE_ARCHIVE_KEY` (archive key, used by the rescue helper; not rotated). The other affected credential names are **not enumerated** in the report.
- Requested from Work: names only, from the Render audit log, with scope of access and time window. No values are requested or recorded here.
- Containment position: no blind rotation of the archive or encryption key. Rotate only the credentials the audit log shows were exposed, after dependency analysis, and keep tested decryptability and recovery compatibility.
- Status: OPEN, owned by Work for the audit names; containment decision needs the names.

### E-012 — UberWarm²–⁶ acceptance matrix (source, tests, wiring, deployment, evidence reported separately)
Read from the branch head `d411bc9b`. "Wired" means imported by non-test code under `src/`, `scripts/` or `server*.mjs`. "Deployed" means the live service, whose SHA is `24854739`, which predates these modules.

| Layer | Source | Tests | Wired (non-test importers) | Reachability class | Deployed | External evidence |
|---|---|---|---|---|---|---|
| UberWarm² seed executor | `uberwarm2-seed-executor.mjs`, `uberwarm2-send-capability.mjs` (new) | donor-gap-closure, seed-executor, seed-hostile, send-capability | 1 (registry bridge) | AWAITING_ACTIVATION (NO_UBERWARM_ZERO_ADDON_LIVE_AUTHORIZATION) | no | none |
| UberWarm² SMTP seed bridge | `uberwarm2-smtp-seed-bridge.mjs` | smtp-seed-bridge | 0 | AWAITING_ACTIVATION | no | none |
| UberWarm² PG ledger | `uberwarm2-pg-ledger.mjs` | pg-ledger, ledger-concurrency | 0 | AWAITING_ACTIVATION | no | none (migration pending, not applied) |
| UberWarm² registry bridge / ramp | `uberwarm2-registry-bridge.mjs`, `uberwarm2-sovereign-ramp.mjs` | registry-bridge, sovereign-ramp | 1 each | AWAITING_ACTIVATION (NO_MAILBOX_PROVISIONING_AUTHORITY) | no | none |
| UberWarm³ | 4 modules | 5 test files incl. zero-addon firewall | 0 | AWAITING_ACTIVATION | no | none; no Postmaster data |
| UberWarm⁴ | 2 modules | 2 test files | 0 | AWAITING_ACTIVATION | no | none |
| UberWarm⁵ capacity bridge | `uberwarm5-capacity-bridge.mjs` | capacity-bridge | 1 | AWAITING_ACTIVATION | no | none |
| UberWarm⁶ economic dominance | `uberwarm6-economic-dominance.mjs` | economic-dominance | 1 | AWAITING_ACTIVATION | no | fixture mathematics only; not measured superiority |

Statements that hold:
- The 50 Startup SMTP AUTH and IMAP LOGIN results are historical credential-acceptance evidence. They are not placement, reputation, permission or send authority.
- No receiving-provider observation exists for any layer. Missing data is recorded as missing, not as a healthy reputation.
- No layer is deployed. Synthetic diagnostics are not presented as measured reputation or paid-addon dominance.

### E-013 — Item 11: diagnostics and receiver candidates (nothing sent)
- Recovered receiver candidates: none verified in this session. No consenting seed was enumerated, and no inbox-access, consent or folder-observation scope was verified.
- Executable send-set: **`[]`**. Approved messages: **0**. Sent messages: **0**. Cold-send authority: **NONE**.
- No synthetic conversation, fake reply, Not-Spam action or manufactured engagement was created. Two Gmail accounts would count as one provider network if ever proposed.

### E-014 — Defect repairs: independent review verdicts and merged subset
Source of verdicts: workflow `wf_cad93fd3-4b8` journal, five BROKEN reviews read in full on this checkpoint. Nothing below is a claim of completion.

Merged into `claude/phoenix-titan-trident-monster-c-20261014`:
- **A** (JSON import conflicts inside savepoints) = `6c1eada1` → `7e527231`. Independent review: CONFIRMED_FIXED. Focused PG: `tests/json-import-postgres.test.mjs` included in the 31/31 run below.
- **G** (refuse a concurrent Winnr import instead of queueing) = `f5596494` → `0158d57d`. Independent review: CONFIRMED_FIXED. Focused PG: `tests/winnr-import-lease-concurrency-pg.test.mjs`, `tests/winnr-import-disposable-pg.test.mjs`.
- Combined focused run on the merged head: `node --test` over `json-import-postgres`, `winnr-import-lease-concurrency-pg`, `winnr-import-disposable-pg`, `store-migration-lock-hostile`: **31 tests, 31 pass, 0 fail, 0 skipped**. `scripts/check-syntax.mjs`: 2962 files parse.

NOT merged. Each verdict is BROKEN with the reproduced reason recorded here:
- **B** sender-health atomicity (`1b388d42`): atomicity is fixed for readiness, staging and import. Reproduced regression: `src/inbound-suppression-propagation.mjs` guard `row => row?.paused !== true` lets a complaint hold be skipped when a readiness probe failure pauses the sender in the window between the complaint's live `findOne` and `setSenderPaused`. Result: `held:false`, `holdStatus:SENDER_ALREADY_PAUSED`. ADV-7 regression also reported.
- **C** DSN and ARF forgery (`21e1e301`): the repair's own counts reproduce, but five breaks remain on HEAD. A contradictory DSN (Final-Recipient vs Status) still charges `hard_bounce`. A forged ARF from Feedback Loop with no `Authentication-Results` still charges `complaint` and holds the slot. Authentication is only a veto, so unauthenticated forgery passes.
- **D+H** (`166fc0f0`): **D** (migration bookkeeping, record the two unrecorded migrations) reviewed CONFIRMED_FIXED. **H** (idle pool error sanitization) BROKEN: a password inside a thrown error's `message` is emitted verbatim in `STORE_IDLE_POOL_CLIENT_ERROR`. D must be split out of the combined commit before any merge.
- **E** UberMail uncertain-send fence (`8f41bef9`): named scenarios are correct. Two breaks remain. (1) A governed receipt with `executed=true` whose `authorized` is omitted or false is refused as a plain 403. The key is released and a same-key retry dispatches again (dispatches=2). The base behaves identically. (2) `reconcileUncertainSend` is not operator-only.
- **F** recipient alias fold (`21570256`): the listed spellings are fixed and the table is 26/26. But the change alters behaviour where implementations disagree: `a+<k@x.com>` and `a+<m@x.com>` now stay distinct, and the spec forbids that (the repair listed it as an owner decision and shipped it anyway). Over-length input now differs at function level. A display-name opt-out followed by a separator is not honoured.

Status: B, C, D+H (H portion), E, F OPEN. None is merged. Each needs a repair round on the current head with its reproduction, then independent re-review. F's bracket-after-plus change needs a decision to revert or an explicit owner ruling; the reviewer's reading is that the spec forbids it.

### E-015 — Checkpoint: merged subset grows; CI red cause identified and fixed; four defects still open
Head: `d2da2f93` on `claude/phoenix-titan-trident-monster-c-20261014` (remote SHA verified). Working PR #1405 (draft).

Merged since E-014, each as its own commit:
- **N08 complete-history reader** (`src/sending-registry-complete-history.mjs`, `src/sending-domain-registry.mjs`, `src/sending-mailbox-registry.mjs`, `tests/sending-registry-complete-history-n08.test.mjs`) from draft #1408 at `d1397424`. Source and test only. Its CI workflow and receipts were left out so the append-only ledger stays the single record. Real PostgreSQL run via an embedded server: **4/4 pass**. Commit `4e1c19c0`.
- **Fixture contract for that reader**: `tests/uberwinnr-fleet-plan.test.mjs` and `tests/uberwinnr-postpurchase.test.mjs` stores now give each logged row a deterministic `audit-N` id and implement `count()` with `list()`'s type filter. The reader was not weakened. Focused run: **23/24 pass, 0 fail**, the one skip is the PG-gated N08 test. Same commit.
- **Whitespace check**: `tests/fixtures/retired-startup-guards/r3-candidate-reconciliation.txt` has trailing whitespace on line 156 and a blank EOF line, introduced by `c0953754`. The r3 test pins the file's sha256, so the bytes are not rewritten. Instead `.gitattributes` exempts that one path from `git diff --check`. Decision for the owner to reverse if preferred. Same commit.
- **D** (migration ledger self-record, `96082afc`): the D half of `166fc0f0`. Suites: `db-compat-boot`, `db-compat-migrations`, `db-compat-receipt`, `migration-ledger-self-record`: 28 pass, 0 fail, 1 skipped (not in the D set).
- **H** (idle pool sanitizer, `d2da2f93`): the five reviewer-reproduced leaks are closed. Quote-before-separator JSON keys, unencoded-space URL passwords, slash-in-password, `pass=`, plus an unreadable error now still produces an UNREADABLE line. Two regression tests added. Suites: 29/29 pass across store-idle-pool, direct-connection, migration-lock-hostile, db-compat-boot, migration-ledger-self-record. Syntax: **2966 files parse**.

Reproduced-before-fix status:
- The three fixture failures reproduced on this branch after the N08 merge (`sending-registry-history-verification-unavailable`), and are fixed.
- The five H leaks were reproduced by the reviewer, not independently re-run on this branch before the fix. The regression tests use the reviewer's exact inputs.

CI red cause: the hosted failures High reported on stacked #1410 (run 38612596240: 4 fail, 3 fixture-contract and 1 canon-freshness) are addressed by the fixture commit and the readiness regeneration still pending (see below). The hosted run on the final SHA is not yet observed.

STILL OPEN, not merged, with the review reproduction recorded in E-014:
- **B** complaint-hold race (`src/inbound-suppression-propagation.mjs`, guard `row?.paused !== true`).
- **C** forged DSN and ARF still charged; authentication only vetoes.
- **E** uncertain-send fence: `authorized` omitted/false still re-dispatches; `reconcileUncertainSend` not operator-only. Named scenarios are correct.
- **F** alias fold changes behaviour where implementations disagree (bracket-after-plus). The spec forbids that; the repair shipped it anyway. Needs revert or an explicit owner ruling.
- **Canon freshness**: `docs/CURRENT_SYSTEM_STATE.md` and `artifacts/system-readiness.json` must be regenerated with `npm run readiness` after the final source commit. Not done, because the source is not final yet.

Not done in this checkpoint: full verification chain on the final immutable source, hosted run on the final SHA and merge ref, PR #1405 body update, ledger items for the owner gates (P0 database, Winnr holds, provider and DNS evidence).

Safety: 0 emails sent, 0 spend, 0 DNS change, 0 deployment, 0 merge. Sender hold and send-set state unchanged from E-013.
