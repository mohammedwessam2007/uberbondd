// Manual, local-only entry point for one P2.2 shadow autonomy cycle. There is deliberately no
// GitHub Actions workflow or other scheduled trigger for this anywhere in the repository -- the
// safest way to "keep scheduled activation disabled" is to not build the activation mechanism
// yet. This script exists so a human can run one cycle on demand (e.g. `npm run autonomy-cycle`)
// against whatever STORE_BACKEND/DATABASE_URL is already configured, using real config validation.
//
// Safe by default: with no INBOUND_* env vars set, config.inbound.enabled is false, so this
// completes a real cycle (creates the singleton row, records a completed run, writes a digest)
// without ever attempting network access or requiring a mailbox reader. Enabling real Gmail
// polling requires deliberately setting INBOUND_ENABLED=true and INBOUND_GMAIL_READ_ENABLED=true
// (see src/config.mjs), owning valid INBOUND_GOOGLE_* credentials, and having at least one
// owner-approved active account in the inboundAccounts repository -- this script does not create
// any of those on its own, and fails closed (a bounded, owner-visible bootstrapReason, not a
// crash) at whichever of those conditions is first unmet.
import crypto from 'node:crypto';
import { config } from '../src/config.mjs';
import { createStore } from '../src/store.mjs';
import { runAutonomyCycle } from '../src/autonomy-cycle.mjs';
import { createInboundOnlyRuntime } from '../src/inbound-runtime.mjs';

const store = createStore(config);
await store.init();

const runKey = process.env.P22_RUN_KEY || `manual-${new Date().toISOString().slice(0, 10)}`;
const leaseOwner = process.env.P22_LEASE_OWNER || `manual:${process.pid}:${crypto.randomBytes(4).toString('hex')}`;

try {
  const bootstrap = await createInboundOnlyRuntime(config, { store });
  const result = await runAutonomyCycle({
    store, cfg: config, runKey, leaseOwner,
    mailboxReader: bootstrap.ok ? bootstrap.reader : null,
    accounts: bootstrap.ok ? bootstrap.accounts : []
  });
  console.log(JSON.stringify({
    ok: result.ok,
    reason: result.reason || null,
    bootstrapReason: bootstrap.ok ? null : bootstrap.reason,
    runKey: result.run?.runKey || runKey,
    status: result.run?.status || null,
    digest: result.digest || null
  }, null, 2));
  process.exitCode = result.ok ? 0 : 1;
} finally {
  await store.close?.();
}
