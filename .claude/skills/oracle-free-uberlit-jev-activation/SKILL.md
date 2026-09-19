---
name: oracle-free-uberlit-jev-activation
description: Finish UberBond's zero-new-spend Oracle Always Free ARM64 -> UberCel -> UberLit -> Jev activation. Use when the founder asks to set up, finish, activate, or make the sovereign Jev runtime ready. Cowork should execute all reversible work and stop only for owner authentication, legal/terms acceptance, secure secret entry, or any non-zero spend.
---

# Oracle Free → UberCel → UberLit → Jev live activation

This is a **live activation skill**, not an architecture exercise.

## Mission outcome

Reach a truthful terminal state:

`ORACLE_FREE_HOST_LIVE -> UBERLIT_HEALTHY -> TYPESAFE_SECRET_PRESENT -> JEV_LIVE_SHADOW_READY`

Do not report 100% until the exact live receipts exist.

## Startup

1. Obey root `CLAUDE.md`, `AGENTS.md`, current handoff, canon, and Task Observer.
2. Refresh `main`; never rely on remembered commit hashes.
3. Confirm these current source surfaces exist:
   - `ops/sovereign/bootstrap-oracle-always-free-air-node.sh`
   - `ops/sovereign/store-typesafe-key-interactive.sh`
   - `ops/sovereign/complete-live-jev-activation.sh`
   - `scripts/uberlit-runtime-doctor.mjs`
   - `artifacts/oracle-free-uberlit/verification-20260919.json`
4. Run `npm run test:oracle-free` and `npm run test:jev` when the local Cowork environment supports the needed dependencies. Record actual results; never turn environment non-execution into a pass.

## Cowork execution authority for this mission

The founder explicitly authorized Cowork to carry the **routine setup** to completion.

Cowork MAY:
- use the selected UberBond workspace;
- use its browser/Claude-in-Chrome surface for Oracle, Tailscale and TypeSafe setup;
- fill reversible forms;
- choose only the exact zero-cost Oracle configuration below;
- use Oracle Cloud Shell / SSH / terminal to run the repository bootstrap;
- run local verification and health checks;
- continue automatically after an owner gate is satisfied;
- capture non-secret receipts and exact failure evidence.

Cowork MUST NOT:
- accept terms, legal agreements, KYC, identity verification or payment commitments for the founder;
- enter passwords, 2FA codes or payment details on the founder's behalf;
- create any resource showing a non-zero price;
- upgrade Oracle to paid merely to get capacity;
- bypass regional/provider restrictions;
- reveal, paste into chat, log, commit or place a TypeSafe key in argv;
- broaden Jev beyond shadow mode or consequence authority;
- silently weaken a verifier because infrastructure is inconvenient.

## Oracle target

Use current Oracle official Always Free eligibility, not remembered limits.

Current expected target, to be rechecked in the Oracle Console:
- home region only;
- shape: `VM.Standard.A1.Flex`;
- Ubuntu Always Free-eligible ARM64 image;
- **2 OCPUs total**;
- **12 GB RAM total**;
- default persistent boot volume, within the tenancy's Always Free block-storage allowance;
- UI must identify the selected resources as Always Free eligible / estimated incremental cost $0.

Official reference:
`https://docs.oracle.com/en-us/iaas/Content/FreeTier/freetier_topic-Always_Free_Resources.htm`

If Oracle reports out-of-host-capacity, try another availability domain in the **same home region** when supported. Do not switch to paid compute.

### Owner Gate O1 — Oracle authentication / account terms

Navigate to Oracle Cloud and do everything possible until login, 2FA, account creation, legal terms, payment-card verification, or equivalent owner-only authentication is required.

Then ask for only the exact action currently visible.

After the founder completes it, continue without re-explaining the mission.

## Host bootstrap

Once the Always Free A1 instance exists:

1. Obtain a legitimate management shell using the Oracle console/Cloud Shell/SSH route available to the authenticated account.
2. Do not expose UberLit application ports publicly.
3. Run the canonical repository bootstrap from the current `main` checkout:
   `sudo ops/sovereign/bootstrap-oracle-always-free-air-node.sh main`
4. The script intentionally stops if Tailscale is not authenticated.

### Owner Gate O2 — Tailscale

When `tailscale up` presents the authorization URL, open it for the founder.

The founder completes account authentication/approval.

Rerun the same bootstrap. Do not replace the private tailnet with a public tunnel merely to avoid this gate.

## Admit the physical node into UberOcean

After UberLit health and Tailscale are live, while the Oracle Console still shows the instance as Always Free eligible / zero incremental cost:

1. Record that fresh browser observation on the host:
   `node /opt/uberlit/source/scripts/record-oracle-free-owner-evidence.mjs --always-free --incremental-cost-cents 0 --source-ref oracle-console:instance-details:always-free`
2. Admit the host using Oracle IMDSv2 + Tailscale + live UberLit health:
   `sudo -u uberlit UBERLIT_ROOT=/var/lib/uberlit/uberbond node /opt/uberlit/source/scripts/uberocean-admit-oracle-host.mjs`
3. Require receipt:
   `/var/lib/uberlit/uberbond/artifacts/uberocean-oracle-host-admission.json`
   with status `ORACLE_FREE_UBEROCEAN_HOST_ADMITTED`.

This admits one zero-cost physical host for UberLit/Jev. It does **not** fabricate UberCel production redundancy. The receipt must keep `ubercelSovereignDeploymentReady:false` until an independent failure-domain fallback is genuinely observed.

## TypeSafe/Jev activation

Before account creation or live use:
1. Recheck official TypeSafe pricing and terms.
2. If TypeSafe blocks the founder's geography/account or requires a prohibited workaround, STOP with evidence. Do not circumvent.
3. The current expected public price is `$0.042 / million input tokens`, output tokens free. Treat that as dated evidence, not eternal truth.
4. Update `/etc/uberlit/uberlit.env` pricing fields only from current official evidence.

### Owner Gate O3 — TypeSafe account / secret custody

Use the browser to take TypeSafe account setup as far as possible.

The founder personally handles login/2FA/terms and creates the API key.

**Never ask the founder to paste the key into Claude chat.**

On the UberLit host run:

`sudo bash /opt/uberlit/source/ops/sovereign/store-typesafe-key-interactive.sh`

Tell the founder to paste the key only into that hidden terminal prompt. The input must not echo.

## Final live activation

Before a billed provider call, verify whether the account has free/prepaid credit. If the canary could create a new charge, show the founder the hard ceiling: **$0.001 USD for the call** and obtain approval unless a prior explicit owner authorization for that exact spend exists.

Then run:

`sudo bash /opt/uberlit/source/ops/sovereign/complete-live-jev-activation.sh --authorize-max-usd 0.001`

The script must prove:
- protected TypeSafe key present;
- Jev enabled;
- pricing evidence <=30 days old;
- per-call ceiling <=$0.001;
- UberLit local HTTPS healthy;
- real Jev typed response observed;
- provider/model/latency/usage/cost receipt present;
- one synthetic shadow routing observation written;
- canonical route unchanged;
- business/external effect authority remains `NONE`.

## Terminal verification

Collect:
- `/var/lib/uberlit/uberbond/artifacts/system-one/jev-live-activation.json`
- live canary receipt;
- live shadow-route receipt;
- calibration doctor receipt;
- `systemctl is-active uberlit.service uberlit-tls-edge.service uberlit-worker.service`;
- local HTTPS `/api/health`;
- current source commit;
- UberOcean Oracle host-admission receipt;
- Oracle instance shape / RAM / persistent disk / Always Free evidence;
- Tailscale private reachability evidence.

Report **READY** only if the live activation receipt says `JEV_LIVE_SHADOW_READY` and the resident UberLit services are healthy.

Do not call zero real calibration outcomes "production-proven intelligence." Live readiness means the shadow substrate is usable; promotion still requires real task-class outcomes.
