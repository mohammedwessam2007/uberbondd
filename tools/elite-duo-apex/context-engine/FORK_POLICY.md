# Fork policy

Use a cache-sharing fork when the side task needs most of the current conversation and its tool calls would pollute the parent context.

Good uses:

- derive tests from the current accepted architecture;
- try an alternate local implementation in a worktree;
- inspect a nearby module using the same decision history;
- generate a bounded artifact from the current context.

Do not use a fork for:

- independent review;
- contradiction adjudication requiring fresh eyes;
- noisy research that can start from a compact delegation packet;
- tasks requiring a different tool or permission boundary.

Forks are experimental. They must remain Sonnet, receive exclusive file ownership when editing, and return only a structured result.
