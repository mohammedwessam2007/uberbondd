# PHOENIX H04 verified two-bug security repair

WE HAVE DONE: confirmed machine-generated unlinked unsubscribe caused suppression (red run 38652107216) and linked machine-generated unsubscribe was classified as a human optout (red run 38652916668). Fixed both on isolated H04 draft PR #1430.

VERIFIED: Second guarded repair run 38653156265 SUCCESS: 40/40 inbound tests and 8/8 freshness tests. Source-bound generated head 218d6f82893e4b5974b750487bc386179381bf59, pipeline blob 1b1d768aba5647abe379e2dea5baa1f8e38b92e7 and hostile-test blob a14db23a25e012f48eac6aa4f0afab166ce16283 independently fetched.

WHAT IS LEFT: complete CI on this newest repaired source, code review and one-shot workflow cleanup; Render original production database protected current backup/restore still unverified, Winrr real import/approved campaign not performed.

NEXT: inspect new CI. SAFETY: SEND_SET empty; no live effects.
