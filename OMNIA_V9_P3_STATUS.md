# OMNIA V9 P3 — Traceable Cedar Policy Projection

Status: **IMPLEMENTED ON STACKED BRANCH; POLICY/BUNDLE TESTS ADDED; REAL CEDAR RUNTIME VERIFICATION CURRENTLY INCOMPLETE**

P3 builds on P2. It does not claim that Cedar executes the full UberBond constitution and it still does not control a production side effect.

## What P3 establishes

The executable policy layer is a deliberately small projection of exact constitutional law, not a replacement constitution.

The first projection contains only three rules:

1. unresolved critical admission state fails closed;
2. learning-originated sovereignty expansion is forbidden;
3. only the fully resolved non-sovereignty remainder can be permitted, with Cedar default-deny still authoritative.

There are no AI confidence scores, weighted heuristics, supplier rankings, or model judgments inside this policy.

## Source provenance

Every projected rule must include:

- constitutional source role;
- literal source anchor;
- source document path;
- exact source document SHA-256;
- anchor SHA-256;
- mechanization SHA-256.

`buildPolicyBundle()` refuses to create a policy digest unless the literal anchor is present in the exact source text for the claimed constitutional role.

This prevents "provenance by label" where a policy merely claims to come from the constitution.

## Cedar runtime contract verified from the official Cedar examples project

The official `cedar-policy/cedar-examples` TypeScript/WASM example uses:

```js
import * as cedar from '@cedar-policy/cedar-wasm/nodejs';
```

and exposes:

- `checkParseSchema`;
- `checkParsePolicySet`;
- `validate` with strict mode;
- `isAuthorized`;
- `getCedarVersion`.

The official example package on the inspected `release/4.12.x` branch declares `@cedar-policy/cedar-wasm` version `4.1.0`.

P3 does **not** assume package version and engine version are identical. The production policy digest must bind:

- exact installed npm package version;
- exact runtime-reported Cedar engine version from `getCedarVersion()`;
- exact import path;
- schema bytes;
- policy bytes;
- projection bytes;
- P2 constitution/source-set digests;
- constitutional traceability records.

## Files

- `config/omnia-v9/policy-projection.json`
- `policy/omnia-v9/schema.json`
- `policy/omnia-v9/authorization.cedar`
- `src/omnia-v9/policy-bundle.mjs`
- `src/omnia-v9/cedar-adapter.mjs`
- `tests/omnia-v9-policy.test.mjs`
- `scripts/verify-v9-p3.mjs`

## Adapter behavior

`validateCedarPolicy()` fails closed unless:

1. the expected Cedar WASM module contract exists;
2. the runtime reports a Cedar engine version;
3. the JSON schema parses;
4. the Cedar policy set parses;
5. strict validation executes successfully;
6. strict validation reports zero errors.

`authorizeWithCedar()` denies when:

- resolver facts are missing or malformed;
- policy was not validated;
- actor/resource identity is incomplete;
- actor/resource tenant differs;
- Cedar throws;
- Cedar evaluation fails;
- Cedar returns Deny;
- Cedar reports diagnostic errors even alongside Allow.

## P3 unit/adversarial test contract

The branch contains **20 materially distinct policy/boundary tests** covering:

1. policy bundle binds constitution, policy, schema, projection and evaluator;
2. policy byte drift changes policy digest;
3. schema byte drift changes policy digest;
4. Cedar runtime engine-version drift changes policy digest;
5. projection cannot claim to be the full constitution;
6. missing constitutional role is rejected;
7. source anchor absent from exact source text is rejected;
8. duplicate projection rule IDs are rejected;
9. missing Cedar runtime version function rejects the module;
10. runtime identity binds package and engine versions;
11. schema parse failure blocks policy;
12. policy parse failure blocks policy;
13. strict validation errors block policy;
14. fully resolved non-sovereignty case can Allow;
15. unresolved authority Denies;
16. unresolved evidence Denies;
17. learning-originated sovereignty expansion Denies;
18. cross-tenant actor/resource Denies before Cedar;
19. Cedar evaluation exception Denies;
20. Cedar Allow with diagnostic errors still Denies.

These tests use a deterministic fake Cedar module to test the adapter/bundle contract. They do not substitute for running the real Cedar engine.

## Graded real verifier

`scripts/verify-v9-p3.mjs` must:

1. bind the real P2 constitution from exact repository files;
2. load the actual `@cedar-policy/cedar-wasm/nodejs` runtime;
3. resolve exact installed npm package version;
4. obtain runtime engine version from `getCedarVersion()`;
5. bind the real policy bundle;
6. parse the real schema;
7. parse the real policy;
8. run Cedar strict validation;
9. execute direct authorization probes for resolved Allow, unresolved authority/evidence/constitution Deny, and learning-sovereignty Deny.

Only then may it output `P3_POLICY_VERIFIED`.

If the exact Cedar runtime is unavailable, it returns **INCOMPLETE**. Missing runtime verification never becomes PASS.

## Why Cedar is not added to package.json yet

The current sandbox cannot reliably install new npm packages or regenerate the repository lockfile from the real registry. Hand-editing `package.json` without a matching npm-generated `package-lock.json` would break reproducibility and could break `npm ci`.

Therefore P3 includes the adapter, policy, schema, traceability bundle, tests and graded verifier, but deliberately leaves the Cedar dependency unpinned until a valid npm environment can run something equivalent to:

```bash
npm install --save-exact @cedar-policy/cedar-wasm@<selected-version>
```

and commit the resulting package + lockfile change together.

The inspected official example's `4.1.0` is evidence for the integration shape, not permission to hand-invent UberBond's lockfile.

## Remaining gates before P3 can govern action

1. Execute the 20 policy tests in a repo-capable Node environment.
2. Pin Cedar with a real npm-generated lockfile.
3. Execute `npm run verify:v9:p2` and obtain the real constitution digest.
4. Execute `npm run verify:v9:p3` against the actual Cedar engine and require `P3_POLICY_VERIFIED`.
5. Review Cedar schema/action semantics against the installed version; no schema compatibility is assumed until the real parser accepts it.
6. Add a policy-coverage ledger showing which constitutional rules are executable, monitored, human-only, deferred or non-machine-enforceable.
7. Connect P0 `policyAuthorizer` to this verified policy bundle only after those gates pass.

## Design law added by P3

**Executable policy is a traceable projection of law, not law itself. No policy rule exists without an exact constitutional source anchor, and no Cedar Allow exists without a strictly validated, version-bound policy engine.**
