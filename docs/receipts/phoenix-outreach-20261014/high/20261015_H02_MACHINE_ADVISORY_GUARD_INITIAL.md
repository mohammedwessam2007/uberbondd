# H02/H04 advisory-machine boundary - isolated safety patch

**Base:** H01+H04 exact full green donor d6212ed36e960672e80ac4c4f61e03c7ba4140f7, independently owned new branch `high/phoenix-h02-inbound-machine-advisory-20261015` only.

**WE HAVE DONE:** Reviewed `src/inbound-classify.mjs` classification precedence and `src/inbound-feedback-kernel.mjs` local recommendation mapping. An auto-submitted machine response quoting unsubscribe/complaint could be promoted to HUMAN complaint/optout recommendation before the classifier evaluated the Auto-Submitted header. Added fail-closed early machine advisory precedence AFTER structurally recognized DSN, and before text-derived human categories. Machine-generated feedback reports are UNKNOWN requiring attribution; ordinary autoresponders OUT-OF-OFFICE; explicit Auto-Submitted:no remains eligible for human classification. Introduced FIVE hostile tests for human-vs-machine text, Arabic language, local intent authority, and unchanged protective DSN.

**VERIFIED BEFORE HOSTED EXECUTION:** Exact changed source/test/workflow staged in isolated commit; no test pass yet claimed. A dedicated GitHub Action performs real synthetic suites plus official system-readiness/constitution generators and validates freshness, then commits only generated canonical artifacts. Workflow has no provider secrets or external effects.

**WHAT IS LEFT:** Read hosted job verdict and source/artifact SHA; then run full release CI/Night if code is considered for integration. Actual source Render PG continuity, Winnr real import, send consent/payment remain separate. No automatic suppression execution authority granted.

**NEXT:** Verify tests and reconcile into release only after independent review.

**SAFETY:** SEND_SET=[]; no contact, spending, DNS/allowlist edits, prod DB writes, secret access, release merge/deployment.
