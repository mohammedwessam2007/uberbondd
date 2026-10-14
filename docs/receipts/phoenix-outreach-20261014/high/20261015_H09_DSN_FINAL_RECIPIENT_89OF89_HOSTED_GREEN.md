# PHOENIX H09 | permanent recipient-bound delivery failure evidence

**Observed:** 2026-10-14T22:49:41Z. Independent High patch, descendant of exact Claude PR #1405 source `f5320d7c83a84e8c5c08c93abe79becef782090b`. Claude and Work originals untouched.

## WE HAVE DONE
Repaired `src/uberimap.mjs` to extract bounded `Final-Recipient`, `Action`, `Status` claims **only from message/delivery-status MIME part**, never a person's text. Repaired `src/pipeline.mjs` to require one exact stored outbound recipient match plus permanent `failed`/5.x.x status, and original already-required unique Message-ID plus system-sender classification, before treating a DSN as a hard bounce. Unknown/mismatch/transient routes to the existing bounded owner unlinked queue, without automatically suppressing or pausing a sender. Test cases include mismatched recipient with valid stored message ID, missing recipient, delayed 4.x, falsely failed 4.x, delivered 2.x, ordinary plain mailer-daemon, plus genuine 5.1.1 sender/recipient matching. Important limitation: this is **cross-recipient and status validation, not cryptographic proof the DSN came from the receiving provider**.

## Hostile tests and failure lineage
Initial source commit `affba128771369353d33b15697b40fdf8b61a697` plus genuine CRLF fixture `f38c1ef90457e6080d6603445145f0c9636484ff` was run as [Actions 38650060775](https://github.com/mohammedwessam2007/uberbondd/actions/runs/38650060775), **88 pass, 1 failed**. The older `tests/winnr-reply-radar.test.mjs` genuine DSN fixture omitted original outbound message `to`, making the new fail-closed proof impossible; this was a legitimately incomplete test record, not permission to relax code. Commit `0a8441efd80fb6e60c7496892030b8f7f04b2328` aligned fixture with exact sent `to: buyer@clinic.test`.
Independent [hosted run 38650202543](https://github.com/mohammedwessam2007/uberbondd/actions/runs/38650202543), job 116146817843, exact source `0a8441efd80fb6e60c7496892030b8f7f04b2328` **SUCCESS, 89 tests, 89 PASS, 0 fail, 0 skip**. Real source parser, inbound hostile, IMAP and Winnr Reply Radar suites ran. The original 5.x matching real DSN fixture still passes.

## WHAT IS LEFT
Full whole-repo CI + H01 merge-ref integration with this patch have NOT been verified, so draft review only. Real provider send/receiver DSN authentication and 53 inboxes remain unverified; owner-legal-contact exact approval remains NONE. N26 Render Free source-current/key rescue Oct16 23:22:29Z still needed. No production provider accounts, keys, DNS, charges, sends, or deployments used.

**Safety:** cold SEND_SET=[]; no external-effect authority. If a recorded actual outbound message lacks `to`, the DSN must stay unlinked for manual review rather than infer a recipient from mutable prospect state.
