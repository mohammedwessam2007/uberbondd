---
name: penetration-testing-with-strix
description: Use Strix to security-test UberBond-owned local, test, preview, or separately authorized production targets. Never use this project skill for unrelated third-party targets. Findings require reproducible evidence before canonical promotion.
license: Apache-2.0
metadata:
  upstream: usestrix/strix
  source-ref: 3c767cdd4750d5e0e4454f58eff279c589889f00
---

# Strix security employee — UberBond integration

Upstream Strix provides autonomous application security testing. UberBond integrates it as a **bounded security employee**, not a general offensive tool.

Read before use:
- `UBERBOND_CANON.md`
- `docs/AI_SKILL_PLUGIN_ASSIMILATION_CANON.md`
- `artifacts/external-skill-plugin-registry.json`
- `src/external-capability-control-plane.mjs`

## Mandatory target gate

Call/mentally apply `planExternalCapabilityUse()` for `capabilityId: strix` before a scan.

Allowed by default only for:
- `OWNED_LOCAL`
- `OWNED_TEST`
- `OWNED_PREVIEW`

`OWNED_PRODUCTION` requires explicit production-security-test authority. Unrelated third-party targets are denied.

## Runtime

Self-hosted Strix currently documents Docker plus an LLM provider configuration, with installation such as:

```bash
pipx install strix-agent
strix --version
```

Do not commit LLM keys. Do not start a scan merely because Strix is installed. Provider/model use may incur cost and requires the normal UberBond provider/budget authority.

## Safe first workflow

1. Work from a clean checkout or bounded preview, not valuable uncommitted working files.
2. Confirm target ownership/scope.
3. Confirm Docker/runtime health.
4. Confirm explicit provider/model and bounded budget when the scan requires a provider call.
5. Run the smallest scan that can answer the security question.
6. Treat output as candidate findings until independently reproduced or otherwise verified.
7. Repair one proven defect through the normal Claude Software Factory path.
8. Re-run the exact failing proof/test when practical.
9. Record a security receipt containing target identity, source SHA, scan mode/scope, cost, findings, false positives, remediation and retest evidence.

## Prohibited

- unrelated third-party scanning;
- credential theft or persistence;
- destructive exploitation;
- lateral movement beyond the authorized target;
- disabling security controls to make a scan easier;
- claiming a clean scan proves complete security coverage;
- putting live secrets inside skill files, prompts or committed reports.

A Strix finding is evidence only for what was actually exercised. A zero finding count is not universal proof of safety.
