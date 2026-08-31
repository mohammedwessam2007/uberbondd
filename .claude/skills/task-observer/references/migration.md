# Legacy observation-log migration

Adapted from Eoghan Henn / rebelytics.com, CC BY 4.0, pinned source `510caad26c907793e48306262af216ff9f71c9f7`.

Use only if a pre-v3 single-file `skill-observations/log.md` exists and the per-observation `observation-log/` structure does not.

1. Back up the legacy file.
2. Parse each historical observation into one independent Markdown file with current required frontmatter.
3. Preserve original meaning, ordering and any safe evidence references.
4. Allocate stable numeric ids and write `archive/.id-floor` to the highest allocated id.
5. Validate every migrated file and compare the number of source observations to output observations.
6. Rename the original to an explicit migrated/archive name. Do not delete it during the same migration.
7. Never let a stale parallel session recreate the retired single-file log.

Use `scripts/migrate-log.py` when it fits the detected legacy format. If the parser cannot prove a lossless mapping, stop and surface the ambiguity instead of guessing.
