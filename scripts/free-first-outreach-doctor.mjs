#!/usr/bin/env node

import {
  EXPERIMENTAL_COLD_ROUTES,
  FREE_FIRST_PROVIDER_REGISTRY,
  freeCapacitySnapshot
} from '../src/free-first-outreach-router.mjs';
import {
  FREE_FIRST_EMAIL_ADAPTER_CONTRACT_VERSION,
  planFreeFirstEmailDispatch
} from '../src/free-first-email-adapter-contract.mjs';

export function buildFreeFirstOutreachDoctor({ date = new Date('2026-09-01T00:00:00.000Z'), implementations = {} } = {}) {
  const snapshot = freeCapacitySnapshot({ date });
  const permissionedPlan = planFreeFirstEmailDispatch({ purpose: 'OPT_IN_MARKETING', date, implementations });
  const coldPlan = planFreeFirstEmailDispatch({ purpose: 'COLD_B2B', date, implementations });
  const configuredProviders = FREE_FIRST_PROVIDER_REGISTRY
    .filter(provider => implementations?.[provider.id])
    .map(provider => provider.id)
    .sort();
  const unconfiguredProviders = FREE_FIRST_PROVIDER_REGISTRY
    .filter(provider => !implementations?.[provider.id])
    .map(provider => provider.id)
    .sort();
  const staleProviders = FREE_FIRST_PROVIDER_REGISTRY
    .filter(provider => Date.parse(provider.policyFreshUntil || '') <= date.getTime())
    .map(provider => provider.id)
    .sort();

  return {
    status: coldPlan.route?.status === 'NO_FREE_COLD_ROUTE' ? 'BOOTSTRAP_READY_COLD_TRANSPORT_BLOCKED' : 'REVIEW_REQUIRED',
    observedAt: date.toISOString(),
    policyVersion: snapshot.policyVersion,
    adapterContractVersion: FREE_FIRST_EMAIL_ADAPTER_CONTRACT_VERSION,
    capacity: {
      providerCount: snapshot.providerCount,
      monthlyFreeEmailTransport: snapshot.monthlyCapacity,
      normalizedDailyFreeEmailTransport: snapshot.normalizedDailyCapacity,
      provenFreeColdB2BMonthly: snapshot.coldMonthlyCapacity,
      provenFreeColdB2BDaily: snapshot.coldNormalizedDailyCapacity
    },
    routing: {
      permissioned: {
        selectedProvider: permissionedPlan.provider || permissionedPlan.route?.provider || null,
        status: permissionedPlan.status || permissionedPlan.route?.status || null
      },
      coldB2B: {
        selectedProvider: coldPlan.provider || null,
        status: coldPlan.route?.status || coldPlan.status || null
      }
    },
    adapters: {
      configuredProviders,
      unconfiguredProviders,
      staleProviders
    },
    experimentalColdRoutes: EXPERIMENTAL_COLD_ROUTES.map(route => ({
      id: route.id,
      status: route.status,
      fixedDailyCapacity: route.fixedDailyCapacity,
      blockers: [...route.blockers]
    })),
    commercialTruth: {
      realCustomers: 0,
      clearedRevenueUsd: 0,
      acceptedPaidDeliveries: 0,
      retainedCustomers: 0
    },
    externalEffects: 0
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  process.stdout.write(`${JSON.stringify(buildFreeFirstOutreachDoctor(), null, 2)}\n`);
}
