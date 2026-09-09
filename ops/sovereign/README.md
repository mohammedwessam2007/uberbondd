# UberBond Sovereign Host

This control plane makes Vercel, GitHub, package registries and hosted deployment APIs optional after the required source/dependency materials have been deliberately seeded onto infrastructure the owner controls.

It does **not** claim independence from electricity, networking, hardware failure, Linux, Docker, or the physical supply chain. The sovereignty claim is narrower and falsifiable: no hosted company control plane is required for an admitted UberBond release to boot, run, restart, reconcile, restore or roll back.

## Architecture

- **Runtime plane:** Docker Compose runs Postgres, migration, web and worker containers from images already loaded on the host.
- **Recovery plane:** a systemd timer lives outside the UberBond process and reconciles the exact admitted image identities every minute.
- **Release authority:** the signing private key lives on a separate authoring/offline machine. Runtime receives only the public key.
- **Release transport:** a signed directory containing `release.env`, `SHA256SUMS`, `release.sig` and `images.oci.tar`. USB, LAN copy, removable disk or any other owner-approved byte transport can carry it.
- **Promotion:** checksum + signature + monotonic sequence + immutable image IDs -> pre-migration backup -> migration -> health checks -> state commit.
- **Failure:** failed promotion restores the pre-migration DB and previous exact image. Explicit rollback first snapshots the current DB, making the rollback itself reversible.
- **Automatic update:** dropping a signed release under the local inbox and atomically writing its directory name to `NEXT_RELEASE` triggers the same admission path. No cloud webhook is involved.

## 1. Create release authority off the runtime host

On a separate trusted Linux authoring/offline machine:

```sh
./ops/sovereign/init-release-authority.sh
```

Keep `release-private.pem` off every runtime host. Copy only `release-public.pem` to removable media or another owner-controlled path for runtime installation.

## 2. Seed the authoring machine deliberately

A sovereign release build performs no network access. Before packing, the authoring machine must already have:

- the repository at the exact source commit;
- a dependency tree in `node_modules` that satisfies `npm ls --all`;
- the `mcr.microsoft.com/playwright:v1.61.1-noble` image locally;
- the selected Postgres image, default `postgres:16-alpine`, locally;
- Docker, Node.js, npm, Git, OpenSSL and standard POSIX tools installed locally.

Those bytes may initially come from the normal software supply chain. For continued operation, preserve them on owner-controlled storage. A future dependency refresh is a deliberate supply-chain event, not something production silently downloads.

## 3. Pack an offline signed release

From a clean exact source checkout on the authoring machine:

```sh
export UBERBOND_RELEASE_SIGNING_KEY="$HOME/.config/uberbond-release/release-private.pem"
./ops/sovereign/uberbondctl pack .
```

Packing fails closed unless syntax and the deterministic suite pass. The image build uses `--network=none --pull=false` and `Dockerfile.sovereign`. The resulting bundle contains the app and Postgres OCI images, exact source commit, monotonic release sequence, immutable image IDs, checksums and signature.

## 4. Install a runtime host

On an owner-controlled Linux host with Docker Compose v2 and systemd:

```sh
sudo ./ops/sovereign/install-host.sh /path/to/release-public.pem
```

The bootstrap generates local runtime secrets, binds web to `127.0.0.1`, and leaves outbound/autopilot effects disabled. It never installs a release private key and never downloads an application release.

Review `/etc/uberbond/uberbond.env` before any external activation. PayPal, public exposure, outbound messaging and other consequence-bearing capabilities remain separate authority gates.

## 5. Deploy without a hosted control plane

Transfer the signed release directory onto the runtime host, then either deploy explicitly:

```sh
sudo /opt/uberbond/control/uberbondctl deploy /path/to/signed-release
```

or copy it under `/var/lib/uberbond-control/inbox/<safe-name>` and atomically write `<safe-name>` to:

```text
/var/lib/uberbond-control/inbox/NEXT_RELEASE
```

The systemd path unit applies it automatically. An old signed bundle cannot replace a newer admitted sequence through the normal promotion path.

## 6. Prove recovery instead of assuming it

After the first successful deployment, all of the following must be executed on the real host before runtime sovereignty is called proven.

```sh
sudo /opt/uberbond/control/uberbondctl status
sudo /opt/uberbond/control/uberbondctl backup
sudo /opt/uberbond/control/uberbondctl restore-drill
```

Then test process loss:

```sh
docker kill uberbond-web
```

The independent systemd reconciler must restore the exact admitted web image without downloading anything. Repeat for the worker. Observe `systemctl status uberbond-reconcile.timer` and the service journal.

A release with a deliberately failing health check must be rejected and must restore the previous DB/application state. Finally test explicit rollback:

```sh
sudo /opt/uberbond/control/uberbondctl rollback
```

and verify the previous exact source/image identity is active. A second rollback must be able to return to the snapshot taken immediately before the first rollback.

## 7. Preserve source without GitHub

Keep at least one owner-controlled full Git bundle or bare mirror in addition to ordinary working copies:

```sh
git bundle create uberbond-source.bundle --all
git bundle verify uberbond-source.bundle
```

Store its checksum beside it and rehearse cloning from the bundle on an offline machine. GitHub can remain a convenient collaboration transport, but loss of GitHub must not mean loss of source history.

## 8. Preserve the build supply

Keep offline copies of:

- the full source Git bundle;
- release-authority public key and separately protected private key;
- known-good release bundles;
- OCI base/Postgres images needed to create future releases;
- a known-good dependency seed matching `package-lock.json`;
- encrypted database backups plus their checksums;
- this runbook and the host installer.

Do not keep decryption/signing keys beside the only copy of the encrypted material they protect.

## 9. Optional second owned host

For stronger failure tolerance, maintain a second personally controlled Linux machine with the same public release key and preloaded known-good release images. Periodically rehearse database restore and cutover there. The second host is useful only after a real restore/cutover drill; a powered-off box containing untested files is not redundancy.

## Truth boundary

Source completion means the mechanisms and hostile tests exist. Runtime sovereignty requires observed real-host receipts for pack, signed deploy, durable database persistence, crash/restart reconciliation, restore, failed-promotion rollback and explicit rollback. Customer, revenue, provider, payment and long-horizon life outcomes remain external reality and are never manufactured by this control plane.
