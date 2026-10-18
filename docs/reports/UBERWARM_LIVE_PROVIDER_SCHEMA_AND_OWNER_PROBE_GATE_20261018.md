# UberWarm verified Winnr mailbox schema and remaining owner-probe gate

Date: 18 October 2026. This is an engineering receipt, **not** approval to send email or a claim of Inbox placement.

## WE HAVE DONE

- Recovered main `57a121736acb1fa87e52e1ca76be9175b1bdc90f` and connected Chat On Steroids long enough to test in a new isolated worktree without changing the other agents' dirty checkout.
- Real Winnr mailbox rows include identity, `status=active`, but no `connected`, `paused`, `quarantined`, `placementQuarantine` or `policyCompatible` booleans. The strict old provider-health adapter withheld all such rows, so HTTPS sender preflight was structurally unable to pass.
- Added a separate provider **identity-only** reader for the explicitly selected Winnr HTTPS transport. It requires a live exact unique active identity and refuses explicit adverse flags. It never claims that a missing vendor flag is false.
- A status-only identity can pass the trusted sender-health supplier **only with a separate independently trusted, current, signed and verified local hold/risk receipt** proving held/suppressed/paused/quarantined/placementQuarantine all false and policyCompatible true. The old strict provider flag path stays available.
- The existing current signed HTTPS transport, provider DNS readiness, independent DNS alignment, recipient-specific consent, immutable owner approval and one-shot PostgreSQL send reservation are unchanged requirements. No autonomous mail-sending code is added.

## VERIFIED SOURCE TESTS

- Isolated Codespace locked `npm ci --ignore-scripts --no-audit --no-fund` passed.
- Source `node --check` and `git diff --check` passed.
- `node --test tests/uberwarm2-*.test.mjs`: **224 tests total, 222 pass, zero fail, two skipped**, including real embedded PostgreSQL tests.
- Integration composition test directly passes sender health on Winnr's real status-only schema only when a trusted independent signed hold is supplied. It denies consent and send authority, and a subsequent quarantine change refuses sender health. Hosted source/CI checks must still run on the exact GitHub integration SHA.
- The previously operating Railway Hobby `uberwarm-runtime` correctly monitored 53 mailboxes/11 domains, authenticated read-only IMAP and PostgreSQL ledger with `WRITE_REPORTED` token scope, but `sends=0` and `probeConsentEstablished=false`. Historical delivery is not a new Inbox receipt.

## WHAT IS LEFT / BLOCKER

- Release this exact source through GitHub checks and normal merge, then confirm the deployed exact-source Railway monitor remains healthy.
- The existing private Winnr token already reports READ+WRITE. It **does not** certify current sender-specific local holds or independently signed DNS/HTTPS transport health. Those still need real authenticated sources.
- The owned receiver is authenticated but **exact recipient-specific signed opt-in and unexpired owner approval for one immutable probe remain unobserved**.
- Only after those observations: execute one HTTPS send with atomic PostgreSQL claim, preserve provider Message-ID, confirm independently matched Inbox/Spam outcome through real IMAP. Do not blindly resend an unknown result.

## NEXT / SAFETY

Keep `SEND_SET=[]` and the existing read-only monitor running. No purchase, paid Winnr warming add-on, prospect message, DNS or secret change, deployment or source merge is implied by this receipt. Preserve PHOENIX and the full founder 890 corpus.
