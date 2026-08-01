# No-quality-compromise policy

## Preserved

- Sonnet 5 is the only inference model.
- Architecture and independent review run at max effort.
- Implementation runs at xhigh.
- No low or medium agent exists.
- No Haiku helper exists.
- No silent fallback exists.
- Every deterministic shortcut preserves the original semantic contract.
- Every reviewer is fresh-context and edit-disabled.
- Every major decision has counterfactual and acceptance evidence.

## Efficiency that does not reduce quality

- removing duplicate prompt text;
- loading path-specific rules only when relevant;
- using code for exact counts and validation;
- storing large logs outside the model context;
- transferring contracts instead of transcripts;
- not rerunning settled architecture;
- caching stable kernels;
- using separate reviewer contexts;
- avoiding agent teams when work is sequential.

These reduce waste rather than intelligence.
