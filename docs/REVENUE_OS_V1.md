# UberBond Revenue OS v1 Control Plane

This tranche extends the existing durable queue and outbound safety layer. It does not replace them and does not modify `lite/`.

## Added

- durable source evidence;
- canonical opportunities;
- versioned policy decisions;
- deterministic opportunity scoring;
- stable experiment assignment;
- message variants;
- compact owner gates;
- evidence-based 10/10 readiness gates.

## 10/10 is not a prompt rating

The system may report 10/10 only when all of these are true:

- deterministic, browser, and migration checks pass;
- dry-run sourcing is auditable;
- duplicate outreach is zero;
- hard-bounce rate is below 2%;
- complaint rate is below 0.1%;
- evidence coverage is at least 98%;
- positive-reply rate is at least 3%;
- at least three paid pilots exist;
- at least USD 1,000 has been collected;
- contribution margin is positive;
- at least one recurring client exists;
- owner actions average no more than three per day.

These are initial validation gates, not a guarantee of wealth or permanent performance.

## Safe rollout

1. Apply migration 005.
2. Run `npm run check`.
3. Keep outbound disabled.
4. Generate a dry-run opportunity queue.
5. Verify policy decisions and evidence coverage.
6. Start with a small controlled cohort.
7. Increase volume only after bounce, complaint, reply, and delivery data pass.
