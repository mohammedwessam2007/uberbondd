"""Point-in-time, read-only Phoenix source census donor (fail-closed, prints nothing).

Requires an already-OPENED trusted internal PostgreSQL connection already inside a genuine
REPEATABLE READ, READ ONLY transaction. Never begins, sets, commits or writes; never prints.
Returns counts and SHA256 digests of canonical aggregated values only: no table rows, PII,
credentials, connection URLs, customer names or full keys. A point-in-time digest does not
prove no later writes, so source_current_finalized and cutover_allowed are always false.
"""
import hashlib
from collections.abc import Mapping
from datetime import datetime, timezone
from types import MappingProxyType

import rescue as r

SCOPE = "phoenix:read-only-source-census"
KEYS = ("scope", "reviewed_source_sha", "expires_at", "verified_activity")
HEX = set("0123456789abcdef")
MAX_OBJECTS = 20000


def _digest(value):
    return hashlib.sha256(r.canonical(value)).hexdigest()


def _refused(code, **extra):
    return dict(census_ok=False, approved=False, refusal=code, source_read_only=False,
                writes_performed=False, source_current_finalized=False,
                cutover_allowed=False, **extra)


def _now(clock):
    value = clock() if callable(clock) else None
    if not isinstance(value, datetime) or value.tzinfo is None:
        raise ValueError("CLOCK")
    return value.astimezone(timezone.utc)


def _approved(approval, reviewed_source_sha, now, verify_approval):
    if isinstance(approval, (bool, str, bytes)) or not isinstance(approval, Mapping):
        return False
    if set(approval) != set(KEYS):
        return False
    frozen = MappingProxyType(dict(approval))
    if frozen["scope"] != SCOPE or frozen["verified_activity"] is not True:
        return False
    pin = frozen["reviewed_source_sha"]
    if pin != reviewed_source_sha or len(pin) != 40 or not set(pin.lower()) <= HEX:
        return False
    expires = datetime.fromisoformat(str(frozen["expires_at"]).replace("Z", "+00:00"))
    if expires.tzinfo is None or now >= expires.astimezone(timezone.utc):
        return False
    return callable(verify_approval) and verify_approval(frozen) is True


def _live_read_only_txn(connection):
    if getattr(connection, "autocommit", None) is not False:
        return False
    try:
        from psycopg2.extensions import TRANSACTION_STATUS_INTRANS as IN_TXN
    except Exception:
        return False
    status = getattr(getattr(connection, "info", None), "transaction_status", None)
    if status is None:
        getter = getattr(connection, "get_transaction_status", None)
        status = getter() if callable(getter) else None
    return status == IN_TXN


def _live_isolation(connection):
    for name, expected in (("transaction_read_only", "on"),
                           ("transaction_isolation", "repeatableread")):
        rows = r.query(connection, "SHOW " + name)
        if len(rows) != 1 or len(rows[0]) != 1 or not isinstance(rows[0][0], str):
            return False
        if rows[0][0].strip().lower().replace(" ", "") != expected:
            return False
    return True


def census_source_readonly(source_connection, approval, reviewed_source_sha, clock, verify_approval):
    """Return a read-only census receipt, or a fail-closed refusal. Never raises."""
    try:
        now = _now(clock)
        if not _approved(approval, reviewed_source_sha, now, verify_approval):
            return _refused("APPROVAL_INVALID")
    except Exception as error:
        return _refused("APPROVAL_UNVERIFIED", error_type=type(error).__name__)
    try:
        if not _live_read_only_txn(source_connection):
            return _refused("SOURCE_TRANSACTION_NOT_LIVE_READ_ONLY")
        if not _live_isolation(source_connection):
            return _refused("SOURCE_ISOLATION_NOT_REPEATABLE_READ_ONLY")
        identity = r.query(source_connection,
            "SELECT current_database(),current_setting('server_version_num')::int/10000")
        if len(identity) != 1 or identity[0] != (r.SOURCE_DB, 16):
            return _refused("SOURCE_IDENTITY_OR_VERSION_MISMATCH")
        inventory = r.inventory(source_connection)
        if not isinstance(inventory, Mapping) or "tables" not in inventory:
            return _refused("SOURCE_INVENTORY_UNKNOWN")
        tables = inventory["tables"]
        if len(tables) > MAX_OBJECTS:
            return _refused("SOURCE_INVENTORY_TOO_LARGE")
        fingerprints = r.fingerprints(source_connection, tables)
        sequences = r.sequence_states(source_connection, tables)
        observed = {"inventory": inventory, "fingerprints": fingerprints,
                    "sequences": sequences}
        return dict(
            census_ok=True, approved=True, scope=SCOPE,
            reviewed_source_sha=reviewed_source_sha, observed_at=now.isoformat(),
            isolation="repeatable read", transaction_read_only=True,
            writes_performed=False, archive_or_backup_created=False,
            target_database_touched=False, provider_calls=0,
            object_counts={k: len(v) for k, v in sorted(inventory.items())},
            table_count=len(fingerprints),
            row_count=sum(int(f["rows"]) for f in fingerprints),
            sequence_count=len(sequences),
            inventory_sha256={k: _digest(v) for k, v in sorted(inventory.items())},
            fingerprints_sha256=_digest(fingerprints), sequences_sha256=_digest(sequences),
            census_sha256=_digest(observed),
            point_in_time_only=True, source_current_finalized=False, cutover_allowed=False,
        )
    except Exception as error:
        return _refused("CENSUS_FAILED", error_type=type(error).__name__)
