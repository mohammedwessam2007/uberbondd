#!/usr/bin/env python3
"""Verify that a benchmark run left nothing behind.

Every v5 task runs in a disposable worktree that is destroyed afterwards. This
script proves the destruction actually happened, rather than trusting the
harness to say so:

  * the worktree path no longer exists, and git no longer lists it
  * the source checkout's tree hash equals the recorded base tree hash
  * the working tree has no uncommitted modification
  * no untracked residue remains under the factory directory

Cleanup verification is deliberately separate from scoring. A run that produced
a perfect patch and left a live worktree behind has failed its cleanup contract,
and the owner needs to see that as its own line item.
"""

import argparse
import os
import subprocess
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
V5 = os.path.dirname(HERE)
# v5 -> evals -> elite-duo-apex -> tools -> repository root
REPO_ROOT = os.path.abspath(os.path.join(V5, "..", "..", "..", ".."))


def git(args, cwd=None):
    proc = subprocess.run(["git"] + args, cwd=cwd or REPO_ROOT,
                          capture_output=True, text=True)
    return proc.returncode, proc.stdout.strip(), proc.stderr.strip()


def check_worktree_destroyed(path, repo=None):
    findings = []
    if path is None:
        return findings
    if os.path.exists(path):
        findings.append("worktree path still exists: %s" % path)
    code, out, _ = git(["worktree", "list", "--porcelain"], cwd=repo)
    if code == 0 and os.path.abspath(path) in out:
        findings.append("git still lists the worktree: %s" % path)
    return findings


def check_tree_hash(expected, repo=None):
    findings = []
    if expected is None:
        return findings
    code, actual, err = git(["rev-parse", "HEAD^{tree}"], cwd=repo)
    if code != 0:
        return ["cannot read tree hash: %s" % err]
    if not actual.startswith(expected):
        findings.append("tree hash %s does not match expected %s" % (actual, expected))
    return findings


def check_working_tree_clean(repo=None):
    code, out, err = git(["status", "--porcelain"], cwd=repo)
    if code != 0:
        return ["cannot read git status: %s" % err]
    modified = [line for line in out.splitlines() if line and not line.startswith("??")]
    return ["uncommitted modification: %s" % line for line in modified]


def check_residue(repo=None, subdir=None):
    """Untracked files under the factory that a run left behind."""
    repo = repo or REPO_ROOT
    scope = subdir if subdir is not None else os.path.relpath(V5, REPO_ROOT)
    code, out, err = git(["status", "--porcelain", "--untracked-files=all", "--",
                          scope], cwd=repo)
    if code != 0:
        return ["cannot scan for residue: %s" % err]
    residue = [line[3:] for line in out.splitlines() if line.startswith("??")]
    return ["untracked residue: %s" % path for path in residue]


def main(argv=None):
    ap = argparse.ArgumentParser()
    ap.add_argument("--worktree", help="path the run's disposable worktree used")
    ap.add_argument("--expect-tree", help="base tree hash the checkout must match")
    ap.add_argument("--skip-residue", action="store_true",
                    help="skip the untracked-residue scan (use while the factory "
                         "itself is being authored and files are not yet committed)")
    args = ap.parse_args(argv)

    findings = []
    findings += check_worktree_destroyed(args.worktree)
    findings += check_tree_hash(args.expect_tree)
    findings += check_working_tree_clean()
    if not args.skip_residue:
        findings += check_residue()

    for finding in findings:
        print("CLEANUP: " + finding)
    if findings:
        print("RESIDUE_DETECTED (%d finding(s))" % len(findings))
        return 1
    print("CLEAN")
    return 0


if __name__ == "__main__":
    sys.exit(main())
