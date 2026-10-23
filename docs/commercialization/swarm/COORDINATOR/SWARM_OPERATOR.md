# UberBond Wealth Swarm Ω · 20 distinct specialist agents

Twenty separate Claude Code custom agent definitions live in `.claude/agents/wealth-swarm-a*.md` and the machine manifest is `artifacts/commercialization/swarm/COORDINATOR/swarm_manifest.json`. Each definition is standalone and includes constitutional, financial, startup, no-effects, workspace, evidence, adversarial, eight-phase, output and closing receipt requirements. They are **compressed adaptations**, not byte-for-byte preservation of the original founder message. Source of full original language is the current founder conversation; preserve when accessible.

**Important:** Agent definition is not a live or paid session. The observed `claude auth status` returned `loggedIn:false` and `codex login status` returned `Not logged in` on 2026-10-23. No worker model call has been made. Do not silently move status from `CONFIGURED_NOT_RUNNING`.

**Model routing:** `model: opus` uses the newest Opus mapped by an authenticated Claude Code installation, if entitled; `effort: high` in agent metadata is the portable setting, raise to `--effort max` at invocation only when supported without paid external API obligations. Do not label any model GPT-6/Opus 5 unless runtime reports exact version.

**Safe launch:** Use the Chat on Steroids GUI/Claude Code once authenticated. At the start of each worker assign only its own branch+worktree and its own agent definition. Cap actual active heavy workers to machine capacity, not 20 simultaneous browsers: 2 vCPU, 7.8 GiB RAM, no swap. Sequential batches preserve all twenty independent identities. Start A19 as independent critic of exact SHA, not a fake human auditor, and A20 after substantive worker receipts. No money/customer effects.

**No merge authority:** A20 may stage and open draft PR, but never merge main. No external messaging, DNS, payment or production side effects. Authorize exact batches separately.
