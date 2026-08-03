# Cleanup Protocol

Every v5 task runs in a disposable worktree and leaves nothing behind. Grounded
in the per-task `cleanup_contract` fields of `13_BENCHMARK_TASK_BANK.md` and
`15_CONTAMINATION_CONTROL_PROTOCOL.md` §5.

## 1. Disposable-worktree architecture

```
fresh container
  └── clean detached checkout at the frozen base commit
        └── disposable worktree            <- all task work happens here
              └── (held-out only) read-only vault mount
```

Rules:

* One worktree per run. Worktrees are never reused across runs, tasks, or
  replicates, because reuse is exactly how a cache or artifact from one run
  contaminates the next.
* The worktree path never encodes configuration identity — not the directory
  name, not a branch name, not an environment variable.
* A read-only vault mount exists only for held-out and adversarial scoring, is
  mounted after execution, and is unmounted before the worktree is destroyed.
* The worktree is destroyed at the end of the run, pass or fail. A failed run is
  not kept "for debugging" in place; its artifacts are copied to the results
  store first and the worktree still goes.

## 2. What must be true afterwards

`scripts/check_cleanup.py` checks all four and prints one line per finding:

1. **worktree destroyed** — the path does not exist and `git worktree list` no
   longer mentions it
2. **base tree restored** — `git rev-parse HEAD^{tree}` matches the recorded base
   tree hash
3. **no uncommitted modification** — `git status --porcelain` shows no tracked
   change
4. **no untracked residue** — nothing new and unignored under `evals/v5/`

```
check_cleanup.py --worktree /path/to/wt --expect-tree <tree-sha>
```

Exit 0 prints `CLEAN`; exit 1 prints `RESIDUE_DETECTED` with the findings.

## 3. Cleanup is scored separately

`cleanup_result` is its own field in the run record and its own line in the
report. It is not folded into acceptance, because the two failure modes are
different and the owner needs to see both: a run can produce a correct patch and
still fail cleanup by leaving a live worktree, a stray temp file, or a mounted
vault.

A run that fails cleanup does not get its acceptance result revised. It gets a
`RESIDUE_DETECTED` cleanup result recorded alongside it.

## 4. Vault-mount discipline

For held-out and adversarial tasks the vault mount is the highest-risk moment in
the whole pipeline — it is the only point at which hidden material and a working
checkout are in the same filesystem namespace.

* Mount read-only, after execution has finished, for scoring only.
* Unmount before destroying the worktree, and verify the unmount.
* Scan run artifacts for canary strings before they leave the container.
* A canary found in any artifact is a contamination incident under
  `CONTAMINATION_POLICY.md` §7, not a cleanup finding.

## 5. Ordering

```
execute  ->  copy artifacts to results store  ->  mount vault (read-only)
         ->  score  ->  unmount vault  ->  canary scan  ->  destroy worktree
         ->  check_cleanup.py  ->  record cleanup_result
```

The cleanup check runs after destruction, not before. Checking that a worktree is
gone while it still exists proves nothing.
