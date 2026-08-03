"""Package marker for the vendored elite-duo-apex test suite.

`python3 -m unittest discover` (with no arguments) starts at the current
directory and recurses only into directories that are importable packages.
Without this file, running that literal command from tools/elite-duo-apex/
silently reports "Ran 0 tests ... OK" — a passing result that tested nothing,
which is worse than a failure because it looks green.

The tests themselves locate their fixtures through `Path(__file__)` and use no
relative imports, so making this directory a package changes nothing about how
they run; it only makes them discoverable by the documented command.

Both of these now execute the same suite:
    python3 -m unittest discover
    python3 -m unittest discover -s tests -t tests
"""
