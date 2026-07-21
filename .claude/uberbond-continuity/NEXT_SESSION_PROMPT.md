# NEXT SESSION / NEXT ACTION

Phase 1 (read-only inspection) is complete with real, verified findings — see SESSION_STATE.md.

Immediate next action when resuming Phase 2:

1. `git switch --create p2.2/pr4-definitive-repair a905c907de67fdacfc85ee1cd1e3660eefb1be81`
   (current working branch `claude/uberbond-pr4-max-score-2vmv60` stays untouched at ba2b100
   so it can still be pushed under its required name later; the repair work happens on the
   new local branch, or directly on the working branch after resetting it to the accepted
   base — needs an explicit call since the branch's push name is fixed by the harness to
   `claude/uberbond-pr4-max-score-2vmv60`).
2. Read (not edit) each rejected-branch file listed in P2_2_ARCHITECTURE_MAP.md via
   `git show 41bd12e:<path>` to understand actual current shape before writing the repair.
3. Read accepted-base `src/security.mjs`, `src/send-safety.mjs`, `src/payments.mjs`,
   `src/revenue.mjs`, `src/store.mjs` to find the real encryption/keyed-hash/suppression/
   final-dispatch/payment utilities that must be reused per Phase H/I/J/K of the patch guide.
4. Begin repair group 1 (protected generic collection mutation guard) with a failing test
   first, per PATCH_GUIDE.md Phase C.
5. Confirm real isolated Postgres availability (psql client is present; must confirm a
   disposable server can actually be started, e.g. via `embedded-postgres` devDependency on
   the rejected branch) before promising any P2.2-postgres-race row.
