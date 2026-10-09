# UberBond founding commit forensic review | July 14–17, 2026

Original main commit metadata from GitHub's exact `/commits/{sha}` endpoint, not later project recollection. Every changed filename from each of seven earliest main commits is preserved; additions/deletions are GitHub's diff statistics, not an attestation that all application behavior passed tests. Source patches remain available through the original commit links. This is a file-change inventory, not a line-by-line independent analysis of all 23,000 initial inserted lines.

## 2026-07-14T22:34:09Z | [229c2c85c3c2](https://github.com/mohammedwessam2007/uberbondd/commit/229c2c85c3c28179ce5bc3c4997f87b3ee67911b)

**Exact commit message:** Initial commit

**Diff statistics:** 1 changed files, 1 additions, 0 deletions.

| File | Status | Added | Deleted |
|---|---|---:|---:|
| `README.md` | added | 1 | 0 |

## 2026-07-14T23:11:13Z | [92c97c8ff231](https://github.com/mohammedwessam2007/uberbondd/commit/92c97c8ff231a741fe5ef7c2990a89d6d8c12c6c)

**Exact commit message:** Install verified UBERBOND LaunchReady application at repository root

**Diff statistics:** 149 changed files, 23261 additions, 1 deletions.

| File | Status | Added | Deleted |
|---|---|---:|---:|
| `.env.example` | added | 119 | 0 |
| `.github/workflows/ci.yml` | added | 37 | 0 |
| `.github/workflows/lite-audits.yml` | added | 47 | 0 |
| `.gitignore` | added | 6 | 0 |
| `ACTIVATE_OUTBOUND_IPAD.md` | added | 168 | 0 |
| `BEGINNER_SETUP.md` | added | 38 | 0 |
| `CHATGPT_FINAL_REVIEW_MISSION_1.md` | added | 72 | 0 |
| `CLAUDE_REVIEW_MISSION_1.md` | added | 30 | 0 |
| `CLAUDE_REVIEW_REPORT_MISSION_1.md` | added | 42 | 0 |
| `CONNECT_POSTGRES_IPAD.md` | added | 18 | 0 |
| `DEPLOY_CASH_ENGINE_LITE_IPAD.md` | added | 82 | 0 |
| `DEPLOY_CHECKLIST.md` | added | 68 | 0 |
| `DEPLOY_WEB_WORKER_IPAD.md` | added | 48 | 0 |
| `Dockerfile` | added | 8 | 0 |
| `ENVIRONMENT_VARIABLES.md` | added | 172 | 0 |
| `FINAL_AUDIT.md` | added | 82 | 0 |
| `FIRST_CUSTOMER_PLAYBOOK.md` | added | 95 | 0 |
| `LAUNCH_STATUS.md` | added | 86 | 0 |
| `LITE_ENV_CHECKLIST.md` | added | 37 | 0 |
| `MIGRATE_JSON_IPAD.md` | added | 12 | 0 |
| `MISSION_1_REPORT.md` | added | 54 | 0 |
| `MISSION_2A_REPORT.md` | added | 52 | 0 |
| `MISSION_2B_REPORT.md` | added | 76 | 0 |
| `MISSION_3_REPORT.md` | added | 97 | 0 |
| `NEXT_STEPS.md` | added | 41 | 0 |
| `ONE_AGENT_TONIGHT_LAUNCH_MISSION.md` | added | 319 | 0 |
| `OWNER_TAKEOVER_CARD.md` | added | 30 | 0 |
| `POLICY_BOUNDARIES.md` | added | 29 | 0 |
| `PROJECT_STATE.md` | added | 180 | 0 |
| `QA_REPORT.md` | added | 64 | 0 |
| `README.md` | modified | 270 | 1 |
| `REPOSITORY_HEALTH_REPORT.md` | added | 156 | 0 |
| `ROLLBACK_IPAD.md` | added | 10 | 0 |
| `START_HERE.md` | added | 45 | 0 |
| `START_HERE_IPAD.md` | added | 39 | 0 |
| `START_HERE_ZERO_CASH_IPAD.md` | added | 242 | 0 |
| `TESTING.md` | added | 86 | 0 |
| `TONIGHT_LAUNCH_STATUS.md` | added | 27 | 0 |
| `WORKER_RECOVERY_IPAD.md` | added | 35 | 0 |
| `data/db.sample.json` | added | 21 | 0 |
| `docs/ARCHITECTURE.md` | added | 116 | 0 |
| `docs/DEPLOY.md` | added | 50 | 0 |
| `docs/DISCOVERY.md` | added | 53 | 0 |
| `docs/LIMITATIONS.md` | added | 15 | 0 |
| `docs/PAYMENTS_LEMONSQUEEZY.md` | added | 64 | 0 |
| `docs/REVENUE_MODEL.md` | added | 127 | 0 |
| `docs/constitution/core-data-model-v1.md` | added | 3178 | 0 |
| `docs/constitution/decision-engine-v1.md` | added | 3146 | 0 |
| `docs/constitution/knowledge-graph-v1.md` | added | 1880 | 0 |
| `docs/constitution/learning-engine-v1.md` | added | 2786 | 0 |
| `lite/.env.example` | added | 16 | 0 |
| `lite/README.md` | added | 52 | 0 |
| `lite/api/health.mjs` | added | 34 | 0 |
| `lite/api/interest.mjs` | added | 69 | 0 |
| `lite/api/report.mjs` | added | 48 | 0 |
| `lite/api/request-audit.mjs` | added | 58 | 0 |
| `lite/lib/db.mjs` | added | 191 | 0 |
| `lite/lib/email.mjs` | added | 36 | 0 |
| `lite/lib/http.mjs` | added | 68 | 0 |
| `lite/lib/rate-limit.mjs` | added | 31 | 0 |
| `lite/lib/report.mjs` | added | 26 | 0 |
| `lite/lib/schema.mjs` | added | 47 | 0 |
| `lite/lib/security.mjs` | added | 56 | 0 |
| `lite/lib/tokens.mjs` | added | 15 | 0 |
| `lite/lib/validate.mjs` | added | 45 | 0 |
| `lite/migrations/lite_001.sql` | added | 43 | 0 |
| `lite/package-lock.json` | added | 164 | 0 |
| `lite/package.json` | added | 12 | 0 |
| `lite/public/index.html` | added | 54 | 0 |
| `lite/public/report.html` | added | 54 | 0 |
| `lite/public/report.js` | added | 130 | 0 |
| `lite/public/site.js` | added | 54 | 0 |
| `lite/public/styles.css` | added | 55 | 0 |
| `lite/vercel.json` | added | 31 | 0 |
| `lite/worker/run-audits.mjs` | added | 112 | 0 |
| `migrations/001_initial.sql` | added | 213 | 0 |
| `migrations/002_durable_queue.sql` | added | 49 | 0 |
| `migrations/003_shared_artifacts.sql` | added | 17 | 0 |
| `migrations/004_unattended_send_safety.sql` | added | 60 | 0 |
| `package-lock.json` | added | 398 | 0 |
| `package.json` | added | 43 | 0 |
| `public/admin.html` | added | 102 | 0 |
| `public/admin.js` | added | 72 | 0 |
| `public/icon.svg` | added | 7 | 0 |
| `public/index.html` | added | 81 | 0 |
| `public/manifest.webmanifest` | added | 9 | 0 |
| `public/report.html` | added | 13 | 0 |
| `public/report.js` | added | 33 | 0 |
| `public/site.js` | added | 13 | 0 |
| `public/styles.css` | added | 11 | 0 |
| `railway-worker.json` | added | 12 | 0 |
| `railway.json` | added | 5 | 0 |
| `render.yaml` | added | 71 | 0 |
| `sample-prospects.csv` | added | 2 | 0 |
| `scripts/discovery-smoke.mjs` | added | 59 | 0 |
| `scripts/import-json.mjs` | added | 37 | 0 |
| `scripts/integration-smoke.mjs` | added | 37 | 0 |
| `scripts/migrate.mjs` | added | 11 | 0 |
| `scripts/outbound-probes.mjs` | added | 62 | 0 |
| `scripts/outbound-safety-smoke.mjs` | added | 91 | 0 |
| `scripts/postgres-app-smoke.mjs` | added | 122 | 0 |
| `scripts/postgres-smoke.mjs` | added | 94 | 0 |
| `scripts/queue-smoke.mjs` | added | 79 | 0 |
| `scripts/review-probes.mjs` | added | 235 | 0 |
| `scripts/seed.mjs` | added | 26 | 0 |
| `scripts/separate-services-smoke.mjs` | added | 151 | 0 |
| `scripts/visual-qa.mjs` | added | 16 | 0 |
| `server.mjs` | added | 501 | 0 |
| `src/ai.mjs` | added | 40 | 0 |
| `src/artifacts.mjs` | added | 56 | 0 |
| `src/audit-rules.mjs` | added | 84 | 0 |
| `src/browser-crawler.mjs` | added | 161 | 0 |
| `src/config.mjs` | added | 146 | 0 |
| `src/contacts.mjs` | added | 34 | 0 |
| `src/copy.mjs` | added | 17 | 0 |
| `src/crypto.mjs` | added | 12 | 0 |
| `src/csv.mjs` | added | 20 | 0 |
| `src/discovery-runner.mjs` | added | 69 | 0 |
| `src/discovery.mjs` | added | 182 | 0 |
| `src/dossier.mjs` | added | 23 | 0 |
| `src/gmail.mjs` | added | 52 | 0 |
| `src/input.mjs` | added | 25 | 0 |
| `src/job-handlers.mjs` | added | 11 | 0 |
| `src/json-import.mjs` | added | 106 | 0 |
| `src/payments.mjs` | added | 37 | 0 |
| `src/pipeline.mjs` | added | 435 | 0 |
| `src/prospect-import.mjs` | added | 43 | 0 |
| `src/queue.mjs` | added | 188 | 0 |
| `src/revenue.mjs` | added | 341 | 0 |
| `src/robots.mjs` | added | 35 | 0 |
| `src/scheduler.mjs` | added | 35 | 0 |
| `src/security.mjs` | added | 54 | 0 |
| `src/send-safety.mjs` | added | 142 | 0 |
| `src/store.mjs` | added | 941 | 0 |
| `src/unsubscribe.mjs` | added | 41 | 0 |
| `src/utils.mjs` | added | 32 | 0 |
| `tests/browser.test.mjs` | added | 15 | 0 |
| `tests/core.test.mjs` | added | 40 | 0 |
| `tests/discovery.test.mjs` | added | 64 | 0 |
| `tests/input-config.test.mjs` | added | 50 | 0 |
| `tests/json-import.test.mjs` | added | 37 | 0 |
| `tests/lite-flow.test.mjs` | added | 153 | 0 |
| `tests/lite.test.mjs` | added | 280 | 0 |
| `tests/postgres-schema.test.mjs` | added | 107 | 0 |
| `tests/queue.test.mjs` | added | 101 | 0 |
| `tests/revenue.test.mjs` | added | 32 | 0 |
| `tests/send-safety.test.mjs` | added | 126 | 0 |
| `tests/store.test.mjs` | added | 60 | 0 |
| `worker.mjs` | added | 46 | 0 |

## 2026-07-15T13:26:19Z | [452e06f2655d](https://github.com/mohammedwessam2007/uberbondd/commit/452e06f2655dc516ba0a58fa4ffc924f49ec1c17)

**Exact commit message:** Install verified UBERBOND P0.1 launch repository

**Diff statistics:** 0 changed files, 0 additions, 0 deletions.

## 2026-07-15T16:33:16Z | [2d932f55b436](https://github.com/mohammedwessam2007/uberbondd/commit/2d932f55b4363140006623c065284fa0c2065068)

**Exact commit message:** Install verified UBERBOND P0.1 launch repository

**Diff statistics:** 24 changed files, 2036 additions, 351 deletions.

| File | Status | Added | Deleted |
|---|---|---:|---:|
| `LAUNCH_STATUS.md` | modified | 111 | 61 |
| `P0_1_ACCEPTANCE_REPAIR_REPORT.md` | added | 270 | 0 |
| `P0_IMPLEMENTATION_REPORT.md` | added | 240 | 0 |
| `PROJECT_STATE.md` | modified | 139 | 134 |
| `START_HERE_ZERO_CASH_IPAD.md` | modified | 22 | 13 |
| `lite/api/interest.mjs` | modified | 53 | 15 |
| `lite/api/report.mjs` | modified | 24 | 2 |
| `lite/api/request-audit.mjs` | modified | 11 | 5 |
| `lite/lib/db.mjs` | modified | 92 | 5 |
| `lite/lib/report.mjs` | modified | 262 | 21 |
| `lite/lib/schema.mjs` | modified | 13 | 0 |
| `lite/migrations/lite_001.sql` | modified | 13 | 0 |
| `lite/public/index.html` | modified | 5 | 5 |
| `lite/public/report.html` | modified | 19 | 3 |
| `lite/public/report.js` | modified | 122 | 46 |
| `lite/public/site.js` | modified | 17 | 1 |
| `lite/public/styles.css` | modified | 10 | 2 |
| `lite/worker/run-audits.mjs` | modified | 9 | 4 |
| `package.json` | modified | 2 | 2 |
| `src/audit-rules.mjs` | modified | 60 | 14 |
| `src/browser-crawler.mjs` | modified | 38 | 9 |
| `tests/browser.test.mjs` | modified | 3 | 3 |
| `tests/lite-p0.test.mjs` | added | 491 | 0 |
| `tests/lite.test.mjs` | modified | 10 | 6 |

## 2026-07-16T23:41:21Z | [fed6e84207a3](https://github.com/mohammedwessam2007/uberbondd/commit/fed6e84207a3e26e0caaf2ef35feee40f3e5b482)

**Exact commit message:** Add files via upload

**Diff statistics:** 1 changed files, 339 additions, 0 deletions.

| File | Status | Added | Deleted |
|---|---|---:|---:|
| `uberbond-lite-fix.patch` | added | 339 | 0 |

## 2026-07-16T23:55:03Z | [82451015f9d3](https://github.com/mohammedwessam2007/uberbondd/commit/82451015f9d39afd5849103c19e4f834d4b6aa2f)

**Exact commit message:** Diagnose Lite queue database handoff

**Diff statistics:** 6 changed files, 224 additions, 1 deletions.

| File | Status | Added | Deleted |
|---|---|---:|---:|
| `START_HERE_ZERO_CASH_IPAD.md` | modified | 17 | 0 |
| `lite/api/request-audit.mjs` | modified | 20 | 0 |
| `lite/lib/queue-diagnostics.mjs` | added | 100 | 0 |
| `lite/worker/run-audits.mjs` | modified | 11 | 0 |
| `package.json` | modified | 1 | 1 |
| `tests/lite-flow.test.mjs` | modified | 75 | 0 |

## 2026-07-17T00:09:02Z | [ba2b100ac57b](https://github.com/mohammedwessam2007/uberbondd/commit/ba2b100ac57b7cf0fd84532f6ea6770c6ebeed8a)

**Exact commit message:** Remove temporary patch file

**Diff statistics:** 1 changed files, 0 additions, 339 deletions.

| File | Status | Added | Deleted |
|---|---|---:|---:|
| `uberbond-lite-fix.patch` | removed | 0 | 339 |

