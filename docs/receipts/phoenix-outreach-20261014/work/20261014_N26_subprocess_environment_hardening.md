# N26 subprocess environment hardening

SOURCE/LOCAL_TEST. Work commit 78feacf99034a7060778df21a86bb7ee8ce7ef92 changes only isolated helper rescue.py: PostgreSQL subprocess environment now permits PATH, LANG, LC_ALL, LC_CTYPE and TZ, then adds explicit PostgreSQL connection settings. Unrelated custody/runtime credentials no longer inherit through subprocess environment.

Executed Python AST syntax/function checks for source and target modes with synthetic unrelated custody and production-key variables. Both modes excluded secrets, retained intended PostgreSQL settings and passed exact allowed-key assertions. Remote committed source read back byte-exact. No PostgreSQL integration, real secrets, runtime activation, backup or restore tested.

N26 remains open for custody group scope, independent source admission, scoped activation, current backup/restore/key compatibility, app boot and writer continuity. No production changes, sends or new spending. Previous receipts retained. Next: independent review of hardened SHA and enumerated native binding scope before activation.
