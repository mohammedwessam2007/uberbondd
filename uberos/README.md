# UBER/OS

UBER/OS is UberBond's sovereign compute substrate program.

Generation 0 is intentionally modest and executable: a reproducible minimal Linux system built from an upstream Buildroot release, with UberBond-native authority, provenance, transactional-state, kernel-abstraction and unknown-unknown reasoning layers in the parent repository.

It is **not** a claim that UberBond has replaced Linux, booted on founder hardware, or proven a production OS. Linux is the first replaceable kernel supplier.

## Generation ladder

| Generation | Meaning |
|---|---|
| G0 | Minimal bootable Linux substrate + sovereign control-plane contracts |
| G1 | Reproducible userspace, package provenance, transactional update/rollback, init/supervisor integration |
| G2 | Owned build graph and cross-architecture release factory |
| G3 | Maintained Linux config/patch stack and kernel evidence lab |
| G4 | Move selected mechanisms behind Uber kernel-neutral interfaces |
| G5 | Multiple interchangeable kernel suppliers behind the same contracts |
| GΩ | Independent kernel only when measured evidence says Linux is the limiting architecture |

## Build

```bash
./uberos/scripts/build-gen0.sh x86_64
./uberos/scripts/run-qemu.sh x86_64
```

`aarch64` is also accepted. Buildroot is pinned to `2026.08` and the archive is SHA-256 checked before extraction. The image is network-disabled by the supplied QEMU runner by default.

Inside the guest: `uberos-health`.

## Source-level verification

```bash
node --test tests/uberos-system.test.mjs
node scripts/uberos-doctor.mjs
```

## Laws

- capability never creates authority;
- delegated authority may only shrink;
- source identity and license must be explicit;
- model intelligence is optional for boot and deterministic recovery;
- updates are candidate -> sandbox -> verify -> atomic promotion -> health -> keep/rollback;
- unknown-unknown output is a question, experiment or Ontogenesis candidate, never an automatic policy/kernel mutation;
- Linux is a donor and bootstrap supplier, not UBER/OS's terminal identity;
- physical boot, elapsed-time reliability and hardware claims require real receipts.
