# GENESIS System-One runtime activation — 2026-09-22

GENESIS now has one genuinely callable supplier: `supplier:jev-system-one`.

Live proof:
- bootstrap canary leased a real cognition job and persisted a structured receipt;
- cost = 0 microusd, model tokens = 0;
- supplier promoted from `BOOTSTRAP_CANARY` to `PROVEN`;
- a two-minute Supabase cron now runs the worker without ChatGPT being present;
- Reality reconciliation sees one callable supplier;
- 12 cognition jobs were completed by the verification checkpoint;
- paid-provider mode remains disabled and the daily cognition spend cap remains zero.

Concurrency was hardened after the first parallel test exposed harmless lease contention. The live cognition node now uses a service-role-only Postgres `FOR UPDATE SKIP LOCKED` claim. A six-way parallel replay then completed six distinct jobs with zero race losses and zero duplicate receipts.

System-One is intentionally narrow. It is a deterministic hostile prefilter, not a frontier model. It attacks baseline leakage, hidden assistance, missing measurements, coordination overhead and evidence/authority gaps, then leaves unresolved semantic or causal uncertainty for stronger suppliers.
