# UberBond Library Byte-Recovery Receipt — 2026-09-20

## Original corpus denominator

The pre-recovery persistent Library corpus at `/Uberbond` was completely enumerated:
- files: **836**
- stored bytes: **2,625,444,097**
- pagination: exhausted to null cursor

## Raw-byte materialization sweep

Every one of the 836 indexed objects was attempted through the authorized Library raw-file materialization path.

Terminal result:
- attempted: **836 / 836 = 100%**
- raw-materialized and SHA-256 verified: **93 files**
- raw-materialized verified bytes: **44,001,793**
- raw-materialization unavailable through current interface: **743 files**
- unattempted: **0**
- silent unknown objects: **0**

Fractions:
- SHA-256 byte-verified files: **11.1244019139%**
- explicit raw-export boundary: **88.8755980861%**

The 743 unavailable objects remain addressable by persistent Library identity from the complete Library index. They are not falsely labeled byte-hashed.

## Persistent evidence

Exact SHA-256 ledger:
- Library path: `/Uberbond/UBERBOND_LIBRARY_RAW_SHA256_20260920.jsonl`
- file id: `file_00000000bdb082108e553098898fce17`
- library id: `libfile_e0b67165fd9481918bbbabb975cdc1fc`
- entries: **93**
- bytes: **24,682**
- ledger SHA-256: `25b050f4baec6e96a635bdfcedeadba5110dafac54dd1e1a19503d7f5174ee5a`

Exact materialization-failure ledger:
- Library path: `/Uberbond/UBERBOND_LIBRARY_RAW_MATERIALIZATION_FAILURES_20260920.jsonl`
- file id: `file_000000004f088210b493a02073358ad9`
- library id: `libfile_e50487e0ae4081919c10487ba7fee419`
- entries: **743**
- bytes: **47,538**
- ledger SHA-256: `269aad4c42c8ada78b222623b9f784bc6e405674387c31793cc0dc6d61a6d65e`

Machine completion receipt:
- Library path: `/Uberbond/UBERBOND_LIBRARY_BYTE_RECOVERY_20260920.json`
- file id: `file_00000000dddc81f4bbdd1f143ff2a86d`
- library id: `libfile_0fd445f5688c8191a4cef5b8a8b87596`

## Truth boundary

“Every object recovered” and “every byte hashable through this connector” are different propositions.

The first is established for the original 836-file Library corpus: **836/836 indexed, 836/836 attempted, 0 silent gaps**.

The second is established only for the 93 raw-exportable objects. The remaining 743 have a durable explicit access boundary, not invented hashes.

This is zero-silent-loss recovery.
