# PR #1377 | zero-new-spend owner-independent recovery, 2026-10-10

**Status: ADVISORY / NO SEND / NO MERGE / NO DEPLOY / NO PRIVACY CHANGE.**
This follows `AGENTS.md`, existing global policy evidence, and the unreleased PR #1377 freshness gate. Don't silently overwrite its source or remove its source-lineage receipts.

## 1. No-lawyer Egyptian sender path: real regulator requirements, not an arbitrary counsel prerequisite

**Primary source:** Egyptian Personal Data Protection Center (PDPC) official FAQ, https://www.pdpc.gov.eg/ , accessed 2026-10-10, relevant laws 151/2020 and executive regulations 816/2025.

PDPC defines a data subject as a natural person identifiable through electronically processed information. The published direct electronic marketing (EDM) FAQ specifies **valid explicit prior consent**, identity and contact details of creator/sender, marketing purpose, a **free unsubscribe/opt-out**, proper retention of consent and opt-out evidence for **three years**, and an appropriate `EDM for Self` permit/license (or `EDM for Others` for third-party senders). Those are actual requirements under the described regime, not an instruction to pay legal counsel.

**Routes with distinct duties:**
1. **INBOUND_REQUESTED**: respond only to an independently verifiable enquiry, request for quotation, or buyer-initiated message. Keep reply within requested transactional scope. Do not insert unconsented cold marketing. Verify recipient/channel terms. This can proceed as a *preparation* path now without engaging a lawyer; ordinary service delivery still must satisfy applicable privacy/provider rules.
2. **EXISTING_CONTRACT_SERVICE_ONLY**: support and deliver an existing authorized contract, with verified contract and no added marketing. Do not recategorize promotional broadcasts as service messages.
3. **CONSENTED_EDM**: the practical self-service route to **prepare** marketing when records and correct permits exist. Before any send, verify prior consent, appropriate PDPC self license/permit, identities, subject/purpose, opt-out, records and the recipient-country/provider rules; record actual evidence hashes and activity dates. A lawyer is optional, not a legal condition. Licenses/permits may have fees; no fees/spend authorized here.
4. **FOREIGN_CORPORATE_ROLE_NONPERSONAL**: a real generic *company* mailbox with no identifiable natural-person data is an important material-scope distinction, already represented by UberBond policy rules `sender:EG:corporate-role-no-personal-data` and `sender:EG:natural-person-scope-guidance` in `src/global-policy-evidence.mjs`. However **do not infer universal exemption** from the PDPC's general personal-data scope wording. Independently establish that the specific transaction is truly outside relevant EDM/personal-data obligations, verify US/other recipient rules and channel terms, and retain the separate legal/governance gate.
5. **UNSOLICITED_PERSONAL**: no permission based merely on a public or scraped name/email. Do not send.

**New implementation:** `src/egypt-self-service-route-inventory.mjs` is a pure zero-call classification and evidence checklist. `tests/egypt-self-service-route-inventory.test.mjs` rejects no consent, no EDM permit, fake nonpersonal classification, stale proof, malformed inputs and false authority. Regardless of input it returns `sendAuthority:false` and `legalClearance:false`; even a perfect self-declared checkbox bundle is `SELF_SERVICE_EVIDENCE_ASSEMBLED_UNAUTHENTICATED`, never regulator proof. Existing `src/global-policy-evidence.mjs`, `src/outreach-cold-route-policy.mjs`, `src/prospect-preflight.mjs` and `src/frozen-prospect-effect.mjs` still govern real eligibility and effect authority. **Neither this file nor founder confidence waives a rule.**

Practical owner-free commercial move: optimize publicly offered services, agency portfolios, inbound requests, signed proposals and existing clients now; record unsolicited messaging as blocked until the actual legal/provider/consent evidence is in place. This bypasses a paid-counsel *workflow dependency* without circumventing law.

## 2. GitHub Actions 0-step billing lock: free offline verification, official correction

PR #1377 head was `17033ddd7957e9241fd9477cd3e9320a2f584f86` when inspected, current public main `b3a268037dea4259b1bc6f837fa06bad69f3ccf3`. Hosted Actions failed before job steps. **No GitHub YAML/code tweak can override an account-level billing lock.**

GitHub's official process: https://docs.github.com/en/billing/how-tos/troubleshooting/locked-account (current navigation may differ). Inspect account `https://github.com/settings/billing`, Copilot/Actions budget, failed payment or authorization hold. The account owner can correct a failed authorization or ask GitHub billing support (https://support.github.com/contact), **without authorizing new paid use**. Never guess a card charge or add a nonzero budget without owner approval. If the page shows no issue, support can investigate an account-state flag; account information is private and inaccessible to our repo connector.

**No-hosted-runner fallback:** authenticated checkout of the **PR head** `17033ddd...`, with dependencies already installed, run `node scripts/pr1377-offline-verification.mjs` from a branch containing that script to execute focused Node tests in a scrubbed environment and print the honest result. This script is on the **separate recovery branch** so it will not exist in the PR head until explicitly integrated; alternatively invoke `node --test tests/prospect-evidence-freshness.test.mjs` in the PR head checkout. Run native package installation only if free and authorized. Prior independent reviewer reports 370/372 across 36 files, two pre-existing payment-bridge failures. That's history, **not** a new run. Never mark hosted CI as passed because local tests pass; record the exact tested checkout SHA and local cleanliness.

## 3. Privacy: prevent fresh leakage, preserve immutable 890 before visibility change

The connected GitHub repo API shows `visibility: public`. The original 890 transcript has been public in `main` **and history**, and deletion on main alone won't remove public Git history/copies. The authenticated GitHub connector available here does **not** expose repository administration or visibility changes, nor the account billing page. Do not duplicate the transcript in a new issue, PR, artifact or public handoff. Do not force-push, rewrite commits or destroy founder originals without secure archival and a migration plan. The best first action is owner-controlled **private visibility** in `Settings → General → Danger Zone → Change repository visibility`, after confirming build/webhook/connector impacts. Public forks or previous clones remain possible; investigate credential exposures and rotate real secrets if any were exposed. Preserve the 890 raw material in recoverable **private** storage before future repo separation or rewritten history.

Repository privacy is a distinct owner setting. This recovery branch adds **no new corpus bodies or credentials** and does not change visibility.

## 4. Exact PR 1377 release gates

Keep PR #1377 **DRAFT** until owner separately authorizes merge/deploy after independent regression and source review, real production provenance, proper legal route evidence, current source observations, provider allowance and sender identity. The Powerhouse/Sylvester checked capture expires on 2026-10-11T00:38Z: no silently advanced clock and no reused aged evidence.

**Only irreducible owner gates**: (1) repository visibility/privacy preference, (2) private GitHub billing/support state if restoring hosted CI is desirable, (3) particular outbound message / paid license/send approval after official compliance documents exist. Counsel $1,200 is **NOT** a mandatory gate. All technical operations and preparation remain internal.

**PHOENIX_ID**: UBERBOND-PR1377-ZERO-COUNSEL-BILLING-FALLBACK-PRIVACY-20261010.
