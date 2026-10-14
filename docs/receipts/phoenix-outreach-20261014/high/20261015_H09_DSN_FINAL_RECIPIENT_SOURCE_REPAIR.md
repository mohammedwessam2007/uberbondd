# PHOENIX H09 | fail closed on forged delivery-status report with mismatched recipient

Review-only independent High branch starting from Claude #1405 SHA f5320d7c83a84e8c5c08c93abe79becef782090b. Original Claude branch unchanged.

**WE HAVE DONE:** Parse only bounded machine-readable `message/delivery-status` report part for `Final-Recipient`, `Action`, and enhanced `Status`; pass parsed fields to IMAP reply pipeline; require exact single recipient match against original outbound message `to` plus `Action: failed` and permanent 5.x.x status before treating any machine delivery report as a trusted outbound hard bounce. Bare mailer-daemon sender/message-ID no longer charges health. Mismatches, missing recipient and transient/delivered status route to existing operator unlinked queue. Retain multi-ID ambiguity and actual 5.1.1 matched DSN control. Do not claim cryptographic DSN authenticity; this closes the disclosed *cross-recipient attribution* gap only.

**TESTS:** New synthetic parsed-structure and negative attribution cases added to existing `tests/inbound-review-hostile.test.mjs`; existing valid DSN behavior kept, one old permissive "plain mailer-daemon" test changed to fail-closed expected review behavior. Hosted focused test pending at this initial source commit, no green claim yet.

**WHAT IS LEFT:** Real authenticated sender/provider DSN transport trust, current Winnr 53 mailbox IMAP evidence and final current production/merge-ref integration. N26 production source rescue by Oct 16 23:22:29Z not influenced. Zero sends, provider changes, DNS, charges, production deploy or key use.
