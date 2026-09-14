# UberInboxes

`src/uberinboxes.mjs` is the active mailbox fleet materialization layer above UberDoso and the provider-neutral infrastructure adapters.

## Current canonical fleet

The default fleet uses the two canonical owned outreach roots and eight founder-alias local parts per root. That produces 16 desired mailbox identities under the current UberDoso density policy.

The aliases are deliberately variations of the founder identity rather than invented people. The fleet compiler marks them as `FOUNDER_ALIAS`.

## Three different states

1. `PLANNED`: the address exists only in the compiled fleet.
2. `PROVIDER WRITE ACCEPTED`: a configured provider accepted a mailbox provisioning mutation. This still requires reconciliation.
3. `OBSERVED`: the provider's later `listMailboxes()` inventory actually returns the address.

None of those states creates cold-send authority. Authentication, DNS, warm-up, health, placement, suppression and outreach authorization remain separate gates.

## Active creation path

`scripts/uberinboxes-apply.mjs` performs the live provisioning path when all of these are true:

- a supported provider adapter is genuinely configured (`icemail` or `mailforge` today),
- `UBERINBOXES_APPLY=YES` is explicitly set,
- `UBERINBOXES_SPEND_LIMIT_CENTS` bounds the authorized spend,
- `UBERINBOXES_ESTIMATED_COST_CENTS` states the expected provider charge,
- the provider accepts the mutation,
- reconciliation later confirms inventory.

Example operator shape:

```bash
UBERINBOXES_PROVIDER=icemail \
UBERINBOXES_APPLY=YES \
UBERINBOXES_SPEND_LIMIT_CENTS=<explicit limit> \
UBERINBOXES_ESTIMATED_COST_CENTS=<observed quote> \
node scripts/uberinboxes-apply.mjs
```

Provider credentials remain server-side environment secrets and are never printed by the runner.

## Retry safety

Mailbox creation is a real external mutation. If a provider times out or reports an unknown write outcome, UberInboxes stops immediately. It does not blindly retry. Reconcile provider inventory first, then decide whether remaining addresses need a new operation.

## Current external blocker

The repository can now compile, execute and reconcile mailbox provisioning through the existing provider adapter contract. Actual inbox creation still requires a configured provider account/API key or an already-live self-hosted mailbox service. Repository code cannot manufacture provider credentials, billing approval, DNS authority or physical mail infrastructure.

## Capacity truth

Raw mailbox count is not treated as the ultimate capacity primitive. UberInbox/UberInboxes preserve the hypothesis that reputation-isolated, authenticated, warmed, observable capacity is more predictive of useful distribution than nominal mailbox inventory.
