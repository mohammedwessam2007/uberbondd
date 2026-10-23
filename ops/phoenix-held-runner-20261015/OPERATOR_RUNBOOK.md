# PHOENIX N26 | Protected runner and one-writer operations (15 October 2026)

**Status:** independently source-admitted application, prepared OCI package. A successful source test is NOT a live Neon boot. This page is operational instruction for **Astra's protected provider controls**, not authorization to spend, send, merge, freeze, replay a database or cut over.

## Exact identities and immutable boundaries

- Source Git commit: `c1f9b4aac2278617cb0c9e04d14e29f0544dd701` (Astra's narrow admission #6193131151 / PR #1440 #6193131535).
- OCI build package: `ops/phoenix-held-runner-20261015/Dockerfile`, `entrypoint.sh` and `supervise.mjs` on isolated `high/phoenix-n26-protected-runner-package-20261015` branch; pin this branch's **full final SHA** before building. The Dockerfile independently fetches the exact approved source SHA from GitHub, verifies it, and installs production-locked Node dependencies. This never imports the helper's Python/PG backup source.
- Neon: project `misty-moon-35132124`, branch `br-orange-wave-baqrfil7`, DB `uberbond_phoenix_rehearsal_20261014_v2`, **verified direct** host `ep-soft-cake-baiahh8q.c-8.eu-central-1.aws.neon.tech`. Already nonempty, 57 tables, 1,270 rows, 20 migrations, six key-compatible accounts.
- Render source: `dpg-dali9dbl550s73bcf520-a`, public allowlist empty, expires **2026-10-16 23:22:29 UTC**; original snapshot observed **2026-10-15 06:23:09 UTC**. Later writer mutations are UNKNOWN.
- Render production app `srv-dali9vijnfac739m4vcg` old deployed source `24854739d70617d57807cde5407a84266cca477c`. **Not** an isolated runner. Free suspended backup helper `srv-db870egm7kps73daipi0` still uses Python `continuity.py`; it is not a runnable application host. Another suspended archive helper `srv-db78ug59fdbs73da4mrg` is not eligible either.
- **Provider identity of live OCI executor: UNASSIGNED**. Existing Render services are public web services; do not claim they provide a private container with CAP_NET_ADMIN. Use ONLY an already owned zero-incremental-cost private OCI runtime that demonstrably permits isolated bridge networking, IP firewall, native secret binding and no publicly published port. Otherwise raise an exact provider blocker. Do not create a paid runtime.
- **Cost:** package authoring and existing GitHub no-secret CI; **$0 incremental provider charge** claimed for these actions, not a promise that an as-yet-unassigned OCI host is free. OCI image digest must be recorded after build. Base `node:22.16.0-bookworm-slim` is tag-selected rather than immutable digest-pinned, so also record its resolved digest and approve it before sensitive runtime deployment.

## External dependency A: Neon **genuinely SELECT-only** role

The connected Neon role-creation attempt was blocked by a platform safety check. The retrieved handoff does not contain the exact rejection text or safety reason. **Do not retry it via generic SQL / different connector / privileged SQL workaround.** Neon Add Role UI exposed only Branch, Name, Create, no scoped grants. It cannot independently prove SELECT-only privileges. No role currently exists for this mission.

Obtain explicit provider-sanctioned Neon DBA/support action or a separately authorized human DBA path that can provision an initially **NOLOGIN, zero-inherited-privilege** role and prove restrictions **before enabling login**. Name exactly `phoenix_n26_ro_20261015`. This is an operator/Neon DBA transaction specification, **not a command for the safety-blocked assistant to execute**:

```sql
-- Execute only via a separately approved provider/qualified DBA path in v2.
-- NO PASSWORD in SQL files, query/history logs or this repository.
BEGIN;
CREATE ROLE phoenix_n26_ro_20261015 NOLOGIN NOINHERIT
  NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
REVOKE ALL PRIVILEGES ON DATABASE uberbond_phoenix_rehearsal_20261014_v2
  FROM phoenix_n26_ro_20261015;
REVOKE ALL PRIVILEGES ON SCHEMA public FROM phoenix_n26_ro_20261015;
REVOKE ALL PRIVILEGES ON ALL TABLES IN SCHEMA public FROM phoenix_n26_ro_20261015;
REVOKE ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public FROM phoenix_n26_ro_20261015;
GRANT CONNECT ON DATABASE uberbond_phoenix_rehearsal_20261014_v2
  TO phoenix_n26_ro_20261015;
GRANT USAGE ON SCHEMA public TO phoenix_n26_ro_20261015;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO phoenix_n26_ro_20261015;
ALTER ROLE phoenix_n26_ro_20261015 IN DATABASE uberbond_phoenix_rehearsal_20261014_v2
  SET default_transaction_read_only = on;
COMMIT;
```

**Provider/DBA validation before LOGIN:** Run a read-only permission matrix for all 57 restored tables, not just sample tables:

```sql
SELECT r.rolname, r.rolcanlogin, r.rolsuper, r.rolcreaterole,
       r.rolcreatedb, r.rolreplication, r.rolbypassrls, r.rolinherit,
       has_database_privilege(r.oid,'uberbond_phoenix_rehearsal_20261014_v2','CONNECT') AS can_connect,
       has_database_privilege(r.oid,'uberbond_phoenix_rehearsal_20261014_v2','CREATE') AS can_create_db,
       has_schema_privilege(r.oid,'public','USAGE') AS can_use_public,
       has_schema_privilege(r.oid,'public','CREATE') AS can_create_public,
       (SELECT count(*) FROM pg_auth_members WHERE member=r.oid) AS inherited_role_memberships,
       (SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
        WHERE n.nspname='public' AND c.relkind IN ('r','p')
          AND has_table_privilege(r.oid,c.oid,'SELECT')) AS selectable_tables,
       (SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
        WHERE n.nspname='public' AND c.relkind IN ('r','p')
          AND has_table_privilege(r.oid,c.oid,'INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')) AS writable_tables
FROM pg_roles r WHERE r.rolname='phoenix_n26_ro_20261015';
```

Accept only `rolcanlogin=false` **before credential activation**, all escalation flags false, `rolinherit=false`, memberships 0, CONNECT/USAGE true, CREATE flags false, selectable 57, writable 0. Independently verify sequence privileges, temporary-object/CREATE pathways and any RLS/public inherited grants. A role born with default write permissions, a login enabled before checks, or a failed permission matrix **must not be used**.

Only then set an independent random password using a provider's protected credential mechanism, enable LOGIN through that **approved** mechanism, and prove the real login in a read-only transaction with `current_user`, `transaction_read_only=on`, original strict-TLS verifier, and zero table-write grants. Never substitute the Neon database owner or copy the original Render source DSN. If the provider cannot support the ordering and evidence above, this is an **unresolved provider blocker**.

## External dependency B: qualified no-public-ingress OCI executor

Astra must identify and record the **exact existing account, provider, host/container resource ID, zero-added-cost entitlement and runtime network capability**; none is verified yet. Require all of: isolated private Docker/OCI runtime; `--network bridge` (NEVER host), `--cap-drop=ALL --cap-add=NET_ADMIN --cap-add=SETUID --cap-add=SETGID`, no published `-p` ports, `--read-only` root filesystem, bounded memory/CPU/PIDs and tmpfs; native account secret environment bindings; no broad production env group. Test iptables/ip6tables enforcement **with no secrets first**; inspect default DROP policy and counters. Disallow web services that may expose an app ingress or silently bypass container firewall.

After code/OCI digest review, build at **package commit exactly**, from the repository root:

```sh
git checkout --detach <EXACT_RUNNER_PACKAGE_COMMIT>
test "$(git rev-parse HEAD)" = '<EXACT_RUNNER_PACKAGE_COMMIT>'
docker build --pull -f ops/phoenix-held-runner-20261015/Dockerfile -t phoenix-n26-held:reviewed .
docker image inspect -f '{{.Id}}' phoenix-n26-held:reviewed
```

The immutable application source is fetched and checked **inside** the image. Tag/digest the fully built container. The following example invokes the **single bounded** entrypoint with sensitive values inherited only from the protected host secret facility. Do not insert literal keys or a DSN into shell history, CLI command strings, GitHub CI or logs:

```sh
docker run --rm --init --network bridge --cap-drop ALL \
  --cap-add NET_ADMIN --cap-add SETUID --cap-add SETGID \
  --security-opt no-new-privileges --read-only \
  --pids-limit 64 --memory 512m --cpus 1 \
  --tmpfs /tmp:rw,noexec,nosuid,size=16m \
  --env DATABASE_URL --env TOKEN_ENCRYPTION_KEY --env ADMIN_TOKEN \
  phoenix-n26-held:reviewed
```

**Exactly three protected bindings:** `DATABASE_URL` = temporary direct-host v2 SELECT-only login; `TOKEN_ENCRYPTION_KEY` = existing original production key by protected native binding only; `ADMIN_TOKEN` = independent temporary >=32-character token. No `WINNR_*`, model-provider, SMTP, IMAP, payments, source DB or whole production groups. The entrypoint constructs all other env values with hard-coded held settings and an explicit environment allowlist, pins resolved Neon IPv4 in `/etc/hosts`, defaults both IPv4/IPv6 outbound DROP, permits loopback and **only port 5432 to that exact direct DB IP**, runs as unprivileged node, rejects prohibited inherited runtime provider flags and scrubs unrelated variables before any application child process, and supervises actual app + original authenticated smoke with timeout/shutdown and redacted receipt. It never forwards secret values through command-line arguments. If restricted firewall or writable host pinning cannot be established, fail closed and **do not boot**.

Pass only if `PHOENIX_HELD_RUNNER_RECEIPT` contains actual authenticated health/summary, explicit source verifier admission, no unauthenticated summary/write/admin access; and `PHOENIX_EGRESS_POLICY` reports zero unauthorized packets. Require `PHOENIX_RUNNER_SUCCESS`, verified TLS, no provider/writer/migration/worker side effect evidence and the **actual immutable OCI image ID**. A denied outbound packet, runtime timeout, role mismatch, TLS failure, nonzero exit or unexpected startup log means **ABORT**; do not disable networking controls. Subprocess logs are deliberately suppressed, including any private row/account values. The runner prints only an allowlisted receipt and packet counters.

**Cleanup:** container exits/removed; ensure process group and application stopped; independently revoke login (`NOLOGIN`) immediately, terminate any lingering sessions using the sanctioned provider facility, revoke explicit SELECT/USAGE/CONNECT and DROP the mission-only role after dependency inspection; revoke the temporary token and DSN credential and unbind key reference from runtime (do not delete/rotate original key). Keep v2 and original intact. Evidence should show live process count 0, active role sessions 0, no temporary credentials bound and stable archive custody. If role cleanup fails, record exact provider blocker; never imply it was revoked.

## Separate source change assessment (read-only, not cutover)

Keep Render original `ipAllowList=[]`. Do **not** use an internet-connected credential or public wildcard allowlist. Only through an approved **private Render-network observer** with source **read-only** identity and original direct host, invoke:

```sh
PHOENIX_EXPECTED_DB=<original_source_db_name> PHOENIX_EXPECTED_HOST=<exact_private_source_host> \
  DATABASE_URL=<protected_direct_readonly_source_DSN> \
  node ops/phoenix-held-runner-20261015/assess-source-delta.mjs > source.sanitized.txt
```

Run the same private SELECT-only snapshot assessor on Neon v2 (`PHOENIX_EXPECTED_DB=uberbond_phoenix_rehearsal_20261014_v2` and exact pinned host) and compare **sanitized** receipts using `node ops/phoenix-held-runner-20261015/compare-snapshots.mjs v2.sanitized.txt source.sanitized.txt`. It computes per-table sorted SHA256 fingerprints *within memory only*, row counts, column/index/constraint digests and sequence values when SELECT privileges permit, inside repeatable-read read-only transactions. No private rows/credential strings in output. `sequencesChanged=UNKNOWN` means insufficient sequence grants and must remain a blocker. This comparison does not prove no writes after completion.

The historical source-archive delta (older Oct14 1,259 to Oct15 1,270 rows; audit_log +8, settings +1, worker_heartbeats +2, sender_health content changed) is **not** a post-Oct15 06:23 delta. Preserve it separately. Identify writer surfaces including Render production web+worker process, queue/scheduler jobs, external GitHub/Neon/Vercel processes; collect provider-backed writer session evidence using only sanctioned read-only monitoring, not higher privileges via workaround.

## **NOT AUTHORIZED** final-writer procedure (prepare only)

Independent authorization must name old writer/source, new **EMPTY** target, code/image SHA, quiescence operators, rollback timeout and one-writer flip. Stop/suspend every identified old writer *reversibly*, verify no active mutation sessions/jobs and zero sends, obtain one final **consistent** PG snapshot under private networking, restore into **a newly-created empty database** (NEVER existing v2), compare 57-table structure, every row digest, all sequences and role/extension constraints, verify six original-key account decodes and actual held app/API using separate limited role, then request a separately scoped cutover approval. Retain old DB, intact encrypted archives and tested rollback. Allow no simultaneous old/new production writers. If any new-side writes occur after flip, reconcile them before routing back. A held success never approves merge, live deployment, Winnr import or outbound campaign.
