#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import {
  evaluateSovereignOutreachButton,
  createPostalGovernedTransportAdapter,
  pressSovereignOutreachBigButton
} from '../src/sovereign-outreach-big-button.mjs';

const CONTROL_DIR = path.resolve(process.env.UBERBOND_CONTROL_DIR || '/var/lib/uberbond-control');
const OUTREACH_DIR = path.resolve(process.env.UBERBOND_OUTREACH_CONTROL_DIR || path.join(CONTROL_DIR, 'outreach'));
const CAPSULE_PATH = path.resolve(process.env.UBERBOND_OUTREACH_CAPSULE_PATH || path.join(OUTREACH_DIR, 'launch-capsule.json'));
const RECEIPT_PATH = path.resolve(process.env.UBERBOND_OUTREACH_RECEIPT_PATH || path.join(OUTREACH_DIR, 'launch-receipt.json'));
const MAX_FILE_BYTES = 4_000_000;

function output(payload, code = 0) {
  process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
  process.exitCode = code;
}

async function readRegularJson(file) {
  try {
    const stat = await fs.lstat(file);
    if (!stat.isFile() || stat.isSymbolicLink() || stat.size < 2 || stat.size > MAX_FILE_BYTES) return null;
    const parsed = JSON.parse(await fs.readFile(file, 'utf8'));
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : null;
  } catch { return null; }
}

async function atomicJson(file, value) {
  await fs.mkdir(path.dirname(file), { recursive: true, mode: 0o700 });
  const temp = `${file}.tmp.${process.pid}`;
  await fs.writeFile(temp, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 });
  await fs.chmod(temp, 0o600);
  await fs.rename(temp, file);
}

function postalConfig() {
  return {
    baseUrl: String(process.env.UBERDOSO_POSTAL_BASE_URL || process.env.POSTAL_BASE_URL || '').trim(),
    apiKey: String(process.env.UBERDOSO_POSTAL_API_KEY || process.env.POSTAL_API_KEY || '').trim(),
    fromAddress: String(process.env.UBERDOSO_POSTAL_FROM_ADDRESS || process.env.POSTAL_FROM_ADDRESS || '').trim(),
    messageIdDomain: String(process.env.UBERDOSO_POSTAL_MESSAGE_ID_DOMAIN || process.env.POSTAL_MESSAGE_ID_DOMAIN || '').trim(),
    timeoutMs: Number(process.env.UBERDOSO_POSTAL_TIMEOUT_MS || 15000)
  };
}

const command = String(process.argv[2] || 'status').trim().toLowerCase();
const expectedDigest = String(process.argv[3] || '').trim();
const capsule = await readRegularJson(CAPSULE_PATH);
if (!capsule) {
  output({
    ok: false,
    status: 'OUTREACH_LAUNCH_CAPSULE_NOT_READY',
    state: 'WAITING_FOR_REALITY',
    capsulePath: CAPSULE_PATH,
    reasonCodes: ['regular-launch-capsule-required'],
    oneButtonPressAvailable: false,
    externalEffectAuthority: 'NONE',
    businessEffectAuthority: 'NONE'
  }, command === 'status' ? 0 : 2);
} else if (command === 'status') {
  const readiness = evaluateSovereignOutreachButton({ capsule, expectedDigest: expectedDigest || undefined, now: new Date() });
  output({
    ok: true,
    status: 'OUTREACH_BIG_BUTTON_STATUS',
    ...readiness,
    capsulePath: CAPSULE_PATH,
    receiptPath: RECEIPT_PATH,
    secretsExposed: false
  });
} else if (command === 'press') {
  if (!expectedDigest) {
    output({ ok:false, status:'OUTREACH_BIG_BUTTON_REFUSED', reasonCodes:['expected-capsule-digest-required'], providerCalls:0, messagesSent:0 }, 2);
  } else {
    const cfg = postalConfig();
    const missing = [];
    if (!cfg.baseUrl) missing.push('postal-base-url-required');
    if (!cfg.apiKey) missing.push('postal-api-key-required');
    if (!cfg.fromAddress) missing.push('postal-from-address-required');
    if (!cfg.messageIdDomain) missing.push('postal-message-id-domain-required');
    if (missing.length) {
      output({
        ok:false,
        status:'OUTREACH_TRANSPORT_NOT_CONFIGURED',
        reasonCodes:missing,
        providerCalls:0,
        messagesSent:0,
        secretsExposed:false,
        truthBoundary:'The operator refuses to invent or print transport credentials. Configure the self-hosted UberDoso Postal runtime through protected host environment state.'
      }, 2);
    } else {
      let transportAdapter;
      try { transportAdapter = createPostalGovernedTransportAdapter(cfg); }
      catch (error) {
        output({ ok:false, status:'OUTREACH_TRANSPORT_CONFIG_REFUSED', reasonCodes:[String(error?.code || error?.message || error).slice(0,300)], providerCalls:0, messagesSent:0, secretsExposed:false }, 2);
      }
      if (transportAdapter) {
        const result = await pressSovereignOutreachBigButton({ capsule, expectedDigest, transportAdapter, now: new Date() });
        const receipt = {
          schemaVersion: 'uberbond.sovereign-outreach-launch-receipt.v1',
          createdAt: new Date().toISOString(),
          ...result,
          capsulePath: CAPSULE_PATH,
          secretsExposed: false
        };
        await atomicJson(RECEIPT_PATH, receipt);
        output(receipt, result?.ok === true ? 0 : 2);
      }
    }
  }
} else {
  output({ ok:false, status:'OUTREACH_BIG_BUTTON_COMMAND_REFUSED', reasonCodes:['supported-command-required:status|press'], providerCalls:0, messagesSent:0 }, 2);
}
