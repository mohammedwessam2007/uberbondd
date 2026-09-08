#!/usr/bin/env node
import { compileCenturyContinuityPlan, verifyCenturyContinuityRehearsal } from '../src/century-grade-continuity.mjs';

const checksum = `sha256:${'a'.repeat(64)}`;
const plan = compileCenturyContinuityPlan({
  assets: [{
    id: 'synthetic-private-vault', assetClass: 'PRIVATE_LIFE_STATE', format: 'json.aes256gcm',
    schemaVersion: 'synthetic-v1', checksum, readerRef: 'synthetic:reader', portableFormat: true,
    requiresRunningService: false, encryptedAtRest: true, critical: true, private: true
  }],
  replicas: [
    { id: 'synthetic-cloud', assetId: 'synthetic-private-vault', provider: 'synthetic-provider', accountRef: 'synthetic-account', region: 'synthetic-region', failureDomain: 'synthetic-cloud-domain', encryptedAtRest: true, keyRef: 'synthetic-key-a' },
    { id: 'synthetic-offline', assetId: 'synthetic-private-vault', provider: 'offline', accountRef: 'synthetic-offline-media', region: 'offline', failureDomain: 'synthetic-offline-domain', offline: true, encryptedAtRest: true, keyRef: 'synthetic-key-b' }
  ],
  keyCustody: [
    { keyRef: 'synthetic-key-a', custodyDomain: 'synthetic-key-domain-a', recoveryRef: 'synthetic:recovery:a', rotationVersion: '1', ownerControlled: true },
    { keyRef: 'synthetic-key-b', custodyDomain: 'synthetic-key-domain-b', recoveryRef: 'synthetic:recovery:b', rotationVersion: '1', ownerControlled: true }
  ],
  migrations: [{ assetClass: 'PRIVATE_LIFE_STATE', fromVersion: 'synthetic-v1', toVersion: 'synthetic-v2', migratorRef: 'synthetic:migrator', readerRef: 'synthetic:reader-v2' }],
  posthumous: { disposition: 'UNDECIDED', statedByFounder: false }
});

const rehearsalWithoutEvidence = verifyCenturyContinuityRehearsal({ plan });
const ok = plan.ok === true
  && plan.runtimeProof === 'NONE__STRUCTURAL_PLAN_ONLY'
  && rehearsalWithoutEvidence.ok === false
  && rehearsalWithoutEvidence.reasonCodes.includes('observed-independent-restore-receipt-required');

console.log(JSON.stringify({
  ok,
  status: ok ? 'C23_STRUCTURAL_BOUNDARIES_HELD' : 'C23_BOUNDARY_LOST',
  planStatus: plan.status,
  manifestDigest: plan.manifestDigest,
  rehearsalStatusWithoutObservedEvidence: rehearsalWithoutEvidence.status,
  businessEffectAuthority: 'NONE',
  externalEffects: { providerCalls: 0, customerMessages: 0, spendCents: 0, deployments: 0 },
  note: 'Synthetic structural doctor only. It creates no backups, keys, replicas, migrations, restore events, provider-loss events or posthumous authority. C23-B requires actual observed receipts.'
}, null, 2));
if (!ok) process.exitCode = 1;
