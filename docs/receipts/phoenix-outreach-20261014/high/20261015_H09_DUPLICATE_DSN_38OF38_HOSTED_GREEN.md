# PHOENIX High H09 | duplicate machine evidence safety closure

## WE HAVE DONE
- Reviewed current H02 donor PR #1433 exact code ancestor `4071fe42fce2abccbeb3c0234d6323b86677281f` and detected an unguarded deduplication of identical DSN Final-Recipient / Action / Status claims in the same machine-readable delivery-status MIME part.
- Fixed `src/uberimap.mjs` to preserve original occurrence multiplicity (bounded to 20), not collapse repeated identical DSN claims with `Set`. Existing exact-one checks in `src/pipeline.mjs` now refuse uncertain duplicated machine evidence before sender hard-bounce effects.
- Extended hostile synthetic `tests/inbound-review-hostile.test.mjs` to verify four scenarios: duplicated exact recipient, action, status, entire recipient claim triplet. Every scenario must retain held buyer status and zero automatic bounce/suppression/sender-health side effects.
- Added read-only, no-provider `.github/workflows/phoenix-master-h09-duplicate-dsn.yml` and opened separate draft [PR #1436](https://github.com/mohammedwessam2007/uberbondd/pull/1436). Claude, H01 and H02 original branches unmodified.

## VERIFIED
- Initial source/test commit: `afddc198f054f5e896eaec3d1c8f4a4bad3a7b69`. Initial hosted [run 38658077807](https://github.com/mohammedwessam2007/uberbondd/actions/runs/38658077807) failed only the NEW negative test due accidental double-escaped CRLF in synthetic fixture. Source fix unchanged; the test fixture was corrected in commit `d8cbe48dc2e6f1b3b793b9067cbe647e3d9399dc`, source/test fetched back verbatim.
- Exact-source [hosted run 38658130502](https://github.com/mohammedwessam2007/uberbondd/actions/runs/38658130502), [job 116172668608](https://github.com/mohammedwessam2007/uberbondd/actions/runs/38658130502/job/116172668608) status **COMPLETED SUCCESS** at `d8cbe48dc2e6f1b3b793b9067cbe647e3d9399dc`. Checkout, npm ci, both JS parser checks and **38/38 inbound/Reply Radar tests PASS, 0 fail, 0 skip**.
- No real SMTP or IMAP side effects were invoked by this synthetic workflow.

## WHAT IS LEFT
Independent reviewed H01 merge arbitration and comprehensive source CI/Night on final ancestry; protected Render original PG16 source-current backup and encryption key validation before 2026-10-16T23:22:29Z; isolated Neon current restore/app boot/writer delta; Winnr real 50+3 import and actual authenticated sender/recipient/terms/approval before any campaign; accepted customer work/cleared receipts remain separate.

## NEXT
Run exact combined checks where authorized, integrate only after independent review and no conflict with newer upstream donor. Continue from issue #1188 newest checkpoint. **SAFETY:** no live send, paid commitment, account/network change, original key exposure, deploy, merge to main or cutover; SEND_SET=[].
