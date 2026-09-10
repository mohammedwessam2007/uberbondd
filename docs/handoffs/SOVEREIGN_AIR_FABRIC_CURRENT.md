# UberBond Sovereign Air Fabric — Current Continuity

Status: CURRENT ARCHITECTURAL LAW + SOURCE IMPLEMENTATION CONTEXT. Real owned-host operation still requires runtime evidence.

## Non-negotiable topology

UberBond is not intended to run its heavy workload on Mohamed's iPad.

The iPad is a **thin founder cockpit** only: it displays status, receipts, bounded decisions and owner controls, and sends authenticated lightweight requests. It must not host Postgres, workers, model runtimes, build pipelines, large retrieval jobs, background schedulers, container orchestration or other heavy UberBond computation.

Heavy computation belongs on remote Linux compute nodes in the **Sovereign Air Fabric**. Those nodes may be physically owned/controlled by Mohamed and can continue booting, reconciling, restoring and rolling back without Vercel, GitHub Actions, hosted deployment APIs or package registries after required materials are deliberately seeded.

The target is not magical independence from physics or every supplier in civilization. The falsifiable sovereignty target is:

> No single hosted company control plane is required for UberBond to boot, preserve state, execute an admitted workload, deploy an authorized release, recover, restore or roll back.

## Current source path

Merged source includes:

- sovereign Docker/Postgres/web/worker runtime;
- signed monotonic offline releases;
- separate release signer authority;
- local release courier/inbox;
- independent systemd reconciliation;
- backup, restore and rollback;
- source/dependency/OCI preservation kits;
- local/offline model worker path;
- founder console and bounded private-network gateway;
- PR #641 Sovereign Air Cockpit: owner-controlled WireGuard transport from founder device to the bounded founder gateway.

PR #641 merged at `5d489e44b4a6d25084a08abad1a7a9161ad60394`.

## Founder-device boundary

The Air Cockpit transport:

- keeps the main UberBond application on its existing loopback/private bind;
- exposes only the hardened founder gateway on the private WireGuard address;
- does not use a hosted tunnel or public SaaS control plane;
- stores the WireGuard client profile owner-only and does not intentionally print its private key;
- makes the founder gateway depend on the WireGuard interface at boot;
- keeps release-signing private authority off the runtime host;
- treats CGNAT/public packet reachability as a real network gate rather than pretending software can create connectivity from nothing.

The existing founder gateway continues to enforce its own bearer-auth, bounded-route and no-private-vault/no-effect-authority laws.

## Runtime topology

Preferred minimum:

1. **Remote authoring/control node** — finite-completion loop, local model bridge, verifier/promoter separation and founder console.
2. **Remote runtime node** — Postgres, web, workers, durable scheduler, admitted release state and independent recovery supervisor.
3. **Separate release-signing authority** — private signing key never stored on runtime.
4. **Optional second owner-controlled node** — independent restore/cutover target and failure-domain redundancy.
5. **Founder iPad** — WireGuard client + browser cockpit only.

These roles can temporarily share physical hardware only where the existing authority rules permit it. Security-critical signer/verifier/custody boundaries must not be collapsed merely for convenience.

## Connectivity law

Direct private connectivity may use WireGuard and an owner-controlled routable endpoint. If a location is behind CGNAT, another owner-controlled routable node may act as rendezvous.

A commodity ISP or physical network path can still fail. That is a physical dependency, not permission to replace UberBond's sovereignty root with a hosted control plane. Long-term resilience should use multiple network/failure domains where justified.

## Real proof still required

Do not claim `SOVEREIGN_AIR_RUNTIME_VERIFIED` until an actual remote host executes and records:

`kit restore -> exact signed release -> courier -> admission -> Postgres/web/worker boot -> authenticated founder cockpit -> bounded durable job -> worker/web kill -> independent recovery -> backup -> restore drill -> failed promotion -> automatic rollback -> explicit rollback -> second-host/provider-loss path where declared`

The iPad must remain responsive during this proof because it is only a client. Its temperature/battery behavior is not a formal runtime metric, but no heavy server workload should execute on it by architecture.

## Cross-chat no-amputation law

A future session must not reinterpret "self-hosting" as "run UberBond on the iPad" or "deploy it to Vercel." Vercel and GitHub may remain optional development/transit/diagnostic suppliers, but they are not the terminal runtime or recovery root.

If Mohamed says UberBond should "run in the air," interpret that as the Sovereign Air Fabric: persistent remote owner-controlled compute with the iPad acting only as the founder cockpit, subject to exact-current repository/runtime evidence.

## Truth boundary

This document preserves intent and current source architecture. It does not prove a remote host presently exists, that WireGuard packet routing is configured, that a recovery drill has run, that there is no physical/vendor dependency anywhere in the supply chain, or that UberBond/ASI is complete. Current runtime receipts outrank this continuity file.