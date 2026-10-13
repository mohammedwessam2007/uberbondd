#!/usr/bin/env node
// Winnr Startup fleet integration runner.
//
// Phases, in order: read -> export -> validate -> register -> import -> probe-smtp -> probe-imap -> pilot-check -> receipt
//
//   read        Authenticated provider reads (account, all domains, all mailboxes). Snapshots the pilot.
//   export      Winnr documented POST /export, scoped to the Startup domains by name (never all-domains, so the pilot
//               credentials are never requested). Downloads the CSV into the private workdir.
//   validate    Cross-checks every CSV row against the provider record: domain, address, active status, host, port.
//   register    Ownership-classified registry plan for every domain, applied to the store (idempotent).
//   import      Encrypts credentials with the selected key and stores accounts. SMTP accounts start paused under the
//               probe's own reason, so none is selectable until a fresh authenticated probe passes.
//   probe-smtp  No-send SMTP readiness: TLS, EHLO, AUTH, NOOP, QUIT. Never MAIL FROM, RCPT TO or DATA.
//   probe-imap  Login-only IMAP check: LOGIN, LOGOUT. Never SELECT, SEARCH or FETCH.
//   pilot-check Re-reads the pilot from the provider and compares it with the read-phase snapshot.
//   receipt     Writes a committable receipt built only by toPublicFleetReceipt: counts and fixed class names. Per-account
//               rows, digests, provider ids and error messages stay in the private workdir and are never published.
//
// Output discipline: each phase result is checked by the artifact guard before it is printed, and a failing result
// prints a fixed refusal code instead. Errors print a class code; the message goes to the private workdir.
//
// Secrets (export CSV, key material, provider id map, provider snapshot, store) live only in --workdir. The workdir
// and any staging key file must be outside this repository. Nothing here sends mail, buys anything, enables paid
// warming, changes DNS or deploys.
//
// Usage:
//   NODE_USE_ENV_PROXY=1 node scripts/winnr-fleet-integration.mjs --workdir=<outside repo> \
//     --staging-key-file=<outside repo> --phases=read,export,validate,register,import,probe-smtp,probe-imap,pilot-check
//   node scripts/winnr-fleet-integration.mjs --workdir=<outside repo> --phases=receipt --receipt-out=winnr/receipts/<file>.json
//
// --key-source=env uses TOKEN_ENCRYPTION_KEY (the production key, only in a trusted runtime where it already exists).
// It also requires --store-dir for the production store. The default --key-source=staging-file is isolated testing only.

import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { createWinnrApiClient } from '../src/uberwinnr-adapter.mjs';
import {
  inspectWinnrCredentialExport, compileWinnrCredentialImport, winnrCredentialRows
} from '../src/uberwinnr-credential-import.mjs';
import { compileWinnrPostPurchaseFleetPlan, applyWinnrPostPurchaseFleetPlan } from '../src/uberwinnr-postpurchase.mjs';
import { runWinnrSmtpReadinessProbe, SMTP_PROBE_FAILURE_PAUSE_REASON } from '../src/winnr-smtp-readiness.mjs';
import { probeWinnrImapLoginOnly } from '../src/winnr-imap-login-probe.mjs';
import { JsonStore } from '../src/store.mjs';
import net from 'node:net';
import { writeFileSync } from 'node:fs';
import {
  reconcileWinnrFleet, assertCompleteListing, assertProviderSchema, assertExportAuthority, verifyStoreKeyCompatibility,
  assertRunnerEnvironment, stageImportedAccounts, boundedMap, selectAccountsToProbe
} from '../src/winnr-fleet-control-plane.mjs';
import { createStore } from '../src/store.mjs';
import { parseExpectedInventory, gateCsvInventory, gateProviderInventory, gateCsvAgainstProvider } from '../src/winnr-inventory-gate.mjs';
import { assertPublicSafe, sanitizedErrorCode } from '../src/winnr-public-artifact-guard.mjs';
import { toPublicFleetReceipt } from '../src/winnr-public-receipt.mjs';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const OWNER_ATTESTATION_REF = 'owner-mission:UBERBOND_WINNR_FLEET_FINAL_INTEGRATION_2026-10-13';
// Public form of the same attestation. The receipt carries this fixed descriptor, never the long reference string.
const OWNER_ATTESTATION = Object.freeze({ kind: 'owner-mission', mission: 'UBERBOND_WINNR_FLEET_FINAL_INTEGRATION', dated: '2026-10-13' });
const ATTESTED_REGISTRAR = 'godaddy';
const WORKSPACE_ID = 'uberbond-outreach';
const PILOT_TAG = 'pre-warmed';
const IMAP_CONCURRENCY = 4;
const KEY_LABEL = Object.freeze({
  staging: 'STAGING_ISOLATED_NOT_PRODUCTION_COMPATIBLE',
  env: 'PRODUCTION_KEY_FROM_TOKEN_ENCRYPTION_KEY'
});

const digest = value => crypto.createHash('sha256').update(String(value ?? '')).digest('hex').slice(0, 16);
const isHexKey = value => /^[a-f0-9]{64}$/i.test(String(value || ''));
const countBy = (items, pick) => items.reduce((acc, item) => {
  const key = String(pick(item) ?? 'NONE');
  acc[key] = (acc[key] || 0) + 1;
  return acc;
}, {});

function parseArgs(argv) {
  const args = { phases: [], keySource: 'staging-file', storeBackend: 'json', authMode: 'proxy-injected' };
  for (const arg of argv) {
    const [flag, ...rest] = arg.replace(/^--/, '').split('=');
    const value = rest.join('=');
    if (flag === 'phases') args.phases = value.split(',').map(s => s.trim()).filter(Boolean);
    else if (flag === 'workdir') args.workdir = value;
    else if (flag === 'staging-key-file') args.stagingKeyFile = value;
    else if (flag === 'key-source') args.keySource = value;
    else if (flag === 'store-dir') args.storeDir = value;
    else if (flag === 'store-backend') args.storeBackend = value;
    else if (flag === 'auth-mode') args.authMode = value;
    else if (flag === 'receipt-out') args.receiptOut = value;
    else throw new Error(`unknown argument: --${flag}`);
  }
  if (!args.workdir) throw new Error('--workdir is required');
  if (!['staging-file', 'env'].includes(args.keySource)) throw new Error('--key-source must be staging-file or env');
  if (args.phases.length === 0) throw new Error('--phases is required');
  return args;
}

function assertOutsideRepo(label, target) {
  const resolved = path.resolve(target);
  if (resolved === REPO_ROOT || resolved.startsWith(REPO_ROOT + path.sep)) {
    throw new Error(`${label} must be outside the repository`);
  }
  return resolved;
}

async function writePrivate(file, text) {
  await fs.mkdir(path.dirname(file), { recursive: true, mode: 0o700 });
  await fs.writeFile(file, text, { mode: 0o600 });
}

async function readJson(file) {
  return JSON.parse(await fs.readFile(file, 'utf8'));
}

// proxy-injected: the sandbox egress proxy attaches the credential. bearer: a WINNR_API_TOKEN secret in a runtime
// without the proxy. The token is read from the environment, never printed, and must be a wnr_ token.
function winnrClient(authMode = 'proxy-injected') {
  const client = createWinnrApiClient({
    authMode,
    token: authMode === 'bearer' ? (process.env.WINNR_API_TOKEN || '') : '',
    authorized: true,
    termsCompatible: true,
    evidenceRef: OWNER_ATTESTATION_REF,
    fetchImpl: globalThis.fetch
  });
  if (!client.ok) throw new Error(`winnr client refused: ${client.reasonCodes.join(',')}`);
  return client;
}

// Whole-account list reads. Refuses a partial set so a truncated page can never look like a complete fleet.
async function readAccountSet(api) {
  const [account, domains, mailboxes] = await Promise.all([api.getAccount(), api.listAllDomains(), api.listAllMailboxes()]);
  for (const [label, result] of [['account', account], ['domains', domains], ['mailboxes', mailboxes]]) {
    if (!result.ok) throw new Error(`provider ${label} read failed: ${result.status} ${result.reasonCodes?.join(',')}`);
  }
  for (const [label, result] of [['domains', domains], ['mailboxes', mailboxes]]) {
    const complete = assertCompleteListing(result, label);
    if (!complete.ok) throw new Error(`refusing partial fleet view: ${complete.reasonCodes.join(',')}`);
  }
  const schema = assertProviderSchema({ domains: domains.data, mailboxes: mailboxes.data });
  if (!schema.ok) throw new Error(`provider schema drift: ${schema.reasonCodes.slice(0, 5).join(',')}`);
  return { account: account.data, domains: domains.data, mailboxes: mailboxes.data };
}

function splitFleet(snapshot) {
  const pilotDomains = snapshot.domains.filter(d => (d.tags || []).includes(PILOT_TAG));
  const startupDomains = snapshot.domains.filter(d => !(d.tags || []).includes(PILOT_TAG));
  const pilotNames = new Set(pilotDomains.map(d => d.name));
  return {
    pilotDomains,
    startupDomains,
    pilotMailboxes: snapshot.mailboxes.filter(m => pilotNames.has(m.domain)),
    startupMailboxes: snapshot.mailboxes.filter(m => !pilotNames.has(m.domain))
  };
}

async function loadEncryptionKey(ctx) {
  if (ctx.keySource === 'env') {
    const value = process.env.TOKEN_ENCRYPTION_KEY || '';
    if (!isHexKey(value)) throw new Error('TOKEN_ENCRYPTION_KEY is not set to a 64-character hex key in this runtime');
    return { hex: value, label: KEY_LABEL.env };
  }
  const file = ctx.stagingKeyFile;
  let hex;
  try {
    hex = (await fs.readFile(file, 'utf8')).trim();
  } catch {
    hex = crypto.randomBytes(32).toString('hex');
    await writePrivate(file, `${hex}\n`);
  }
  if (!isHexKey(hex)) throw new Error('staging key file does not hold a 64-character hex key');
  return { hex, label: KEY_LABEL.staging };
}

// json: the isolated file store under the workdir. postgres: the production store, reached only through DATABASE_URL in
// a trusted runtime. The same store interface is used either way.
async function openStore(ctx) {
  if (ctx.storeBackend === 'postgres') {
    const store = createStore({ storeBackend: 'postgres', databaseUrl: process.env.DATABASE_URL || '', databaseSsl: String(process.env.DATABASE_SSL || '').toLowerCase() === 'true' });
    await store.init();
    return store;
  }
  const store = new JsonStore(ctx.storeDir);
  await store.init();
  return store;
}

function tcpReachability(host, port, timeoutMs) {
  return new Promise(resolve => {
    const socket = net.connect({ host, port });
    const finish = outcome => { socket.destroy(); resolve(outcome); };
    const timer = setTimeout(() => finish('CONNECT_TIMEOUT'), timeoutMs);
    socket.once('connect', () => { clearTimeout(timer); finish('TCP_CONNECTED'); });
    socket.once('error', error => { clearTimeout(timer); finish(String(error?.code || 'ERROR').replace(/[^A-Z0-9_]/g, '_')); });
  });
}

const phases = {
  async read(ctx) {
    const snapshot = await readAccountSet(winnrClient(ctx.authMode));
    const fleet = splitFleet(snapshot);
    const takenSnapshot = JSON.stringify({ takenAt: new Date().toISOString(), ...snapshot });
    // The pilot baseline is write-once. A later read refreshes the current snapshot but never replaces the baseline that
    // pilot-check compares against, so a change between two reads cannot be hidden by re-baselining.
    try { await fs.access(ctx.file('provider-snapshot-baseline.json')); } catch { await writePrivate(ctx.file('provider-snapshot-baseline.json'), takenSnapshot); }
    await writePrivate(ctx.file('provider-snapshot.json'), takenSnapshot);
    return {
      plan: snapshot.account.plan,
      providerSeatsUsed: snapshot.account.email_users_used,
      providerSeatsLimit: snapshot.account.email_users_limit,
      stripeSubscriptionStatus: snapshot.account.stripe_subscription_status,
      prewarmedSubscriptionStatus: snapshot.account.prewarmed_subscription_status,
      grantedScopes: snapshot.account.api_token?.permissions || [],
      startupDomains: fleet.startupDomains.length,
      startupDomainsDnsHealthy: fleet.startupDomains.filter(d => d.dns_health?.status === 'healthy').length,
      startupDomainsRegistrarExternal: fleet.startupDomains.filter(d => d.registrar === 'external').length,
      startupDomainsPrewarmedTagged: fleet.startupDomains.filter(d => (d.tags || []).includes(PILOT_TAG)).length,
      startupAccounts: fleet.startupMailboxes.length,
      startupAccountsActive: fleet.startupMailboxes.filter(m => m.status === 'active').length,
      pilotDomains: fleet.pilotDomains.length,
      pilotAccounts: fleet.pilotMailboxes.length,
      pilotAccountsActive: fleet.pilotMailboxes.filter(m => m.status === 'active').length
    };
  },

  async export(ctx) {
    const snapshot = await readJson(ctx.file('provider-snapshot.json'));
    const fleet = splitFleet(snapshot);
    const authority = assertExportAuthority({ permissions: snapshot.account?.api_token?.permissions });
    if (!authority.ok) return { exportStatus: 'REFUSED_BEFORE_PROVIDER_CALL', reasonCodes: authority.reasonCodes };
    // The expected inventory names customer domains, so it arrives only as a runtime secret. The provider must match it
    // exactly before any export request is made.
    const expected = parseExpectedInventory(process.env.WINNR_EXPECTED_INVENTORY_JSON || '');
    if (!expected.ok) return { exportStatus: 'REFUSED_BEFORE_PROVIDER_CALL', reasonCodes: expected.reasonCodes };
    const providerGate = gateProviderInventory({ expected, providerDomains: snapshot.domains, providerMailboxes: snapshot.mailboxes });
    if (!providerGate.ok) return { exportStatus: 'REFUSED_BEFORE_PROVIDER_CALL', reasonCodes: providerGate.reasonCodes };
    const requested = fleet.startupDomains.map(d => d.name).sort();
    if (requested.length !== 10) return { exportStatus: 'REFUSED_BEFORE_PROVIDER_CALL', reasonCodes: ['startup-domain-count-not-10'] };
    const api = winnrClient(ctx.authMode);
    const exported = await api.exportMailboxes({ format: 'default', domains: requested, writeAuthorized: true });
    if (!exported.ok) return { exportStatus: exported.status, reasonCodes: exported.reasonCodes || [] };
    let download;
    try {
      download = await fetch(exported.data.download_url);
    } catch (error) {
      // The download URL is a presigned link. Its text is never read, printed or stored.
      return { exportStatus: exported.status, downloadStatus: 'DOWNLOAD_TRANSPORT_FAILED', errorClass: sanitizedErrorCode(error) };
    }
    if (!download.ok) return { exportStatus: exported.status, downloadHttpStatus: download.status };
    const csv = await download.text();
    // Gate in memory first. An export that fails the inventory check is never written to disk.
    let rows;
    try {
      rows = winnrCredentialRows(csv);
    } catch {
      return { exportStatus: exported.status, reasonCodes: ['credential-export-unreadable'] };
    }
    const csvGate = gateCsvInventory({ expected, rows });
    const crossGate = gateCsvAgainstProvider({ rows, providerMailboxes: snapshot.mailboxes, expected });
    const gateReasons = [...new Set([...csvGate.reasonCodes, ...crossGate.reasonCodes])];
    if (!csvGate.ok || !crossGate.ok) return { exportStatus: exported.status, inventoryGatePassed: false, reasonCodes: gateReasons };
    await writePrivate(ctx.file('creds-export.csv'), csv);
    const inspection = inspectWinnrCredentialExport(csv);
    const requestedSet = new Set(requested);
    return {
      exportStatus: exported.status,
      inventoryGatePassed: true,
      requestedDomains: requested.length,
      providerReportedCount: exported.data.count,
      skippedCount: exported.data.skipped_count,
      downloadHttpStatus: download.status,
      csvRows: inspection.rowCount,
      csvDomains: inspection.domains.length,
      csvDomainsAllRequested: inspection.domains.every(d => requestedSet.has(d)),
      pilotRowsInExport: inspection.rows.filter(r => r.domain && !requestedSet.has(r.domain)).length,
      credentialsReturned: false
    };
  },

  async validate(ctx) {
    const snapshot = await readJson(ctx.file('provider-snapshot.json'));
    const fleet = splitFleet(snapshot);
    const csv = await fs.readFile(ctx.file('creds-export.csv'), 'utf8');
    const rows = winnrCredentialRows(csv);
    const inspection = inspectWinnrCredentialExport(csv);
    const providerMailboxByAddress = new Map(snapshot.mailboxes.map(m => [String(m.full_address || '').toLowerCase(), m]));
    const providerDomainByName = new Map(fleet.startupDomains.map(d => [d.name, d]));
    const mismatches = {};
    const note = (reason) => { mismatches[reason] = (mismatches[reason] || 0) + 1; };
    const providerMailboxIdsByEmail = {};
    const providerDomainIdsByDomain = {};
    const providerDomainRecordsByDomain = {};

    for (const row of rows) {
      const email = String(row.from_email || '').toLowerCase();
      const domain = String(email.split('@')[1] || '');
      const provider = providerMailboxByAddress.get(email);
      if (!provider) { note('address-not-in-provider-list'); continue; }
      if (provider.domain !== domain) note('provider-domain-differs');
      if (provider.status !== 'active') note('provider-status-not-active');
      if (String(row.smtp_host || '').toLowerCase() !== String(provider.smtp_host || '').toLowerCase()) note('smtp-host-differs');
      if (String(row.smtp_port) !== String(provider.smtp_port)) note('smtp-port-differs');
      if (String(row.imap_host || '').toLowerCase() !== String(provider.imap_host || '').toLowerCase()) note('imap-host-differs');
      if (String(row.imap_port) !== String(provider.imap_port)) note('imap-port-differs');
      if (String(row.user_name || '').toLowerCase() !== email) note('username-not-address');
      providerMailboxIdsByEmail[email] = provider.id;
    }
    for (const domain of inspection.domains) {
      const record = providerDomainByName.get(domain);
      if (!record) { note('domain-not-in-provider-startup-set'); continue; }
      providerDomainIdsByDomain[domain] = record.id;
      providerDomainRecordsByDomain[domain] = { name: record.name, tags: record.tags || [], registrar: record.registrar, dns_provider: record.dns_provider };
    }
    const crossCheckedRows = rows.length - Object.values(mismatches).reduce((a, b) => a + b, 0);
    const providerIds = { providerMailboxIdsByEmail, providerDomainIdsByDomain, providerDomainRecordsByDomain };
    await writePrivate(ctx.file('provider-ids.json'), JSON.stringify(providerIds));
    return {
      csvRows: rows.length,
      domainColumnMismatches: inspection.mismatchedDomainRowCount,
      crossCheckedRows,
      crossCheckMismatchReasons: mismatches,
      domainsReconciledToProvider: Object.keys(providerDomainIdsByDomain).length,
      credentialFieldRows: rows.filter(r => r.password).length,
      imapCredentialFieldRows: rows.filter(r => r.imap_password).length
    };
  },

  async register(ctx) {
    const csv = await fs.readFile(ctx.file('creds-export.csv'), 'utf8');
    const ids = await readJson(ctx.file('provider-ids.json'));
    const plan = compileWinnrPostPurchaseFleetPlan({
      csvText: csv,
      workspaceId: WORKSPACE_ID,
      providerDomainIdsByDomain: ids.providerDomainIdsByDomain,
      providerDomainRecordsByDomain: ids.providerDomainRecordsByDomain,
      providerMailboxIdsByEmail: ids.providerMailboxIdsByEmail,
      ownerAttestedRegistrar: ATTESTED_REGISTRAR,
      ownerAttestationRef: OWNER_ATTESTATION_REF,
      excludedDomains: (await readJson(ctx.file('provider-snapshot.json'))).domains
        .filter(d => (d.tags || []).includes(PILOT_TAG)).map(d => d.name),
      plannedDailyCap: 2
    });
    if (!plan.ok) return { planStatus: plan.status, reasonCodes: plan.reasonCodes, failedDomainOrdinal: plan.failedDomain ? 'see-private-plan' : null };
    await writePrivate(ctx.file('fleet-plan.json'), JSON.stringify(plan));
    const store = await openStore(ctx);
    const applied = await applyWinnrPostPurchaseFleetPlan({ store, fleetPlan: plan, date: new Date() });
    return {
      planStatus: plan.status,
      domainCount: plan.domainCount,
      accountCount: plan.mailboxCount,
      ownershipStatusCounts: countBy(plan.domainPlans, p => p.domain.ownershipStatus),
      classificationCounts: countBy(plan.domainPlans, p => p.domain.classification),
      prewarmedRegistrations: plan.domainPlans.filter(p => p.domain.classification === 'WINNR_PREWARMED_LEASED').length,
      applyStatus: applied.status,
      eventsWritten: applied.eventsWritten ?? 0,
      applyReasonCodes: applied.reasonCodes || []
    };
  },

  async import(ctx) {
    const csv = await fs.readFile(ctx.file('creds-export.csv'), 'utf8');
    const plan = await readJson(ctx.file('fleet-plan.json'));
    const key = await loadEncryptionKey(ctx);
    const compiled = compileWinnrCredentialImport({
      csvText: csv,
      encryptionKey: key.hex,
      workspaceId: WORKSPACE_ID,
      linksByEmail: plan.linksByEmail,
      routeEvidenceRef: OWNER_ATTESTATION_REF,
      routeAuthorized: true,
      termsCompatible: true,
      plannedDailyCap: 2,
      plannedHourlyCap: 1,
      minGapSeconds: 900
    });
    const store = await openStore(ctx);
    const compatibility = verifyStoreKeyCompatibility({ accounts: await store.list('accounts'), encryptionKey: key.hex });
    if (!compatibility.ok) return { encryptionKeyLabel: key.label, importStatus: 'IMPORT_REFUSED', reasonCodes: compatibility.reasonCodes, undecryptableExisting: compatibility.undecryptable, plaintextCredentialReturned: false };
    // Pause-then-store ordering lives in stageImportedAccounts, so an interrupted import cannot leave a live, unprobed sender.
    const { smtpStaged, imapStaged } = await stageImportedAccounts({ store, prepared: compiled.prepared, pauseReason: SMTP_PROBE_FAILURE_PAUSE_REASON });
    const smtpStored = smtpStaged;
    const imapStored = imapStaged;
    return {
      encryptionKeyLabel: key.label,
      productionCompatible: key.label === KEY_LABEL.env,
      importStatus: compiled.status,
      inputRowCount: compiled.inputRowCount,
      preparedCount: compiled.preparedCount,
      failureCount: compiled.failureCount,
      failureReasonCounts: countBy(compiled.failures.flatMap(f => f.reasonCodes), r => r),
      smtpAccountsStored: smtpStored,
      imapAccountsStored: imapStored,
      pendingSmtpProbePauses: smtpStored,
      plaintextCredentialReturned: false
    };
  },

  async 'probe-smtp'(ctx) {
    const store = await openStore(ctx);
    const key = await loadEncryptionKey(ctx);
    const receipt = await runWinnrSmtpReadinessProbe({
      store,
      encryptionKey: key.hex,
      quarantineOrdinalsText: '',
      quarantineSlotsText: '',
      now: new Date()
    });
    // Per-account rows, with their digests, are private. Only the aggregates below are printed or published.
    await writePrivate(ctx.file('smtp-probe-detail.json'), JSON.stringify((receipt.results || []).map(r => ({ slotDigest: r.slotDigest, classification: r.classification, errorClass: r.errorClass || null, errorStage: r.errorStage || null, providerCallState: r.providerCallState }))));
    return {
      encryptionKeyLabel: key.label,
      status: receipt.status,
      accountCount: receipt.accountCount,
      checkedAccounts: receipt.checkedAccounts,
      readyAccounts: receipt.readyAccounts,
      failedAccounts: receipt.failedAccounts,
      providerContactedAccounts: receipt.providerContactedAccounts,
      providerCallsComplete: receipt.providerCallsComplete,
      classificationCounts: countBy(receipt.results || [], r => r.classification),
      errorClassCounts: countBy((receipt.results || []).filter(r => r.evaluated), r => r.errorClass || (r.confirmed ? 'NONE' : 'UNCLASSIFIED')),
      messagesSent: 0,
      mailFromIssued: false,
      recipientsIssued: 0,
      dataIssued: false,
      perAccountDetail: 'WORKDIR_PRIVATE'
    };
  },

  // Bounded-concurrency login-only IMAP checks. Each result is checkpointed to the private workdir as it completes,
  // so an interruption keeps finished work. A rerun probes only accounts without a fresh checkpointed result.
  async 'probe-imap'(ctx) {
    const store = await openStore(ctx);
    const key = await loadEncryptionKey(ctx);
    const accounts = (await store.list('accounts'))
      .filter(a => a?.provider === 'imap-forwarding' && String(a?.slot || '').startsWith('winnr-imap:'))
      .sort((a, b) => String(a.id || '').localeCompare(String(b.id || '')));
    const checkpointFile = ctx.file('imap-checkpoint.json');
    let checkpoint = {};
    try { checkpoint = JSON.parse(await fs.readFile(checkpointFile, 'utf8')); } catch { checkpoint = {}; }
    const toProbe = new Set(selectAccountsToProbe({ accountSlots: accounts.map(a => a.slot), checkpoint, now: new Date() }));
    const resumedFromCheckpoint = accounts.filter(a => checkpoint[a.slot] && !toProbe.has(a.slot)).length;
    const todo = accounts.filter(a => toProbe.has(a.slot));
    await boundedMap(todo, IMAP_CONCURRENCY, async account => {
      const result = await probeWinnrImapLoginOnly({ account, encryptionKey: key.hex, timeoutMs: 10000 });
      const row = {
        checkedAt: new Date().toISOString(),
        classification: result.classification,
        stage: result.stage || null,
        errorClass: result.errorClass || null,
        responseCode: result.responseCode || null,
        connectAttempted: result.connectAttempted === true,
        loginAttempted: result.loginAttempted === true,
        loginAccepted: result.loginAccepted === true
      };
      checkpoint[account.slot] = row;
      writeFileSync(checkpointFile, JSON.stringify(checkpoint), { mode: 0o600 });
      await store.log('winnr_imap_login_probe_result', { slotDigest: digest(account.slot), ...row, mailboxSelected: false, messageContentRead: false, credentialsLogged: false });
      return row;
    });
    const perAccount = accounts.map(a => {
      const row = checkpoint[a.slot];
      return {
        slotDigest: digest(a.slot),
        classification: row ? row.classification : 'UNTESTED',
        stage: row?.stage ?? null,
        errorClass: row?.errorClass ?? null,
        responseCode: row?.responseCode ?? null,
        connectAttempted: row?.connectAttempted === true,
        loginAttempted: row?.loginAttempted === true,
        loginAccepted: row?.loginAccepted === true,
        checkedAt: row?.checkedAt ?? null,
        mailboxSelected: false,
        messageContentRead: false
      };
    });
    const receipt = {
      schemaVersion: 'uberbond.winnr-imap-login-probe-run.v2',
      checkedAt: new Date().toISOString(),
      encryptionKeyLabel: key.label,
      accountCount: accounts.length,
      probedThisRun: todo.length,
      resumedFromCheckpoint,
      loginAccepted: perAccount.filter(r => r.loginAccepted).length,
      classificationCounts: countBy(perAccount, r => r.classification),
      errorClassCounts: countBy(perAccount.filter(r => !r.loginAccepted), r => r.errorClass || r.responseCode || r.classification),
      perAccount,
      foldersSelected: 0,
      messageContentRead: 0,
      messagesSent: 0
    };
    await store.setSetting('winnrImapLoginProbeV1', receipt);
    // Per-account rows stay in the private workdir. The printed result carries aggregates only.
    await writePrivate(ctx.file('imap-probe-detail.json'), JSON.stringify(perAccount));
    return {
      encryptionKeyLabel: key.label,
      accountCount: receipt.accountCount,
      probedThisRun: receipt.probedThisRun,
      loginAccepted: receipt.loginAccepted,
      classificationCounts: receipt.classificationCounts,
      errorClassCounts: receipt.errorClassCounts,
      perAccountDetail: 'WORKDIR_PRIVATE',
      foldersSelected: 0,
      messageContentRead: 0,
      messagesSent: 0
    };
  },

  // Read-only TCP reachability from this runtime. No bytes are written and no credential is used. The 443 target is a
  // control: it shows whether the runtime reaches the provider at all, so a port-specific block is distinguishable
  // from a total outage. A completed TCP handshake is reachability only, not authentication.
  async 'network-diagnostic'(ctx) {
    const targets = [
      { label: 'control-https-443', host: 'api.winnr.app', port: 443 },
      { label: 'smtp-submission-465', host: 'inbound.winnr.app', port: 465 },
      { label: 'smtp-submission-587', host: 'inbound.winnr.app', port: 587 },
      { label: 'imap-993', host: 'inbound.winnr.app', port: 993 }
    ];
    const results = [];
    for (const target of targets) {
      results.push({ label: target.label, outcome: await tcpReachability(target.host, target.port, 10000) });
    }
    return { results, bytesWritten: 0, credentialsUsed: false, authenticationAttempted: false };
  },

  // Reconciles provider inventory against local accounts, sender pauses, recorded probe receipts and domain ownership.
  // Read-only apart from the reconciliation receipt it stores. Outbound eligibility stays false: no campaign
  // authority is granted by this phase.
  async reconcile(ctx) {
    const snapshot = await readJson(ctx.file('provider-snapshot.json'));
    const plan = await readJson(ctx.file('fleet-plan.json'));
    const store = await openStore(ctx);
    const settings = await store.getSettings();
    const accounts = await store.list('accounts');
    const senderHealth = await store.list('senderHealth');
    const ownership = Object.fromEntries(plan.domainPlans.map(p => [p.domain.domain, p.domain.ownershipStatus]));
    const report = reconcileWinnrFleet({
      providerDomains: snapshot.domains,
      providerMailboxes: snapshot.mailboxes,
      localAccounts: accounts,
      senderHealth,
      smtpReceipt: settings.winnrSmtpReadinessV1 || null,
      imapReceipt: settings.winnrImapLoginProbeV1 || null,
      domainOwnershipByName: ownership,
      snapshotTakenAt: snapshot.takenAt,
      now: new Date(),
      campaignAuthorityGranted: false
    });
    await writePrivate(ctx.file('reconciliation.json'), JSON.stringify(report));
    return { status: report.status, counts: report.counts, checks: report.checks, issues: report.issues, outboundAuthorityGranted: false, messagesSent: 0 };
  },

 async 'pilot-check'(ctx) {
    const before = await readJson(ctx.file('provider-snapshot-baseline.json'));
    const fleetBefore = splitFleet(before);
    const after = await readAccountSet(winnrClient(ctx.authMode));
    const fleetAfter = splitFleet(after);
    const afterById = new Map(fleetAfter.pilotMailboxes.map(m => [m.id, m]));
    const preserved = fleetBefore.pilotMailboxes.filter(b => {
      const a = afterById.get(b.id);
      return a && a.status === 'active' && a.created_at === b.created_at && a.domain === b.domain && a.full_address === b.full_address;
    }).length;
    const pilotDomainBefore = new Map(fleetBefore.pilotDomains.map(d => [d.id, d]));
    const pilotDomainPreserved = fleetAfter.pilotDomains.filter(a => {
      const b = pilotDomainBefore.get(a.id);
      return b && b.name === a.name && JSON.stringify(b.tags) === JSON.stringify(a.tags) && b.status === a.status;
    }).length;
    return {
      pilotAccountsBefore: fleetBefore.pilotMailboxes.length,
      pilotAccountsPreserved: preserved,
      pilotDomainsBefore: fleetBefore.pilotDomains.length,
      pilotDomainsPreserved: pilotDomainPreserved,
      startupAccountsAfter: fleetAfter.startupMailboxes.length,
      startupAccountsActiveAfter: fleetAfter.startupMailboxes.filter(m => m.status === 'active').length,
      providerSeatsUsedAfter: after.account.email_users_used
    };
  }
};

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const workdir = assertOutsideRepo('--workdir', args.workdir);
  await fs.mkdir(workdir, { recursive: true, mode: 0o700 });
  const productionRuntime = process.env.NODE_ENV === 'production';
  const environment = assertRunnerEnvironment({ keySource: args.keySource, storeBackend: args.storeBackend, productionRuntime });
  if (!environment.ok) throw new Error(`environment refused: ${environment.reasonCodes.join(',')}`);
  const ctx = {
    workdir,
    keySource: args.keySource,
    storeBackend: args.storeBackend,
    authMode: args.authMode,
    stagingKeyFile: args.keySource === 'staging-file' ? assertOutsideRepo('--staging-key-file', args.stagingKeyFile || path.join(workdir, 'staging-key.hex')) : null,
    storeDir: args.storeDir ? assertOutsideRepo('--store-dir', args.storeDir) : path.join(workdir, 'store'),
    file: name => path.join(workdir, name)
  };
  if (args.keySource === 'env' && !args.storeDir) throw new Error('--key-source=env requires an explicit --store-dir');

  const statePath = ctx.file('state.json');
  let state = {};
  try { state = await readJson(statePath); } catch { state = {}; }

  if (args.phases.includes('receipt')) {
    if (!args.receiptOut) throw new Error('--receipt-out is required for the receipt phase');
    const head = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: REPO_ROOT }).toString().trim();
    const receipt = toPublicFleetReceipt({ generatedAt: new Date().toISOString(), baseCommit: head, ownerAttestation: OWNER_ATTESTATION, phases: state });
    const out = path.resolve(REPO_ROOT, args.receiptOut);
    await fs.mkdir(path.dirname(out), { recursive: true });
    await fs.writeFile(out, `${JSON.stringify(receipt, null, 2)}\n`);
    console.log(JSON.stringify({ receipt: path.relative(REPO_ROOT, out), phases: Object.keys(state) }));
  }

  for (const phase of args.phases.filter(p => p !== 'receipt')) {
    if (!phases[phase]) throw new Error(`unknown phase: ${phase}`);
    const started = new Date().toISOString();
    try {
      const result = await phases[phase](ctx);
      state[phase] = { ok: result?.reasonCodes === undefined && !String(result?.importStatus || '').startsWith('IMPORT_REFUSED'), startedAt: started, finishedAt: new Date().toISOString(), result };
    } catch (error) {
      // The message stays in the private state file. The printed line carries only the class code.
      state[phase] = { ok: false, startedAt: started, finishedAt: new Date().toISOString(), errorClass: sanitizedErrorCode(error), error: String(error?.message || error).slice(0, 300) };
    }
    await writePrivate(statePath, JSON.stringify(state, null, 2));
    printPhase(phase, state[phase].result ?? { errorClass: state[phase].errorClass });
  }
}

// Each printed result passes the artifact guard first. A result that fails is replaced by a fixed refusal code.
export function printPhase(phase, result) {
  try {
    assertPublicSafe(result);
    console.log(`[${phase}] ${JSON.stringify(result)}`);
  } catch (error) {
    console.log(`[${phase}] ${JSON.stringify({ outputRefused: sanitizedErrorCode(error) })}`);
  }
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) {
  main().catch(error => {
    console.error(`winnr-fleet-integration failed: ${sanitizedErrorCode(error)}`);
    process.exitCode = 1;
  });
}
