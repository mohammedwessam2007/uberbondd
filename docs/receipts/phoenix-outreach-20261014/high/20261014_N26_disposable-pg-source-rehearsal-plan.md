# PHOENIX H N26 independent disposable PostgreSQL proof attempt
Date: 2026-10-14 UTC; CLASSIFICATION: SOURCE/TEST_CANDIDATE, not yet hosted pass.
Started from exact Work PR #1409 `ea56c8f4c322d97858354297bb50c74b20673988` without touching Work-owned branch. Work helper Dockerfile, continuity.py, rescue.py and 11 tests inherited unchanged.
Added isolated PostgreSQL16 synthetic-dataset test: source read-only REPEATABLE READ/snapshot, pg_dump on exported snapshot, AES-GCM persistent archive, authenticated archive readback, isolated pg_restore, full catalog and row fingerprints and original-format AES-GCM aggregate boolean. Reports only synthetic booleans and no secrets.
CI test overrides source/target host expectations and SSL ONLY inside ephemeral synthetic fixture; production helper retains strict expected hosts and TLS. It populates only synthetic credentials and never uses live Render, Neon, Winnr or emails.
New no-send job auto-runs on this isolated branch. Exact hosted conclusion must be independently fetched. Even success is *not real source recovery*; Render original expires Oct16 23:22:29Z, historical 3 Neon archives remain.
