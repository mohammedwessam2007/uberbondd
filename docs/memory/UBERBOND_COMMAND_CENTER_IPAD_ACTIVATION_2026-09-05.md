# UberBond Command Center iPad Activation Checkpoint — 2026-09-05

Status: **DRAFT_BRANCH / LIVE PRIVATE PREVIEW AVAILABLE / EXACT-HEAD PROMOTION NOT YET VERIFIED**

Branch: `gpt/uberbond-battery-ignition-20260905`
North star: **risk-adjusted cleared contribution profit / founder minute**

## Owner directive

UberBond must expose its real company brain through an iPad-first command center and continuously improve that command center as part of the governed self-improvement loop. Visual sophistication is allowed to become increasingly cinematic and futuristic, but liveness, counts, activity and business state must never be fabricated for appearance.

The UI Evolution Loop is a product law:

`observe operator use -> propose UI/UX candidate -> sandbox/render/test -> compare current vs candidate -> promote only verified improvement -> retain rollback/evidence receipt`

UI evolution never widens merge, deployment, customer, payment, DNS, credential, spend or production authority on its own.

## Real command-center surface

The actual branch contains the iPad command center under:

- `public/uberbond.html`
- `public/uberbond.css`
- `public/uberbond.js`
- `api/command-center.mjs`
- `src/uberbond-command-center-status.mjs`

`vercel.json` rewrites `/uberbond` to `/uberbond.html`.

The shell exposes World Sensing, Feature Genome, GENESIS, the central Cognitive/Synaptic Organism map, Frontier Team, Compute Sovereignty, Self-Maintainer, Neural Activity and Truth Boundary. It carries iPad/mobile PWA metadata and refreshes real evidence state rather than running a demo-value fallback.

The command-center API is GET-only and protected by the existing `ADMIN_TOKEN` bearer boundary. Missing auth returns a refusal rather than public private state. The frontend stores the owner token only through the existing owner-console local-storage path and does not embed it in source or URL.

The source status compiler reads only fixed allowlisted receipts/sources. Its truth boundary is:

`DISPLAYED_COUNTS_AND_STATES_COME_FROM SOURCE_COMPILED_GRAPH_OR_FIXED_ALLOWLISTED_RECEIPTS. MISSING_STALE_OR_INVALID_EVIDENCE IS NEVER REPLACED WITH A DEMO VALUE.`

## GENESIS reactivation repair

A real deterministic Vercel execution found that GENESIS reactivation could give a positive score to an unrelated idea when semantic token overlap was zero because maturity/no-runtime-receipt priors could create score by themselves.

Repair commit:

`29afad79b2b48ccb4e1e3fb1804dec787803b050`

Policy: `uberbond-genesis-reactivation-1.0.1`

Current rule: maturity and runtime-receipt state can rank an already semantically matched idea, but cannot create a reactivation candidate with zero semantic overlap.

## Vercel function-bundle repair

The heavier `uberbondd` preview exposed a real configuration-schema error: `functions.api/command-center.mjs.includeFiles` was represented as an array even though Vercel expects a glob string.

Repair commit before this memory checkpoint:

`d368e5c88a7601b25e18f3f2a82ab1072dc7b916`

The current command-center include glob is:

`{config/frontier-model-candidates.json,artifacts/perpetual-frontier-implementation-ledger.json,artifacts/uberbond-*-latest.json,artifacts/cognitive/*-latest.json}`

## Verified private preview

Vercel team:
`team_A9LnjIuS5PU0rNetsHMu1N0r`

Private project:
`uberbondd-lite-private`

Project ID:
`prj_ZMfDCuUva2kdMv6HnqGvIE5vihTz`

Verified READY deployment:
`dpl_AHt6aBXcu1r9F6zoXpYCm97RxsHZ`

Deployment source commit:
`29afad79b2b48ccb4e1e3fb1804dec787803b050`

Deployment host:
`uberbondd-lite-private-bsdhirkkh-mohammedwessam2007s-projects.vercel.app`

Build evidence: Vercel cloned the exact PR #400 branch commit, completed the build, deployed outputs, and marked the deployment READY. This deployment is the direct parent of the subsequent Vercel configuration-only fix, not the latest branch head.

A temporary Vercel protected-preview access URL was generated specifically for `/uberbond`:

`https://uberbondd-lite-private-bsdhirkkh-mohammedwessam2007s-projects.vercel.app/uberbond?_vercel_share=SbyR8b1GRIZJnlJ3JqqXSo4ZlTxhyAOd`

Vercel reported that this share URL expires on 2026-09-06 at approximately 21:00 account-reported time.

## Truth about access verification

The preview is protected by Vercel Authentication. Vercel's connected fetch helper reached the deployment but returned the expected SSO redirect rather than persisting a browser share cookie. The local container could not independently follow the flow because DNS resolution for the Vercel preview hostname is unavailable in that environment. Therefore the READY deployment is verified, but an end-to-end rendered iPad browser session has not been falsely claimed as observed by the agent.

The stable production domain `https://uberbondd-lite-private.vercel.app/uberbond` returned `404 NOT_FOUND` at this checkpoint. Do not present that stable URL as the command center until a production promotion actually serves the route.

The private API also requires `ADMIN_TOKEN`. The available connector surface has not exposed environment-variable names, so configuration of that variable on this exact preview has not been independently proven in this checkpoint. Never remove the auth boundary merely to make the dashboard easier to open.

## Persistent UI truth laws

- sci-fi presentation may amplify comprehension, never fabricate liveness;
- unavailable evidence must look unavailable;
- stale evidence must look stale;
- model catalog presence must never look like runtime callability;
- Event Horizon allocation scores must never look like customer demand;
- internal GENESIS maturity must never look like commercial validation;
- no fake employees, fake events, fake revenue, fake payments, fake customers or fake progress animations presented as truth;
- the command center may visualize inference and hypotheses, but must label them separately from observed reality;
- every UI self-upgrade remains rollbackable and evidence-scored;
- capability never creates authority.
