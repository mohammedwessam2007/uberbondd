// Canonical entity constructors (workstream 3). Every mission-named entity is represented, either
// as its own store collection or as a documented field on a parent record -- see the table below.
// This module is the single place that documents which is which, so a reader never has to guess.
//
// Mission entity          -> representation
// organization/agency/
//   partner/buyer          -> organizations collection, `kind` field
// opportunity              -> opportunities collection
// demand signal            -> opportunities.data.demandSignals[] (field, not a table)
// portfolio item           -> opportunities.data.portfolioItems[] (field)
// website                  -> websites collection
// evidence                 -> evidenceItems collection
// channel / buyer role     -> opportunities.channel / opportunities.data.buyerRole (fields)
// offer / service version  -> offers collection (config.mjs's SERVICE_CATALOG is the source of truth for pricing; offers are per-opportunity instances of it)
// message draft            -> messageDrafts collection
// approval                 -> approvals collection
// send record              -> sendRecords collection
// reply                    -> replies collection
// suppression/complaint/
//   bounce/unsubscribe     -> suppressions collection, `reason` field
// proposal / SOW /
//   scope acceptance       -> proposals collection, `kind` field
// invoice handoff          -> invoiceHandoffs collection
// payment / refund /
//   dispute                -> payments collection (refund/dispute are payment.status values + payments.data.refund/dispute fields)
// onboarding / scope /
//   access request         -> diagnosticProjects.data.{onboarding,scope,accessRequest} (fields)
// diagnostic project       -> diagnosticProjects collection
// check run                -> checkRuns collection
// defect                   -> defects collection
// report                   -> reports collection
// repair task / QA /
//   rollback                -> repairTasks collection, `data.qa`/`data.rollback` fields
// delivery                 -> deliveries collection
// implementation /
//   monitoring offer        -> monitoringOffers collection, `kind` field
// subscription              -> monitoringOffers collection where kind='subscription'
// experiment                -> experiments collection
// metric                    -> computed at read time from auditEvents/experiments, never stored redundantly
// owner action               -> ownerActions collection
// blocker                    -> blockers collection
// audit event                -> auditEvents collection (business-level) + auditLog (queue/system-level, from store.mjs#log)
import { id, now } from './store.mjs';

export function newOrganization({ kind, name, domain = null } = {}) {
  if (!['organization', 'agency', 'partner', 'buyer'].includes(kind)) throw new Error(`invalid organization kind: ${kind}`);
  if (!name) throw new Error('organization name is required');
  return { id: id('org'), kind, name, domain };
}

export function newWebsite({ organizationId, domain } = {}) {
  if (!organizationId) throw new Error('organizationId is required');
  if (!domain) throw new Error('website domain is required');
  return { id: id('site'), organizationId, domain, status: 'active' };
}

export function newOpportunity({ organizationId = null, organizationDomain, channel, offerKey } = {}) {
  if (!organizationDomain) throw new Error('organizationDomain is required');
  if (!channel) throw new Error('channel is required');
  return {
    id: id('opp'), organizationId, organizationDomain, channel, offerKey: offerKey || null,
    status: 'candidate', score: null, data: { demandSignals: [], portfolioItems: [], buyerRole: null }
  };
}
