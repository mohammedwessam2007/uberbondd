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
