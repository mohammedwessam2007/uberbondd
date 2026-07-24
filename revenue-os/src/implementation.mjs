// Implementation workflow (workstream 12, part 1). implementationGate is the single function that
// decides whether a repair task is allowed to start -- every one of the mission's 10 named
// requirements is checked, and every one of its 8 named blockers is a specific, itemized reason,
// never a generic "not ready."
import { id, now } from './store.mjs';
import { clamp } from './utils.mjs';

export class ImplementationError extends Error {
  constructor(code, message = code) {
    super(message);
    this.name = 'ImplementationError';
    this.code = code;
  }
}

export const DEFAULT_MARGIN_FLOOR_RATE = 0.3;
export const DEFAULT_MAX_SITES = 3;
export const DEFAULT_MAX_REVISIONS = 2;

/** Direct cost = contractor/labor cost only (never includes the owner's own time as a cost, since
 * that is margin, not cost) -- revenueCents - directCostCents = contributionMarginCents. */
export function contributionMargin({ revenueCents, directCostCents }) {
  const marginCents = revenueCents - directCostCents;
  const marginRate = revenueCents > 0 ? marginCents / revenueCents : -1;
  return { marginCents, marginRate };
}

export function buildRepairTask(defect, { hourlyRateCents, contractorCostCentsPerHour = 0 } = {}) {
  if (!defect) throw new ImplementationError('defect-required');
  const revenueCents = (defect.effortHours || 1) * hourlyRateCents;
  const directCostCents = (defect.effortHours || 1) * contractorCostCentsPerHour;
  return {
    id: id('repair'), defectId: defect.id, status: 'draft', revenueCents, directCostCents,
    data: { qa: { passed: false }, rollback: { planned: false, plan: '' }, backup: { taken: false }, staging: { path: '' } }
  };
}

/**
 * The one gate a repair task must pass to move from 'draft' to 'authorized'. Checks all 10 named
 * requirements and returns every blocker it finds among the 8 named blocker categories, not just
 * the first -- an owner reviewing a blocked task sees the whole picture at once.
 */
export function implementationGate({
  payment, scopeAcceptance, authorization, backup, staging, qaResult, rollbackPlan, evidenceItems = [],
  repairTask, marginFloorRate = DEFAULT_MARGIN_FLOOR_RATE, siteCount = 1, maxSites = DEFAULT_MAX_SITES,
  revisionCount = 0, maxRevisions = DEFAULT_MAX_REVISIONS, isProductionChange = true
}) {
  const blockers = [];
  if (!payment || payment.status !== 'VERIFIED') blockers.push({ code: 'missing-payment', detail: payment?.status || 'missing' });
  if (!scopeAcceptance || scopeAcceptance.accepted !== true) blockers.push({ code: 'unsupported-scope', detail: 'scope was not explicitly accepted in writing' });
  if (!authorization || authorization.authorized !== true || !authorization.authorizedBy) blockers.push({ code: 'ambiguous-authorization', detail: 'authorization must be an explicit true plus a named authorizer' });
  if (!backup || backup.taken !== true) blockers.push({ code: 'missing-backup' });
  if (isProductionChange && (!staging || !staging.path)) blockers.push({ code: 'unsafe-production-change', detail: 'no staging or safe-edit path declared for a production change' });
  if (!qaResult || qaResult.passed !== true) blockers.push({ code: 'qa-not-passed' });
  if (!rollbackPlan || !rollbackPlan.plan) blockers.push({ code: 'missing-rollback-plan' });
  if (evidenceItems.length === 0) blockers.push({ code: 'missing-evidence' });
  if (siteCount > maxSites) blockers.push({ code: 'excessive-sites', detail: `${siteCount} > ${maxSites}` });
  if (revisionCount > maxRevisions) blockers.push({ code: 'unbounded-revisions', detail: `${revisionCount} > ${maxRevisions}` });

  if (repairTask) {
    const margin = contributionMargin({ revenueCents: repairTask.revenueCents, directCostCents: repairTask.directCostCents });
    if (margin.marginRate < marginFloorRate) blockers.push({ code: 'negative-or-below-floor-margin', detail: `margin rate ${(margin.marginRate * 100).toFixed(1)}% below floor ${(marginFloorRate * 100).toFixed(1)}%` });
  } else {
    blockers.push({ code: 'missing-direct-cost-estimate' });
  }

  return { blocked: blockers.length > 0, blockers };
}

export async function authorizeRepairTask(store, repairTaskId, gateInput) {
  const gate = implementationGate(gateInput);
  if (gate.blocked) throw new ImplementationError('implementation-gate-blocked', JSON.stringify(gate.blockers));
  const updated = await store.patch('repairTasks', repairTaskId, { status: 'authorized', marginRate: contributionMargin({ revenueCents: gateInput.repairTask.revenueCents, directCostCents: gateInput.repairTask.directCostCents }).marginRate });
  await store.log('repair_task_authorized', { repairTaskId });
  return updated;
}
