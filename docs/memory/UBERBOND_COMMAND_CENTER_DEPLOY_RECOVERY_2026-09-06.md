# UberBond Command Center deploy recovery — 2026-09-06

## Incident
The first iPad URL pointed at the standalone `uberbond-wessam-command-center` Vercel probe project. Its root served only a 217-byte deployment probe page and `/uberbond` returned Vercel `NOT_FOUND`.

The real Git-linked `uberbondd` preview had not successfully built the command center because Vercel rejected the then-current `vercel.json` before executing code: `functions.api/command-center.mjs.includeFiles should be string`.

## Recovery state
The current `gpt/uberbond-battery-ignition-20260905` branch contains:
- `public/uberbond.html`, `public/uberbond.css`, and `public/uberbond.js`;
- protected `api/command-center.mjs`;
- `vercel.json` with string-valued `includeFiles`;
- `/uberbond -> /uberbond.html` rewrite;
- exact-deploy Feature Genome -> Feature Atom Atlas -> Synaptic Map build regeneration.

This commit exists to preserve the incident/recovery receipt and force a fresh Git-linked Vercel preview of the corrected tree.

## Acceptance
Do not call the app live until the fresh `uberbondd` deployment reaches READY and both `/uberbond` and the protected `/api/command-center` behavior are fetched from that exact deployment.
