"""Regression coverage for the documented literal test command.

The command the project documents is, verbatim:

    cd tools/elite-duo-apex && python3 -m unittest discover

`unittest discover` recurses only into directories that are importable
packages. Before `tests/__init__.py` existed, that command reported
"Ran 0 tests in 0.000s ... OK" from this repository: a green result that
executed nothing. A silent zero is worse than a red suite, because nobody
investigates a pass.

These tests pin the property that made it green for the wrong reason:

  * the package marker is a real, non-ignored file, so a fresh checkout of
    this repository gets it;
  * running discovery from the package root, in a throwaway copy of the
    directory with the ambient environment stripped, collects every test
    module present -- not zero, and not a subset.

Collection only. These tests load the suite and inspect it; they never run
it, so this module cannot recurse into itself.
"""

import shutil
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

PKG_ROOT = Path(__file__).resolve().parents[1]
TESTS_DIR = PKG_ROOT / "tests"
REPO_ROOT = PKG_ROOT.parents[1]

# Runs inside the throwaway copy. Prints one module::class line per collected
# test case, so the caller can compare the collected set against the files on
# disk instead of trusting a bare count.
COLLECT = r"""
import unittest
loader = unittest.defaultTestLoader
suite = loader.discover(".")
seen = set()
def walk(node):
    if isinstance(node, unittest.TestSuite):
        for child in node:
            walk(child)
    else:
        seen.add(type(node).__module__)
walk(suite)
print("COUNT", suite.countTestCases())
for err in loader.errors:
    print("ERROR", " ".join(str(err).split()))
for module in sorted(seen):
    print("MODULE", module)
"""


class DiscoveryContractTests(unittest.TestCase):
    def test_package_marker_exists(self):
        marker = TESTS_DIR / "__init__.py"
        self.assertTrue(marker.is_file(),
                        "%s must exist or `unittest discover` silently "
                        "collects nothing" % marker)

    def test_package_marker_is_not_git_ignored(self):
        """A fresh checkout must receive the marker.

        Checked through git rather than by reading .gitignore, so a rule added
        anywhere in the ignore chain is caught. `check-ignore` exits 1 when the
        path is *not* ignored, which is the outcome this test wants.
        """
        proc = subprocess.run(
            ["git", "check-ignore", "-q", str(TESTS_DIR / "__init__.py")],
            cwd=str(REPO_ROOT), capture_output=True, text=True)
        self.assertEqual(proc.returncode, 1,
                         "the package marker is git-ignored, so a fresh "
                         "checkout would not get it")

    def _collect_in_fresh_copy(self):
        """Discover from a copy of the package with no ambient state.

        A copy rather than the live tree so nothing already imported, cached in
        __pycache__, or left on sys.path can supply what a real checkout would
        not. `-E` makes the child ignore PYTHONPATH and friends.

        The copy reproduces the repository-relative layout: the package under
        tools/, and the .claude/ tree beside it. Both are needed, because test
        modules compute repository paths from `__file__` and some import a hook
        module at collection time. Copying only the package would fake a
        checkout that no clone ever produces, and the import error it caused
        would look like a discovery bug rather than a missing directory.
        """
        skip = shutil.ignore_patterns("__pycache__", "node_modules", ".git")
        with tempfile.TemporaryDirectory() as tmp:
            dest = Path(tmp) / "tools" / PKG_ROOT.name
            shutil.copytree(str(PKG_ROOT), str(dest), ignore=skip)
            shutil.copytree(str(REPO_ROOT / ".claude"),
                            str(Path(tmp) / ".claude"), ignore=skip)
            proc = subprocess.run([sys.executable, "-E", "-c", COLLECT],
                                  cwd=str(dest), capture_output=True, text=True)
            self.assertEqual(proc.returncode, 0,
                             "collection failed:\n%s" % proc.stderr)
            count = 0
            errors, modules = [], set()
            for line in proc.stdout.splitlines():
                tag, _, rest = line.partition(" ")
                if tag == "COUNT":
                    count = int(rest)
                elif tag == "ERROR":
                    errors.append(rest)
                elif tag == "MODULE":
                    modules.add(rest)
            return count, errors, modules

    def test_literal_discovery_collects_every_test_module(self):
        count, errors, modules = self._collect_in_fresh_copy()
        self.assertEqual(errors, [], "discovery reported loader errors")
        expected = {"tests." + path.stem
                    for path in sorted(TESTS_DIR.glob("test_*.py"))}
        self.assertEqual(modules, expected,
                         "discovery collected a different set of modules than "
                         "the files present in %s" % TESTS_DIR)
        self.assertGreater(count, 0,
                           "discovery collected zero tests -- the command "
                           "would report a meaningless pass")

    def test_every_discoverable_test_directory_is_a_package(self):
        """Any directory discovery must reach needs its own marker.

        Starts at the discovery root and descends only through directories
        that are already packages -- that is exactly the set `discover` can
        reach, so a new nested test directory that would be skipped silently
        shows up here as a failure. Sibling trees with their own runners, such
        as evals/, are correctly left alone: they are not packages and hold no
        test module at their top level.
        """
        missing = []
        frontier = [PKG_ROOT]
        while frontier:
            current = frontier.pop()
            for entry in sorted(current.iterdir()):
                if not entry.is_dir() or entry.name == "__pycache__":
                    continue
                if any(entry.glob("test_*.py")) and \
                        not (entry / "__init__.py").is_file():
                    missing.append(str(entry.relative_to(REPO_ROOT)))
                elif (entry / "__init__.py").is_file():
                    frontier.append(entry)
        self.assertEqual(missing, [],
                         "these directories hold tests but are not packages, "
                         "so `unittest discover` skips them without a word")


if __name__ == "__main__":
    unittest.main()
