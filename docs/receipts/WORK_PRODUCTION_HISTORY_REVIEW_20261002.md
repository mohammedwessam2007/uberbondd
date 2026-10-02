# Work production-history review — 2026-10-02

Basis: merged PR #1171, main `8bb76461d5c85d47851ff3e6a43928b9e9d126a1`. Claude source closure was merged at 21:44:53Z before this minimal correction. No active Claude branch files were modified before that merge.

The merged preflight correctly requires authenticated raw-ledger reads, binds receipts, strips pasted contact-history flags, retains the sender-side conservative hold, and grants zero send authority. The merged tree passes 152 focused tests. Work independently reproduced these false-CLEAN cases with synthetic in-memory rows, never production data:

1. `messages` or `providerEvents` read fails while the other ledgers are empty: CLEAN despite an incomplete exact search.
2. Stored prospect domain matches, but a different website alias takes precedence: prior contact and linked replies are missed.
3. A current benign prospect status can hide `sentAt`, `previouslyContactedAt`, or `priorContact.lastContactedAt`.
4. A canonical sent message (`to`) can outlive its prospect row and was not matched directly.
5. A canonical provider event can link by `prospectId` with an empty `leadEmail` and was missed.
6. A new/unknown reservation state was informational instead of ambiguous blocking history.

Correction: all seven ledgers are mandatory; website and stored domain are checked independently; prior contact timestamps block; messages match canonical `to` and linked ids; provider events also match linked ids; every reservation state except the existing explicitly informational `cancelled` state blocks. Existing benign uncontacted prospect/cancelled reservation findings remain visible, not silently absent. Work will classify ANY returned finding as CONTACT_HISTORY_HIT unless the specific current policy explicitly permits that state; compiler CLEAN is not alone proof of an entirely empty history.

Verification: 158/158 focused tests pass, including six hostile regressions. Drift doctor passes; changed source syntax and diff checks pass. The first tightened run failed because two synthetic fixtures supplied only five ledgers; both fixtures were completed with the required empty message/provider-event reads and the full focused suite rerun. No whole-repository green or hosted-CI execution is claimed. PR #1171 preserves the existing 34 baseline failures and three fixture parse failures in its source receipt.

GitHub branch metadata reports main unprotected with no required status-check contexts; rulesets list is empty. A direct protection-endpoint read is forbidden to the integration, so branch metadata is the evidence used rather than claiming that endpoint succeeded.

Live reality observed separately: existing Render service still serves main `7008c87d28d53a1d00bc6b1ca7a493f29d3f5d33`, normal build `npm install --omit=dev`, normal combined web/worker start, postgres backend and online worker. Existing settings remain OUTBOUND_ENABLED=false, OUTBOUND_DRY_RUN=true, launch phase canary, allowed countries EG, ordinal 3 quarantined, bootstrap-once 0. No configuration was edited. Exact ledger API read returned 401; Render SQL is blocked by the database's existing empty external IP allowlist; free service shell requires a paid upgrade, which was declined without purchase. Powerhouse result remains PRODUCTION_HISTORY_UNKNOWN. Protected owner identity was not read; unauthenticated UI defaults cannot prove absence.

This review is source evidence, not a deployment receipt, not exact production-history clearance, not legal authority and not a send approval. Provider/transport procurement is not restarted. Messages 0; provider/DNS/account mutations 0; new spend $0.
