# UberWarm2 seed-path adversarial review — 2026-10-14

Head reviewed: `2a36f22e`. Method: four independent attack agents, each finding then re-run by a separate verifier that had to reproduce the effect with fakes only (no network, no SMTP, no DNS, no database). Source of truth: the workflow journal `wf_7ac1a4ed-f96`, not reproduced here.

Credential-like canary text, email addresses and probe bodies from the verifier reasons are deliberately omitted. Only the claim title, severity and verdict are recorded.

## Confirmed by reproduction (32)

| # | Surface | Severity | Claim |
|---|---|---|---|
| 1 | approval-scope | MEDIUM | Approval expiry is authorized from the r |
| 2 | approval-scope | HIGH | SMTP bridge sendOwnedSeed sends with no |
| 3 | approval-scope | MEDIUM | Empty probe identity executes under an e |
| 4 | approval-scope | MEDIUM | Caller-supplied now controls approval ex |
| 5 | approval-scope | LOW | Approval expiry is evaluated once at ent |
| 6 | approval-scope | LOW | Probe identity is truncated to 250 chara |
| 7 | approval-scope | LOW | approval.probeId is read twice; accessor |
| 8 | approval-scope | LOW | Signed payload does not commit to severa |
| 9 | compile-integrity | MEDIUM | Naive permissionExpiresAt resolves in ho |
| 10 | compile-integrity | MEDIUM | Sender kill flags paused, quarantined an |
| 11 | compile-integrity | MEDIUM | Approval proof truncates probe IDs at 25 |
| 12 | compile-integrity | MEDIUM | A seed that is an alias of the sending m |
| 13 | compile-integrity | LOW | Probe-ID duplicate check compares raw va |
| 14 | compile-integrity | LOW | Clock guard accepts null, false and 0 as |
| 15 | compile-integrity | LOW | consentEvidenceRef is checked by truthin |
| 16 | compile-integrity | LOW | Unicode-invisible and comma or angle-bra |
| 17 | execution-gates | MEDIUM | Bridge ignores pause, terms revocation a |
| 18 | execution-gates | MEDIUM | Bridge sendOwnedSeed is an unclaimed eff |
| 19 | execution-gates | MEDIUM | Permission expiry and approval window ar |
| 20 | execution-gates | MEDIUM | probeId is unbounded free text that beco |
| 21 | execution-gates | LOW | Caller-supplied now sets the 45-minute w |
| 22 | execution-gates | LOW | A throwing property read on the transpor |
| 23 | execution-gates | LOW | Bridge checks String(body) and String(su |
| 24 | execution-gates | LOW | Same-inbox collision guard is literal: G |
| 25 | execution-gates | LOW | Execution does not re-establish compile |
| 26 | execution-gates | LOW | Compile can emit two ok rows with the sa |
| 27 | smtp-bridge | MEDIUM | Revocations after construction are not h |
| 28 | smtp-bridge | HIGH | sendOwnedSeed sends directly with no sto |
| 29 | smtp-bridge | LOW | Subject and body are validated after coe |
| 30 | smtp-bridge | MEDIUM | The probe ID is an unconstrained body ch |
| 31 | smtp-bridge | LOW | Raw errors escape sendOwnedSeed through |
| 32 | smtp-bridge | LOW | Bridge allowlist validation is weaker th |

## Not confirmed (8)

These were not confirmed as violations of a stated invariant. Several were reproduced as real effects but judged not to violate a claim. They are kept here so the decision is auditable.

| Surface | Claim | Verifier verdict |
|---|---|---|
| approval-scope | Transport authorization is self-declared | not confirmed |
| approval-scope | Verification key floor is length only | not confirmed |
| compile-integrity | Address-present rows ignore the email fi | not confirmed |
| compile-integrity | Plan window restarts at compile time and | not confirmed |
| execution-gates | Executor accepts a self-declared transpo | not confirmed |
| execution-gates | A pre-send bridge refusal is reported as | not confirmed |
| execution-gates | A claim result whose reservation key mis | not confirmed |
| smtp-bridge | messageId correlation is not verified or | not confirmed |

## Disposition

Not closed. The seed-path gap closure at `2a36f22e` is incomplete. Repair is tracked in the finish ledger (E-008). The production-caller count for the seed path was zero at review time, so none of these is reachable from a running route, but the module is classified AWAITING_ACTIVATION and must not be activated until these are closed.
