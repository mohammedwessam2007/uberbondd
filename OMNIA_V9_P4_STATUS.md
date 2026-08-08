# OMNIA V9 P4 STATUS

## Scope

P4 integrates V9 at one real consequential boundary in shadow mode only: the outbound email path after UberBond has durably reserved the send and marked the reservation `dispatching`, immediately before Gmail dispatch.

## Implemented

- `src/omnia-v9/final-admission-shadow.mjs`
  - builds a content-bound observation context for the exact outbound action;
  - hashes subject/body/evidence excerpt rather than copying message content into the audit record;
  - marks every observation `authoritative: false` and `enforced: false`;
  - normalizes unknown shadow decisions to `REVIEW`;
  - converts observer failures to `SHADOW_ERROR` + `REVIEW`;
  - logs observations best-effort without changing legacy behavior.
- `src/pipeline.mjs`
  - invokes the P4 observer only after the durable reservation is marked `dispatching`;
  - invokes it before Gmail dispatch;
  - never branches legacy send behavior on the shadow result.
- `tests/omnia-v9-outbound-shadow.test.mjs`
  - verifies the action payload is digest-bound;
  - verifies shadow is explicitly non-authoritative;
  - verifies durable reservation state is `dispatching` when shadow runs;
  - verifies ordering `shadow -> Gmail`;
  - verifies a shadow `DENY` cannot block, alter or duplicate the legacy send;
  - verifies a shadow exception degrades to `REVIEW` and Gmail still sends exactly once.
- `package.json`
  - adds P4 to deterministic V9 tests and syntax checking.

## Non-claims

P4 is not an authorization control. It does not enforce V9, does not consume P1 bounded authority, does not require P2/P3 verification before legacy send, and does not change production provider behavior.

A shadow `ALLOW` is not permission. A shadow `DENY` is not a block. A shadow exception is not a send failure.

## Verification truth

The current connector-only environment does not contain a mounted clone of `mohammedwessam2007/uberbondd`, so the P4 Node test file has not been executed locally in this chat. GitHub Actions remains unable to start repository runners because of the previously observed billing lock. P4 therefore remains **IMPLEMENTED / NOT INDEPENDENTLY EXECUTED** rather than being called green without a runner.

## Gates before enforcement

1. Execute P0-P4 tests in a repo-capable Node environment.
2. Unlock GitHub Actions or equivalent CI and require clean deterministic runs.
3. Finish P1 database verification, including a true multi-connection PostgreSQL concurrency test.
4. Execute P2 exact-byte constitutional binding over the real normative source set.
5. Pin Cedar with an npm-generated lockfile and require `P3_POLICY_VERIFIED` against the actual engine.
6. Replace the P4 comparison hook with a resolver that consumes only verified P1/P2/P3 proof objects.
7. Add an explicit enforcement-mode configuration whose default is OFF and whose transition requires owner approval plus regression evidence.
8. Only then consider making V9 final admission authoritative for the outbound side effect.

## Invariant

P4 exists to collect reality at the consequence boundary before V9 is trusted to govern it. Observation comes before authority.
