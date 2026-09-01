#!/usr/bin/env node
// Operator doctor for the free-first outreach lane.
//
// The number this exists to keep apart from the other number: the reviewed
// provider pool permits ~75,100 message transports per 30-day month, and
// UberBond can currently send zero of them. The first figure is published
// policy across sixteen providers; the second is how many providers have an
// account, a credential, an authenticated domain and an observed health signal.
// Reporting the first as capacity is how a research report becomes a send plan.
//
// Read-only. No provider is contacted, no account is created, no credential is
// read, and no message is sent by running this.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import {
  aggregateFreeCapacity,
  liveUsableCapacity,
  selectFreeRoute
} from '../src/free-first-outreach-router.mjs';
import {
  deriveProviderStatesFromReceipts,
  isLiveReadyProviderState,
  summarizeActivationReceipts
} from '../src/provider-activation-receipt.mjs';
import { ZERO_EXTERNAL_EFFECTS } from '../src/effect-ledgers.mjs';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const REGISTRY_PATH = 'artifacts/outreach/free-first-provider-registry-2026-09-01.json';
const RECEIPTS_PATH = 'artifacts/outreach/provider-activation-receipts-2026-09-01.json';

export function readOutreachArtifacts(root = repoRoot) {
  return {
    registry: JSON.parse(readFileSync(join(root, REGISTRY_PATH), 'utf8')).providers,
    receipts: JSON.parse(readFileSync(join(root, RECEIPTS_PATH), 'utf8')).receipts
  };
}

/**
 * The smallest atomic owner action per provider still short of LIVE.
 *
 * Ordered by the capacity actually at stake, so the three surfaced are the
 * three worth a founder minute. Never more than `maxOwnerActions`: a queue
 * nobody can finish in one sitting is a backlog wearing a queue's clothes.
 */
export function ownerActionQueue({ registry, providerStates, maxOwnerActions = 3 }) {
  const candidates = [];
  for (const provider of registry) {
    const state = providerStates[provider.id];
    if (isLiveReadyProviderState(state)) continue;
    const monthly = provider.quota?.monthly ?? null;
    const daily = provider.quota?.daily ?? null;
    const capacity = Math.min(
      daily == null ? Number.POSITIVE_INFINITY : daily * 30,
      monthly == null ? Number.POSITIVE_INFINITY : monthly
    );
    const step = state?.receiptState === 'MISSING' || state?.receiptState === 'INVALID'
      ? 'record an activation receipt'
      : !state?.active ? 'create or confirm one legitimate organisation account on the free plan'
        : !state?.configured ? 'store the provider API credential in the protected runtime secret store'
          : !state?.domainAuthenticated ? 'complete the provider domain verification records'
            : 'record one healthy provider health observation';
    candidates.push({
      providerId: provider.id,
      provider: provider.provider,
      atStakeMessagesPer30Days: Number.isFinite(capacity) ? capacity : null,
      action: `${step} for ${provider.provider}`,
      screen: `${provider.provider} account settings, then the UberBond activation receipt at ${RECEIPTS_PATH}`,
      estimatedMinutes: 15,
      estimatedCostUsd: 0,
      evidenceOfCompletion: `npm run outreach:free-first:doctor reports receiptState FRESH and a non-zero liveUsableCapacity30d for ${provider.id}`,
      blockedBy: state?.reasonCodes ?? []
    });
  }
  candidates.sort((a, b) => (b.atStakeMessagesPer30Days ?? 0) - (a.atStakeMessagesPer30Days ?? 0)
    || a.providerId.localeCompare(b.providerId));
  return candidates.slice(0, maxOwnerActions);
}

export function buildFreeFirstOutreachDoctor({
  registry,
  receipts,
  at = '2026-09-01T00:00:00.000Z',
  maxOwnerActions = 3
} = {}) {
  const now = new Date(at);
  const derivation = deriveProviderStatesFromReceipts({ receipts, registryProviders: registry, now });
  const providerStates = derivation.ok ? derivation.providerStates : {};

  const research = aggregateFreeCapacity({ providers: registry, days: 30 });
  const transactionalPlan = aggregateFreeCapacity({ providers: registry, days: 30, purpose: 'TRANSACTIONAL' });
  const optInPlan = aggregateFreeCapacity({ providers: registry, days: 30, purpose: 'OPT_IN_MARKETING', consentEvidence: true });
  const coldPlan = aggregateFreeCapacity({ providers: registry, days: 30, purpose: 'COLD_B2B' });
  const coldRoute = selectFreeRoute({ purpose: 'COLD_B2B', providers: registry, at, mode: 'PLAN' });
  const live = liveUsableCapacity({ providers: registry, activationReceipts: receipts, at, days: 30 });

  const liveReady = Object.entries(providerStates)
    .filter(([, state]) => isLiveReadyProviderState(state))
    .map(([id]) => id)
    .sort();

  return {
    ok: true,
    status: liveReady.length
      ? 'FREE_FIRST_ROUTER_LIVE_PROVIDERS_PRESENT'
      : 'FREE_FIRST_ROUTER_PLAN_ONLY__NO_ACTIVATED_PROVIDER',
    observedAt: now.toISOString(),
    policyVersion: research.policyVersion,
    receiptSchemaVersion: derivation.schemaVersion,
    capacity: {
      researchCapacity30d: research.capacity,
      researchCapacityByPurposePlan: {
        TRANSACTIONAL: transactionalPlan.capacity,
        OPT_IN_MARKETING_WITH_CONSENT: optInPlan.capacity,
        COLD_B2B: coldPlan.capacity
      },
      liveUsableCapacity30d: live.capacity,
      coldCapableTransportProven: coldRoute.ok,
      coldRouteRefusal: coldRoute.ok ? null : coldRoute.reasonCodes
    },
    capacityTruth: 'researchCapacity30d is what sixteen published free-tier policies permit in aggregate. It is predominantly transactional, lifecycle and opt-in capacity, it is not a daily cold-prospect budget, and liveUsableCapacity30d is the only figure that reflects providers this company can actually send through.',
    providerStates,
    receipts: summarizeActivationReceipts(receipts, { now }),
    liveReadyProviderIds: liveReady,
    ownerActionQueue: ownerActionQueue({ registry, providerStates, maxOwnerActions }),
    commercialTruth: {
      realCustomers: 0,
      clearedRevenueUsd: 0,
      acceptedPaidDeliveries: 0,
      retainedCustomers: 0
    },
    businessEffectAuthority: 'NONE',
    externalEffectLedger: { ...ZERO_EXTERNAL_EFFECTS }
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const { registry, receipts } = readOutreachArtifacts();
  process.stdout.write(`${JSON.stringify(buildFreeFirstOutreachDoctor({ registry, receipts }), null, 2)}\n`);
}
