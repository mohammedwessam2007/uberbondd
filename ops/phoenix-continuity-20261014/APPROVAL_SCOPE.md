# PHOENIX isolated continuity helper — exact activation scope

PREPARED ONLY. No service, secret binding, backup or restore has been activated by this package.

## Scope requested

- Create one **Free** Frankfurt Render helper `uberbond-phoenix-continuity-20261014`, automatic deploy off, from this reviewed Work branch/code SHA.
- Use provider-native `fromDatabase` to bind the existing Render source connection and `fromService.envVarKey` to bind the existing production `TOKEN_ENCRYPTION_KEY`. Never reveal, copy to chat or change the key.
- Link the existing recovery-custody group to access `RESCUE_ARCHIVE_KEY`. This extends sensitive access to the isolated helper and needs action-time confirmation before applying the Blueprint.
- Inject direct Neon URLs only through protected provider tooling; no URL values in code, Git, logs, chat or CI artifacts.
- Read the original Render source in a READ ONLY/REPEATABLE READ transaction; preserve a consistent encrypted snapshot by appending to the existing rescue archive table; authenticate the saved archive.
- Restore only into a new EMPTY database `uberbond_phoenix_rehearsal_20261014_v2`; refuse nonempty targets and wrong identities. Preserve all old snapshots and three old rehearsal/reference databases.
- Check original AES-GCM account-token compatibility internally; expose only the aggregate boolean. Compare catalog, rows and sequences after restore.
- The source gate requires an exact reviewed SHA and explicit unexpired approval. Keep `CONTINUITY_EXECUTION_GATE` disabled until scoped activation is approved.
- After receipt verification remove helper access/bindings and suspend it; preserve existing escrow and all backup keys. No production encryption-key rotation.

## Explicit exclusions

No production DATABASE_URL/key/env change, app deployment, migration, writer freeze, source retirement, cutover, send, model call, paid plan/addon, domain/DNS change, password change, broad IP allowlist or deletion. Native references do not modify the source resources. HTTP serves constant health only.

## Validation and limitations

Native local Python tests use Node crypto to independently generate the production AES-GCM envelope. Eleven tests pass: correct-format auth, wrong key/tag, malformed/empty/oversized envelopes, no plaintext logging, disabled gate, source pin and approval expiry. Syntax compiled. This is LOCAL_TEST, not real PostgreSQL restore/application boot evidence.

`rescue.py` is inherited byte-for-byte from the existing Work rescue branch fetched in this session. Helper source must be independently reviewed before activation; original/full app migration/boot and final writer continuity remain separate N26 gates. A new snapshot is point-in-time, not replication. Reference support must be verified by Render's native plan; refuse if unsupported or plan is not Free.
