# PHOENIX OpenCode / DeepSeek / UberWarm execution checkpoint

Date: 2026-10-16 Africa/Cairo. SOURCE IMPLEMENTATION, NOT DEPLOYED.

## Recovered truth

- Current main refreshed through GitHub: `298bd585d3ba0cf1fe5cdc2f81a525eb67819608`.
- PR #1444 remains draft/open at exact donor `15ce412e4714abfa614b54d0583d7a9dc4920ffb`.
- Isolated branch: `deepseek/uberwarm-live-integration-20261016`. No edits to donor/main/recovery branches.
- Issue #1188 latest recovered checkpoint #6202649642 distinguishes historical 50 Startup SMTP + 50 IMAP authentication on ten domains from three pilots and current live state. Authentication run 38414405557 independently fetched: completed/success, source `9bd655f85b849fabcb6a331d91e45dfb797ee28b`. Aggregate auth is historical, not placement.
- Brain and context-universe ran on exact donor; 4,813 tracked files / 143,060,572 bytes addressable. This is not a claim that all file bodies or unseen chats were read. Sovereign hierarchy, all original 890 IDs, immutable corpus and GENESIS lineage remain unchanged.

## Executed free development setup

- Existing Work host: Node v24.19.0, npm 11.9.0, Git 2.51.1. No Codespace or billable infrastructure created.
- Official `npm install -g @opencode/cli` encountered EACCES at runtime-owned global bin. Same official package installed successfully with a writable task-local npm prefix.
- Executable verified: OpenCode **v2.0.30**.
- Actual CLI model listing included **`opencode/deepseek-v4.1-flash-free`**. Explicitly selected that identifier for every invocation; no paid substitute.
- Official pricing https://opencode.ai/v2/docs/console/models/ lists free input/output/cache for `deepseek-v4.1-flash-free`. Smoke invocation executed without authentication, subscription, payment or credits and returned correct JavaScript addition/result 5. Subsequent engineering JSONL receipts report cost 0.
- Installed runtime is task-host local, not a durable 24/7 cloud agent. `opencode.jsonc` preserves exact free model and bounded no-MCP/deny-default tool posture. CLI availability and provider promotion can change; future sessions must recheck.

## Actual engineering

- DeepSeek authored `tests/uberwarm2-pg-ledger-real.test.mjs` using existing ledger and `withDisposablePostgres`: duplicate concurrent reservation, sender cap, seed cap, racing finalization/fresh-pool observation, wrong database UTC day, cross-day rolling limits. Applied pending schema only inside disposable fixtures. No production database mutation.
- DeepSeek ran that exact test command. All six attempts failed at fixture initialization because this container cannot create/switch the unprivileged PostgreSQL OS user. Independent attempt of historical hostile PostgreSQL test reproduced the environment failure. No test skip was promoted to passing.
- Work added `createUberWarm2LivePreflight` in the existing SMTP seed bridge and five hostile tests. It binds the executor's existing callbacks to protected read suppliers, re-reads each call, rejects absent/duplicate/mismatched/stale/future observations, explicit holds, withdrawn/suppressed/expired/unscoped consent and unreadable clocks. No source is authenticated merely by passing a row; the protected runtime must supply trusted provider+hold reconciliation and authenticated opt-in registry readers.
- No production route, scheduler, automatic migration or reachability-gate release was added. Existing activation gate remains intact.
- Independently ran local executor/ledger/SMTP bridge/preflight/reachability subset: **95 passed, 0 failed, 0 skipped** before final review. Final exact-head hosted results to be appended after observation.
- Focused hosted workflow uses standard `ubuntu-latest`, read-only GitHub permission, no secrets/environment binding, no artifact/cache upload, dependencies without install scripts, synthetic addresses and disposable PostgreSQL only. Public repository standard runners are free per https://docs.github.com/en/billing/concepts/product-billing/github-actions . No paid larger runner or paid overage enabled.

## Winnr capability and custody

- Official API reference https://winnr.app/help/api-mcp/index.html confirms bearer-token API, read vs read/write tokens and hosted MCP https://mcp.winnr.app/mcp; official tool catalog https://winnr.app/mcp.html identifies account/usage/domain/DNS reads alongside consequential purchase/warming/mailbox/send operations.
- Existing `src/uberwinnr-adapter.mjs` already provides the REST adapter and explicit write gates. No duplicate client/key/account was created.
- No Winnr tools are callable in this chat. Browser https://app.winnr.app redirected to `/login`; current fleet/DNS/health cannot be attested from this session.
- Existing credential stayed in protected custody. It was not retrieved, displayed, supplied to OpenCode, exported, copied or committed. No remote MCP with unrestricted writes was attached.

## Residual operational gates / exact first-test route

1. Restore authenticated Winnr read access and reconcile CURRENT 50 Startup + 3 pilot identities, DNS, transport, holds/quarantine and no paid add-on. Existing owned private plugin need not be recreated. Never clear pilot ordinal 3 from historical auth alone.
2. Qualified protected runtime on reviewed release must bind original encryption key natively, encrypted SMTP account, trusted sender observations and authenticated owner-seed consent readers; apply pending SQL only with separate primary authorization after disposable proof. Production import/held app boot/single-writer continuity remain governed by issue #1188 and PR #1444, not this branch.
3. Exact immutable single-probe manifest + signed scope/template/batch/probe approval within 45 minutes -> existing executor with new preflight callbacks + authoritative PostgreSQL ledger + existing SMTP bridge -> independent recipient-provider Message-ID/Inbox/Spam observation. Missing proof holds at zero. Two Google accounts do not establish independent providers. No deployment, migration, key provisioning or mail send is authorized by this source checkpoint.

UberWarm3/4/5 require authentic independent receiving observations before reputation/receiver/capacity promotion. UberWarm6's zero-paid-addon economic comparison remains unchanged. Source/test evidence cannot create provider reputation, delivery, customer demand or cleared funds.

External effects: only authorized public research, package downloads, free model execution, GitHub branch/PR/checkpoint and isolated synthetic tests. Messages sent=0; paid add-ons=0; purchases=0; production DB writes=0; deployments=0; main merges=0. Task Observer: no skill mutation; environment failure retained as evidence rather than weakened verification.

## Independent verification and review follow-up

- Draft review PR: https://github.com/mohammedwessam2007/uberbondd/pull/1446 , stacked on #1444.
- First reviewed source `35c6520a23cd03c3f4e1bf4b97cfa6a1e6adfd22`: focused real-PostgreSQL job https://github.com/mohammedwessam2007/uberbondd/actions/runs/38813527095 SUCCESS. Independently fetched decoded job logs: **207 tests, 207 pass, 0 fail, 0 skipped**, including all six DeepSeek-authored concurrency/replay tests and historical hostile real-PG boundary case. UberOutbound exact-head also SUCCESS.
- Additional local UberWarm3–6 and preflight subset: 121 pass, 0 fail, 0 skipped. Counts overlap the hosted suite and must not be summed as unique tests.
- Isolated mutation: removed new quarantine predicate in a temporary source copy; corresponding hold-change test failed as intended. Canonical source never mutated by that experiment.
- Free DeepSeek authored tests in session `ses_ebe7307c9ffeHzalPinUEt1Aa0` (17 completed steps; reported cost 0); separate source review `ses_ebe705191ffeNFXYiU3N9QbSfs` found no material factory defect but identified missing direct expiry/accessor tests and post-reservation consent timing risk.
- Work closed both coverage gaps and changed the existing executor to re-read current health and consent **after** durable reservation, before issuing any send capability. A hold/withdrawal during database lock wait consumes the reservation without transmission or retry. This strengthens existing gates; it adds no live caller. Final revised source requires its own exact-head hosted run.
- The adapters remain injected dependencies. Neither Work nor DeepSeek represents synthetic reader data as authenticated live Winnr state.

## Live Winnr reconciliation after founder sign-in

Supersedes the earlier login blocker. On October16 Cairo, fresh authenticated domain, mailbox, warming and subscription pages verified the correct existing account. No secret/export/send controls were used.

- Startup Active, existing $69/month renewal November13;50/50 mailboxes and10/20 domain usage shown. Plan marketing still says10 domain slots; preserve that UI discrepancy. No extra slot purchased.
- Separate3 pre-warmed pilots, existing $9/month subscription, renewal November2. Pre-warmed domain auto-renew OFF, untouched.
- Reconciled53 unique mailbox rows across two scrolled table windows: all53 Active, all53 WarmingOff. Each Startup domain has5; cedarpointdomains.com has3. Provider Active does not override internal holds/quarantine or qualify transport.
- Startup domains: uberbondglobal.website, uberbondforge.space, uberbondflow.space, uberbondengine.website, uberbondcore.space, uberbondconnect.online, uberbondcloud.shop, uberbondapp.site, uberbondai.shop, uberbond.site.
- Independent Google public DNS-over-HTTPS returned status0 and one relevant SPF, DKIM-selector TXT, DMARC and MX answer for each of all10 Startup domains. Node's raw resolver initially returned ECONNREFUSED; that host resolver failure did not establish missing DNS. Record presence does not prove sender alignment, a valid delivered DKIM signature or Inbox placement.
- Provider warming page offers Enable warming at$0.60/mailbox/month; all rows remainOff. Billing breakdown shows only existing69+separate9. No paid add-on enabled or purchased.
- No fresh SMTP/IMAP login test, live provider write, DNS change, send or sender promotion performed.

Broader CI38813882234 completed browser+PostgreSQL SUCCESS. Deterministic suite ran11,098 tests:11,033 passed,1 failed,64 skipped. Sole failure: present-tense canon named older source b7cd96a9992a. Work ran official `npm run readiness` on exact revised source f4c8c5009696605016bdef1e603524292d863083; only generated artifacts/system-readiness.json and docs/CURRENT_SYSTEM_STATE.md changed. Canon freshness then6/6 PASS locally. No hand-edit or test weakening. The generated repair requires final exact-head CI verification.

Latest current receipts are also in issue1188, including6203269415. Sign-in is no longer an owner action. Protected runtime, primary/import/release authority, trusted current transport+hold/consent bindings, exact signed probe and independent receiving evidence remain the real operational gates. SEND_SET=[].
