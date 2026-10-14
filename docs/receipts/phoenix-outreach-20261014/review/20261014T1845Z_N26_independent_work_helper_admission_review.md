# PHOENIX N26 | Independent Work continuity-helper source and live-target review | 2026-10-14 UTC

**Owner:** independent ChatGPT review. **Status:** SOURCE REVIEW COMPLETED; HELPER NOT ADMITTED OR DEPLOYED. **Priority:** highest, because original Render PostgreSQL Free expires **2026-10-16T23:22:29.055606Z**.

## Exact sources and live reads

- Work draft PR [#1409](https://github.com/mohammedwessam2007/uberbondd/pull/1409), inspected head `ea56c8f4c322d97858354297bb50c74b20673988`. Latest Work continuation report names scoped changes `78feacf99034a7060778df21a86bb7ee8ce7ef92` (`rescue.py` child env allowlist), `c65ea03a17196cffcc7880b31501ee9f460a147a` (`render.yaml` individual `fromService.envVarKey` for archive key), `727bc3090fde640da2fdde6fd274f349a674f529` (approval scope). Source directly fetched and inspected.
- `ops/phoenix-continuity-20261014/continuity.py` from PR #1409 and inherited `rescue.py`, `render.yaml`, `APPROVAL_SCOPE.md`, `Dockerfile`, `test_continuity.py` fetched independently. No source writes to that PR.
- Connected Render GET original PG `dpg-dali9dbl550s73bcf520-a`: AVAILABLE PostgreSQL 16 Free, expires as above, **external IP allowlist empty**. Existing older rescue helper `srv-db78ug59fdbs73da4mrg`: SUSPENDED; **new** continuity helper not in list of three services. No source SQL connection/read performed.
- Connected live Neon SQL on project `misty-moon-35132124`: `uberbond_render_rescue` public tables **57**; `uberbond_trident_rehearsal_20261013` public tables **57**; new intended `uberbond_phoenix_rehearsal_20261014_v2` public tables **0**, public relation objects **0**. No writes.
- On older 6-row rehearsal snapshot: **6/6 account rows contain object `data.tokens`; 6/6 token objects have exactly keys iv/tag/data**. Metadata-only SQL; no ciphertext, secret, key, address or account value retrieved. This matches `src/crypto.mjs` AES-256-GCM envelope *structure* and helper `compatible_tokens` input, **not proof that the current original key decrypts**.
- Official Render Blueprint reference `https://render.com/docs/blueprint-spec` explicitly documents `envVars[].fromService: {name,type,envVarKey}` references, including existing resources. This supports the **syntax mechanism**, not the actual existing helper/key resolution or fresh Plan Apply acceptance.

## Independent security/correctness verdict

**Source properties supported:** (1) executor requires exact unexpired approval, `RENDER_GIT_COMMIT` SHA match and disabled-by-default gate; (2) source connection is READ ONLY / REPEATABLE READ with `pg_export_snapshot` passed to `pg_dump`; (3) destination identity, schema emptiness and PG16 verified before mutation; (4) custom dump archive encrypted with AES-GCM and stored in existing archive database before isolated restore; (5) roundtrip archive hash plus target schema/row fingerprints and aggregate account-token decryption boolean designed; (6) `rescue.py:pg_environment` now explicitly whitelists child-process environment keys; (7) narrower exact `RESCUE_ARCHIVE_KEY` service-env reference replaces inherited full `fromGroup` custody request; (8) no code path intentionally sends mail, mutates source, changes customer deployment or cuts over DB.

**Important still-open controls before provider activation:**

1. **NO FRESH PROVIDER BLUEPRINT REVIEW.** Previous broader provider preview predates narrowed `render.yaml`. Re-preview exact current source at reviewed deployment SHA; independently verify selected Free plan, single helper, exact `fromDatabase` and two `fromService.envVarKey` references, existing helper actually exposes archive key and no unrelated secret access. Do NOT infer a provider preview from syntactically supported YAML.
2. **ACTION-TIME ACCESS APPROVAL** needed for binding source DB and original production key to a NEW service. Approve only after scoped preview and independent security decision; never expose values through browser/tool logs. Keep gate OFF during initial creation.
3. **CURRENT SOURCE SNAPSHOT NOT CAPTURED.** Six-account/two-snapshot Neon reads are historical; current source writers, post-snapshot deltas and original-key application boot remain unknown. This review cannot substitute for original source snapshot/restore.
4. **TOKEN COVERAGE ACCEPTANCE.** `continuity.py` decrypts `accounts.data->'tokens'` for rows `WHERE data ? 'tokens'`. It does not itself prove all accounts *requiring* encrypted tokens are included; compare safe total vs matching-token counts and expected role types on the actual source. In historical rehearsal 6/6 satisfy this condition; newer source must be checked. Do not expand aggregate compatibility `true` into 'all application secrets usable' or decryptability of 50 unimported Startup accounts.
5. **SEQUENCES ARE NON-MVCC.** `r.sequence_states` reads `last_value` separately, and sequence values can advance during snapshot capture/restore. A difference must be reported as a difference, not automatically rewritten, ignored or used to claim continuous replication.
6. **HEALTH ENDPOINT ≠ BACKUP COMPLETE.** Inherited `rescue.Health.do_GET` always serves constant HTTP 200. Require an authenticated provider log receipt and independently checked archive/restore SQL; do not interpret healthy web service as successful job.
7. **RESTART / ONCE GATE.** `continuity.py` starts the job at process boot when exact env gate remains enabled, rather than possessing a durable one-shot 'already succeeded' receipt gate. Nonempty destination usually prevents duplicate restore, but restart after interruption can yield ambiguous state; once the scoped attempt finishes, explicitly disable gate and suspend/remove helper access. Preserve all prior artifacts. Do not auto-replay uncertain result.
8. **APPLICATION CONTINUITY DISTINCT.** Source snapshot + isolated restore + original-key boolean are not an application boot, 50-Startup account import, latest writer reconciliation, one-writer cutover or production-safe rollback.

**Admission:** technical source design is promising and specific; narrowed references are supported *in documentation*. **NO unconditional security admission**, no new helper deployment, no key/access grant and no original-key verification. Next action is exact narrowed native Blueprint preview and owner-scoped access decision after independent security review. No unapproved wider credentials, no `0.0.0.0/0`, no expenses or destructive operation.

## Other live release updates verified independently

- Refreshed latest Claude #1405 head `f5320d7c83a84e8c5c08c93abe79becef782090b`: focused outbound workflow `38615465783` SUCCESS; Postal `38615465665` SUCCESS; full CI `38615465807` FAILED, Night `38615465625` FAILED. Deterministic CI job `116029300730` actual **11,059 tests / 10,994 pass / one stale canon failure / 64 skip**, where the current state and readiness files still describe `aeba82fc`, now **14 source files changed since**. Real PG/browser jobs passed. Claude owns final `npm run readiness` after source freeze.
- High stacked N08 PR [#1410](https://github.com/mohammedwessam2007/uberbondd/pull/1410) source tests historically **389/389** focused passing, but full CI earlier found fixture stubs lacking `count`/IDs: see Claude PR comments `6175235796`. Latest combined head/merge-ref must be re-tested before release.
- **Source changes are not production deployment**, and current sender authority remains NONE; no campaign sends or provider effects occurred in this independent review.

## PHOENIX DONE / LEFT

**WE HAVE DONE:** independently fetched and reviewed Work helper source, checked live Render source status, Neon destination emptiness and older account envelope shape, verified official Render reference syntax, isolated exact current Claude CI failure and GitHub source heads. All read-only.
**VERIFIED BY:** this immutable source-linked receipt and connected metadata/SQL reads; exact public IDs above.
**WHAT IS LEFT:** N26 narrow provider preview, scoped owner approval, fresh encrypted backup, isolated restoration/key boolean and app/continuity proof; N24 source-green exact CI; N08 stacked integration and all unsatisfied external Winnr/receiver/consent gates.
**SAFETY:** zero new fees/sends/provider writes/production DB reads or cutovers; review only.
**NEXT:** coordinate provider-native source admission with Work and final CI readiness with Claude/High, keeping their separate branch ownership.
