# UberWarm inbound reply/STOP hold extension, 2026-10-20

**Scope:** Source-side fail-closed health extension, **not yet verified deployed**.

Winnr's `email.received` webhook contains message metadata but **not the body**, so the receiver deliberately records every such event as `REPLY_REQUIRES_REVIEW` instead of falsely pretending it identified a STOP intent. The existing API inbox (read-only) does return bodies. Its latest 100-message scan identified **zero explicit STOP/opt-out candidates**, without exposing mailbox content or suppressing uncorrelated correspondents.

The direct canonical Neon receiver code now counts rows awaiting reply review (`pendingReplyReviewCount`) and the egress ingress-fence holds if the health observation omits this count or if it is positive. This prevents an unseen reply that could be an opt-out from being interpreted as a clear send. Canonical Neon independently queried on 2026-10-20: 0 `REPLY_REQUIRES_REVIEW` rows. No manual or automated reply suppression is claimed; actual body classification requires verified reply provenance and sender-outbound correlation, not just a keyword in an arbitrary message. Public permanent self-service unsubscribe already functions through Railway and its protected Neon mirror in PR #1511.

**Deployment boundary:** Source held in its own branch pending re-deployment of the existing Neon `uberwarminbound` function. Until the GET field is actually available in production, a caller using the new fence will HOLD. Never claim source code equals deployed STOP handling, and never use it to bypass the existing sender/recipient/campaign gates. Sender status remains provider-active, no authoritative no-hold verdict; no commercial messages or diagnostic owner mail have been sent.
