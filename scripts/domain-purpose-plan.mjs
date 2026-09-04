#!/usr/bin/env node
// The intended purpose of every host under the two domains UberBond owns, and
// what each one's DNS actually shows.
//
// Without --live this prints the plan and the states derivable without any
// lookup. With --live it performs read-only public DNS queries: ordinary
// resolution, never a write, and there is no DNS write path anywhere in this
// repository. A record this plan generated can never reach VERIFIED on its own
// -- only an observation can, because expecting a record and having one are
// different facts.
import { buildDomainPurposePlan, observationsFromDnsVerification, OWNED_ROOT_DOMAINS } from '../src/domain-purpose-plan.mjs';
import { verifySendingDomainDns, defaultDnsResolver } from '../src/dns-verification.mjs';

export async function buildDomainPlanReport({ live = false, resolver = defaultDnsResolver, now = new Date() } = {}) {
  if (!live) return buildDomainPurposePlan({ now });

  const planned = buildDomainPurposePlan({ now });
  const observations = [];
  for (const entry of planned.plan || []) {
    const host = entry.host;
    if (!host) continue;
    const dns = await verifySendingDomainDns({ domain: host, resolver, date: now });
    observations.push(...observationsFromDnsVerification(dns, { observedAt: now.toISOString(), hostName: host }));
  }
  return buildDomainPurposePlan({ observations, now });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const live = process.argv.includes('--live');
  const report = await buildDomainPlanReport({ live });
  process.stdout.write(`${JSON.stringify({ ownedRootDomains: [...OWNED_ROOT_DOMAINS], live, ...report }, null, 2)}\n`);
}
