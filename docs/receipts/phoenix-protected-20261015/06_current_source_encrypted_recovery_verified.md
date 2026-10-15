# Current original Render source encrypted backup and isolated restore VERIFIED

Protected helper srv-db870egm7kps73daipi0 ran immutable source 70f2f5f094d3c2fbc707b9c76beb9e918bc7c791 on corrected deployment dep-db872e5g1s2s7399ngr0. Actual receipt log timestamp 2026-10-15T06:23:12.030468491Z. Snapshot/dump observation 2026-10-15T06:23:09.435520+00:00. This is a fresh Oct15 point-in-time snapshot, not the older Oct14 archive.

```json
{
  "application_boot_tested": false,
  "archive_sha256": "aacfe20c43e7fff0b152c6be2a2dc8134bf39d4f734e6cbef6e81838a9623614",
  "authenticated_archive_recovery": true,
  "checks": {
    "columns": true,
    "constraints": true,
    "enums": true,
    "extensions": true,
    "indexes": true,
    "policies": true,
    "routines": true,
    "row_fingerprints": true,
    "schemas": true,
    "sequences": true,
    "tables": true,
    "triggers": true,
    "views": true
  },
  "continuous_replication": false,
  "destination": "uberbond_phoenix_rehearsal_20261014_v2",
  "dump_sha256": "e553beeffb62c3cf6b1fc61e66ebda18c823e484b8309b31b4f6e7568893a387",
  "mail_or_model_calls": 0,
  "mission": "PHOENIX_CURRENT_SOURCE_ISOLATED_RECOVERY_20261014:eb315475fc6eb2c2439a6da29873f12f",
  "observed_at": "2026-10-15T06:23:09.435520+00:00",
  "original_key_compatible": true,
  "production_cutover": false,
  "row_count": 1270,
  "source_read_only": true,
  "status": "VERIFIED_ISOLATED_RECOVERY",
  "table_count": 57
}
```

Independent Neon connector archive SQL confirms exactly one matching current mission, created 2026-10-15T06:23:10.313Z; actual archive bytes SHA256 equals stored archive_sha256; source_fingerprints contain 57 tables and 1270 total rows; dump and archive digests match protected receipt. Archive remains appended in existing uberbond_render_rescue.phoenix_rescue_archive.backup, original historical archives retained. Original account token AES-GCM compatibility TRUE is actual protected-runtime verification, covering every account row under #1425 guard, without exposing any plaintext/key/ciphertext. This is not proof all future unimported Startup accounts work.

Execution gate disabled immediately after observed success; Render acknowledged update. Independent target fingerprint verification and binding removal/suspension are next. Source backup is point-in-time, not replication; application_boot_tested=false, continuous_replication=false, production_cutover=false. Later source writes after snapshot remain open. No production app deployment/env/writer change, source allowlist expansion, fees, DNS, model/mail calls or send. SEND_SET=[].
