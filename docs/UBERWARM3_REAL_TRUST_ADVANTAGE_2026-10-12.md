# UBERWARM³: Genuine Reputation Advantage Program

Date: 2026-10-12
Truth: DRAFT BRANCHED SOURCE, NO DEPLOYMENT, NO INDEPENDENT OPT-IN PARTICIPANTS ATTESTED, NO REAL OUTBOUND SENDS AUTHORIZED, NO EQUIVALENCE PROVEN.
Parent PR: #1403, base main SHA 298bd585d3ba0cf1fe5cdc2f81a525eb67819608.
Founder direction: seek a genuinely better, eventually low-cost alternative to Winnr's $0.60/mailbox/mo network.

## What stronger actually means

Do **not** seek to beat a warm-up service by sending more internally generated fake mail. Winnr's own description says its network exchanges realistic messages and positive engagement; these are external acts, not locally clonable software. Receiver providers are the judge. UberBond can strive to outperform in:

1. **Evidence integrity:** authenticated recipient-folder observations from real independent, consenting accounts, not vendor-only placement percentages or simulated engagement.
2. **Recipient-network attribution:** Gmail/Google, Microsoft, Yahoo, Apple considered independently; the two connected personal Gmail addresses are ONE provider, not two.
3. **Actual sender compliance:** official Google Postmaster v2 domain-level SPF/DKIM/DMARC, deliverability verdicts, volume-data gaps. Google official source: https://developers.google.com/workspace/gmail/postmaster/reference/rest/v2/domains/getComplianceStatus . Requires scoped authorized access to verified domains.
4. **Real quality feedback:** actual hard bounces, suppressed/unsubscribed recipients, complaints, eligible genuine conversations and accepted delivery outcomes from trusted inbox/provider ledgers.
5. **Better incentives:** don't buy more sending volume when the evidence, recipient permission or quality is absent. Optimize cleared contribution profit/founder minute, not peak sends/day.
6. **Causal comparison:** compare a no-addon UberWarm³ arm against Winnr warming using randomized, matched, permitted real-recipient cohorts and conservative confidence bounds. No claim of victory from tiny seeds.
7. **No fake engagement:** never instruct a panel to mark Junk as Not Junk, reply merely to improve a score, or disguise diagnostic traffic as normal human communication. Recipients may decline, opt out or report honestly.

## Implemented on PR #1403

### 1. Evidence oracle
`src/uberwarm3-reputation-oracle.mjs`
- Compiles per-mailbox health decisions from independently authenticated ingestion, not self-reported strings.
- Quarantines observed broken SPF/DKIM/DMARC, >=0.3% complaints, >3% hard bounce, or actual seed Spam placement.
- Signals older than seven days are not considered current. Missing complain/spam metrics remain UNKNOWN.
- Distinct providers required; two Gmail seed accounts alone do not satisfy diversity.
- Existing UberWarm² cap is an upper ceiling, never expanded by the oracle; campaign approval and recipient legal eligibility remain independent.
- Compares with paid Winnr only on matched, owner-authorized, legally eligible, genuinely randomized, independently observed real-recipient records; Wilson 95% bounds, >=100 observations per arm, >=2 provider types, >=2 matched pairs. Test result is restricted to observed cohorts, not global superiority.

### 2. Consented external diagnostic panel
`src/uberwarm3-consent-panel.mjs`
- Registry of opted-in participants across verified recipient providers, with authenticated consent receipts, consent expiry, suppression/withdrawal, verified receipt access.
- Maximum one transparent owner-authorized diagnostic test per receiving participant per seven-day window.
- Enforces no automatic positive replies, no spam-folder rescue, no synthetic sender/recipient behavior, no mass fake network claims.
- Compiles **plans only**. It does not recruit participants, create accounts, send invitations, or constitute authority to transmit.
- Current actual independently verified external participant count: **UNKNOWN / NONE VERIFIED IN THIS SESSION**. Source unit tests use hypothetical fixture addresses.
- `src/uberwarm2-seed-executor.mjs` still restricts real sends to strictly owner-controlled consenting seeds; extending runtime to independent external panel recipients needs *additional* scoped consent/verified adapter work and a distinct approved payload purpose. The diagnostic panel is not wired to real send execution in this PR.

### 3. Google Postmaster v2 official connector
`src/uberwarm3-google-postmaster-v2.mjs`
- Read-only, OAuth-required, verified-domain-allowlisted `GET /v2/domains/{domain}/complianceStatus`.
- Refuses no OAuth, unauthorized domains, malformed JSON, duplicate compliance rows and mismatched domain resources. No mutation or send.
- `NO_DATA` or Google `MESSAGE_VOLUME_LOW` is never a deliverability success.
- This is **domain-level compliance**, not per-mailbox Inbox placement; merging with the oracle requires trusted binding, freshness and attribution.
- Connected Gmail plugin is **not automatically** Postmaster OAuth; production activation requires explicitly granted authorized access to verified sending domains.

### 4. Strengthened PR #1403 seed boundaries
`src/uberwarm2-seed-executor.mjs`: exact-batch owner grant now requires HMAC proof from protected server-held key; no unsigned `granted:true` sufficient. Receiver observation requires a trusted synchronous authenticated receiving verifier callback; a string evidence reference alone cannot assert an Inbox outcome. No production signing key or receiver adapter was installed.

Earlier PR components remain: encrypted UberFleet SMTP bridge, one-shot Postgres claims, seed/day<=1, sender/day<=2, global/day<=100, provider outcome uncertainty/no replay, isolated migration.

## Provider official sources (observed Oct 12)

- Google Gmail sender guidelines https://support.google.com/mail/answer/81126 : authenticated valid traffic, gradual ramp, engagement, low complaint rates, avoid spam.
- Google Postmaster dashboards https://support.google.com/mail/answer/14668346 : limited volume may suppress data; low reported spam may hide automatic spam filtering.
- Postmaster v2 authenticated read API https://developers.google.com/workspace/gmail/postmaster/reference/rest/v2/domains/getComplianceStatus .
- Yahoo complaint feedback loop https://senders.yahooinc.com/complaint-feedback-loop/ : DKIM-signed domain enrollment and user spam reports.
- Winnr warming https://winnr.app/help/warming/how-warming-works.html : paid simulated/automated engagement network, $0.60/mailbox, 2-4wk warmup recommendation. Vendor description is not independent evidence that warming increases Gmail Inbox placement.

## Honest feasibility for 50 new mailboxes

At a hard limit of one diagnostic probe **per volunteer per seven days**, 50 sender accounts × 2 independent provider observations require up to **100 independent receiving placements** across a testing round. With only TWO willing independent receiving accounts, completing 100 tests while keeping each recipient to one per week could take up to 50 weeks even before other unknowns. This is why a partner panel cannot be wished into existence. Use stratified sender sampling, real permitted correspondent traffic and authenticated aggregate platform data rather than pretending all 50 were individually certified on Day 14.

AI can design useful artifacts that recipients genuinely request, draft natural responses only for human review, classify voluntary inbound replies, explain risks and allocate holdouts. It cannot produce recipient desire, real provider reputation or false-positive engagement in a defensible manner.

### What could win in a controlled trial?

Success requires materially higher **independent real-recipient Inbox placement** AND equal or lower complaints/bounces, with equal target audiences, times, domains and legal eligibility, plus positive contribution economics. If the paid arm wins or confidence overlaps, declare INCONCLUSIVE/LOST, not "better."

## Verification frontier and owner effects

New tests:
- `tests/uberwarm3-reputation-oracle.test.mjs`
- `tests/uberwarm3-consent-panel.test.mjs`
- `tests/uberwarm3-google-postmaster-v2.test.mjs`
- existing UberWarm² executor, PostgreSQL and SMTP tests updated to fail closed on unsigned owner grant and unverified recipient.

The initial source-level V8 harness passed **13/13 oracle + 7/7 panel + 6/6 Postmaster = 26/26 focused cases** after the later verifier fixes. Earlier exact-head source checks on executor were 12/12 in mocked-crypto V8; original Node/PG/SMTP CI for full PR is STILL NOT CERTIFIED. V8 mocks are not production crypto, live DB or real provider tests. Original Actions billing and fork integration permissions are blockers; no PR merge, no deployment, no payment, no DNS, no external mailing.

## Narrow next actions

1. Test the exact PR head with a real Node 22 runner and isolated PostgreSQL, review cryptographic auth and consent receipt verification. Do not merge failing/unverified code.
2. Connect **read-only** Google Postmaster OAuth for owner-verified sending domains and normalize real low-volume compliance without private credential exfiltration.
3. Obtain willing independent diagnostic participants through genuinely opt-in channels or user-provided existing relationships, not unsolicited fake warmup recruitment; integrate live receiving-folder facts and consent revocation. No sending until user/session/digest authorization.
4. Run an approved matched experiment across meaningful real recipient traffic only if present; validate delivery and contribution outcomes against Winnr. If no evidence, remain unproven.

## Founder-level continuity

This is a bounded distribution/quality organ inside UberBond, not a reset of the Sovereign Cognitive Continuum, Personal Civilization Engine or 890 founder ideas. All founder ideas 0001-0890 and post-890 GENESIS retain original identities, provenance and pointers; their empirical validity is neither proven nor negated by this experiment. Reuse `docs/UBERWARM2_CAPABILITY_DONOR_SYNTHESIS_2026-10-01.md` as the donor lineage.

## October 12 final adversarial amendment

The comparison oracle now applies hard minimums regardless of caller settings: >=100 real independent Inbox observations per arm, >=2 recipient providers, >=2 matched pairs and non-negative, >=2-percentage-point lower confidence bound advantage. Each matched pair must have observation count ratios within [0.8,1.25], and no receiving provider may have a lower observed UberWarm³ placement rate than Winnr. This blocks both underpowered claimed wins and misleading pooled Simpson-style victories.

Tests were extended and run against exact fetched branch source under a **transformed ESM / V8 behavior harness**: oracle 16/16, consent panel 7/7, Google Postmaster v2 6/6. Together **29/29** for this newly added phase. Earlier executor mocked-crypto V8 checks 12/12; earlier PostgreSQL/SMTP suite checks require renewed exact-head Node CI. No causal claim of actual superiority, no live OAuth, no independent opt-in panel membership, no delivery experiment and no paid product activated.
