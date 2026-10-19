# PHOENIX Waves 7, 8 and 10: bounded local source guards

Date: 2026-10-19.
Truth class: **FIRST-PARTY DETERMINISTIC SOFTWARE DEMONSTRATION**, not provider-corroborated research, scientific discovery, production admission, or business revenue.

## Wave 7 #0002: Bibliographic identity reconciliation

Original source `PHOENIX_WAVE7_DISCOVERY_ENGINE_120_2026-10-17.json` pointer `/candidates/1`.
Original acceptance: "Import matching DOI, arXiv and title variants; one paper identity must keep distinct source records."

`src/phoenix-bibliographic-identity.mjs` reconciles bounded paper references using DOI/arXiv identifiers and normalized title hints. Conflicting DOI identifiers are not merged solely on identical titles. The result retains distinct original source IDs and source pointers and marks title-only bridges as tentative. It does NOT query Crossref, arXiv or external sources, and cannot independently certify an article's bibliographic identity. `paper-reconcile` is the CoS command.

## Wave 8 #0001: Immutable objective manifest

Original source `PHOENIX_WAVE8_UNKNOWN_WORLD_TRANSFER_160_2026-10-17.json` pointer `/candidates/0`.
Original acceptance: "Mutate evaluation spec after candidate commits; fail promotion."

The `src/phoenix-wave8-objective-guard.mjs` reuses the Wave 6 Ed25519 signed objective escrow. An agent-supplied post-candidate-commit objective modification yields `WAVE8_PROMOTION_HELD` and zero authority. Even a successful signer/objective match returns `canPromote:false`. Existence/provenance of the supplied commit SHA, independent signer trust, actual external task custodian and final promotion gate are **not** proven by this local function.

## Wave 10 #0001: Signal source authenticity

Original source `PHOENIX_WAVE10_AUTONOMOUS_POSSIBILITY_ENGINE_200_2026-10-17.json` pointer `/candidates/0`.
Original acceptance: "Reject an altered release note when original source digest changes."

`src/phoenix-source-authenticity.mjs` checks bounded original text against a supplied pinned SHA-256 digest, returning an explicit rejection when any release-note byte changes. It is only as trustworthy as the provenance of the **independently obtained** original digest; no signed external release provenance, commercial deployment or provider authentication is inferred. `source-verify` is the CoS command.

## Evidence and authority

Real local tests cover matching and conflicting identifiers, source retention, mutable evaluation objective refusal, no automatic promotion, original and tampered release note hashes, malformed inputs and real CoS direct function invocation. Source hashes are computed locally, not leased to a research supplier. No browsing, outbound sends, paid model generation, token handling, credential mutation or production code deployment was executed by these commands.

All 890 original founder ideas, 1,560 PHOENIX candidate records, 243 historical repository URLs (240 canonical research identities), unresolved Wave 1/2 source gaps, and previous negative evidence remain preserved. These tests establish specific proof atoms, **not** that 1,560 capability implementations exist.
