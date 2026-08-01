# Quality without cheap models

## All role agents are Sonnet 5

The package contains no Haiku role and no cheaper-model fallback.

## Why not run every operation at max

Max effort increases reasoning depth, not the correctness of deterministic tasks. Running max to count rows, hash files, or reformat JSON wastes Sonnet tokens and can increase latency without improving output.

The quality-preserving design is:

- max for architecture and independent judgment;
- xhigh for execution, migration, security, and difficult debugging;
- high only for evidence compilation, memory curation, and deterministic coordination;
- scripts for calculations and validation.

High is not a cheap model. It is the same Sonnet 5 model with a calibrated reasoning signal.

## No semantic fallback

If an xhigh or max role fails:

- do not silently downgrade;
- preserve evidence;
- retry once when failure is transient;
- create an escalation capsule;
- stop the affected path if the required quality cannot be maintained.

## Quality gates

A task cannot complete merely because:

- many tests passed;
- many agents ran;
- a large prompt was used;
- two reviewers agreed;
- the response sounded confident.

Completion requires task-specific acceptance tests and factual evidence.
