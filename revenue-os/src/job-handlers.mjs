// Job handler bodies for the mission's 15 named scheduler jobs, wired into DurableQueue (reused
// unmodified from ../../src/queue.mjs) via createRevenueOsJobHandlers(). Every handler composes
// already-built, already-tested modules -- nothing here reimplements scoring, payment
// verification, or report generation a second time. No handler ever sends, charges, refunds,
// deploys, or alters a customer site -- every one of them only reads/writes this package's own
// store, or (payment_reconciliation, reply_import) calls an explicitly injected fake/replay
// provider through a circuit breaker.
import { now } from './store.mjs';
import { scoreOpportunity, qualify } from './scoring.mjs';
import { expireStaleApprovals } from './approval.mjs';
import { shouldStopFollowUp, classifyReply } from './reply.mjs';
import { verifyPayment } from './payments.mjs';
import { deliveryGate } from './diagnostic-workflow.mjs';
import { purgeExpiredEvidence } from './monitoring.mjs';
import { verifyReportManifest } from './report.mjs';
import { createCircuitBreaker } from './circuit-breaker.mjs';

export class JobHandlerError extends Error {
  constructor(code, message = code) {
    super(message);
    this.name = 'JobHandlerError';
    this.code = code;
    this.retryable = false;
  }
}

function correlationId(clock) {
  return `ros_corr_${clock().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export function createRevenueOsJobHandlers({ store, clock = () => Date.now(), reportSecret, replyProvider = null, paymentProvider = null }) {
  const replyBreaker = createCircuitBreaker({ name: 'reply-import', clock });
  const paymentBreaker = createCircuitBreaker({ name: 'payment-reconciliation', clock });

  return {
    // 1. import_watch: a lightweight consistency sweep over already-imported records (no real
    // filesystem/inbox watching in this local package) -- reports counts, does not import anything
    // new on its own (new packs are still explicitly imported by the operator/importer.mjs).
    'ros.import_watch': async () => {
      const opportunities = await store.list('opportunities');
      const evidenceItems = await store.list('evidenceItems');
      return { correlationId: correlationId(clock), opportunityCount: opportunities.length, evidenceCount: evidenceItems.length };
    },

    // 2. stale_evidence_review: flags evidence past the same 90-day window importer.mjs itself
    // quarantines new records against, so already-imported evidence doesn't silently age past that
    // line unnoticed.
    'ros.stale_evidence_review': async () => {
      const items = await store.list('evidenceItems');
      const staleIds = items.filter(item => !item.deletedAt && (clock() - Date.parse(item.capturedAt || item.createdAt || 0)) / 86400000 > 90).map(item => item.id);
      await store.log('stale_evidence_reviewed', { correlationId: correlationId(clock), staleCount: staleIds.length });
      return { staleCount: staleIds.length, staleIds };
    },

    // 3. opportunity_revalidation: re-scores every still-candidate opportunity with fresh recency
    // math (a score computed a week ago is stale even if nothing else about the opportunity changed).
    'ros.opportunity_revalidation': async () => {
      const opportunities = await store.list('opportunities', { filters: { status: 'candidate' } });
      let requalified = 0, disqualified = 0;
      for (const opportunity of opportunities) {
        const input = { channel: opportunity.channel, capturedAt: opportunity.data?.lineage?.importedAt || opportunity.createdAt, nowMs: clock(), confidence: opportunity.data?.confidence, evidenceCompleteness: opportunity.data?.evidenceCompleteness ?? 0.5 };
        const scoreResult = scoreOpportunity(input);
        const decision = qualify(opportunity, scoreResult);
        await store.patch('opportunities', opportunity.id, { score: scoreResult.score, data: { ...opportunity.data, lastRevalidatedAt: new Date(clock()).toISOString() } });
        if (decision.qualified) requalified += 1; else disqualified += 1;
      }
      return { correlationId: correlationId(clock), revalidated: opportunities.length, requalified, disqualified };
    },

    // 4. approval_expiry: delegates entirely to approval.mjs's own sweep.
    'ros.approval_expiry': async () => {
      const result = await expireStaleApprovals(store, clock());
      return { correlationId: correlationId(clock), ...result };
    },

    // 5. followup_eligibility: computes shouldStopFollowUp for every organization with an open
    // opportunity, so the outbound layer never has to compute it lazily at send time alone.
    'ros.followup_eligibility': async () => {
      const opportunities = await store.list('opportunities');
      const domains = [...new Set(opportunities.map(o => o.organizationDomain))];
      const results = [];
      for (const domain of domains) results.push({ organizationDomain: domain, ...(await shouldStopFollowUp(store, domain)) });
      return { correlationId: correlationId(clock), checked: domains.length, blocked: results.filter(r => r.stop).length };
    },

    // 6. reply_import: pulls from an injected read-only provider (fake/replay only -- see
    // reply.mjs's own header comment) through a circuit breaker, so a provider that starts
    // erroring repeatedly stops being hammered rather than retried forever inline.
    'ros.reply_import': async () => {
      if (!replyProvider) return { correlationId: correlationId(clock), imported: 0, skipped: 'no-provider-configured' };
      const replies = await replyBreaker.call(() => replyProvider.listReplies());
      let imported = 0;
      for (const raw of replies) {
        const classification = classifyReply(raw.body || '');
        await store.add('replies', { opportunityId: raw.opportunityId || null, classification: classification.category, receivedAt: raw.receivedAt || now(), data: { organizationDomain: raw.organizationDomain, body: raw.body, source: 'scheduler-import' } });
        imported += 1;
      }
      return { correlationId: correlationId(clock), imported };
    },

    // 7. payment_reconciliation: re-attempts verification for payments stuck in
    // PENDING_VERIFICATION with previously-submitted evidence still on file, through a circuit
    // breaker around the provider call. Never invents evidence -- if none was ever submitted for a
    // pending payment, that payment is reported, not verified.
    'ros.payment_reconciliation': async () => {
      const pending = await store.list('payments', { filters: { status: 'PENDING_VERIFICATION' } });
      let reconciled = 0, stillPending = 0;
      for (const payment of pending) {
        const evidence = payment.data?.lastEvidence;
        if (!evidence || !paymentProvider) { stillPending += 1; continue; }
        try {
          await paymentBreaker.call(() => verifyPayment(store, payment.id, paymentProvider, evidence));
          reconciled += 1;
        } catch { stillPending += 1; }
      }
      return { correlationId: correlationId(clock), reconciled, stillPending, circuitState: paymentBreaker.state };
    },

    // 8. project_deadlines: flags a diagnostic project as an owner blocker once it has been PAID
    // longer than the offer's own delivery SLA (12-24h) without reaching DELIVERED.
    'ros.project_deadlines': async () => {
      const projects = await store.list('diagnosticProjects');
      const overdue = [];
      for (const project of projects) {
        if (['DELIVERED', 'ACCEPTED', 'IMPLEMENTATION_OFFERED', 'MONITORING_OFFERED', 'CLOSED', 'CANCELED', 'REFUNDED', 'DISPUTED'].includes(project.status)) continue;
        const paidAt = Date.parse(project.data?.paidAt || project.createdAt);
        const slaHours = project.data?.deliveryHoursMax || 24;
        if ((clock() - paidAt) / 3600000 > slaHours) overdue.push(project.id);
      }
      if (overdue.length) await store.log('project_deadlines_overdue', { correlationId: correlationId(clock), overdue });
      return { correlationId: correlationId(clock), overdueCount: overdue.length, overdueIds: overdue };
    },

    // 9. report_generation: a readiness sweep -- flags projects in EVIDENCE_REVIEW with at least
    // one defect card as ready for report drafting. Actual drafting still requires the operator's
    // branding/commissioned decision (report.mjs's own required inputs), so this job reports
    // readiness rather than drafting blind.
    'ros.report_generation': async () => {
      const projects = await store.list('diagnosticProjects', { filters: { status: 'EVIDENCE_REVIEW' } });
      const ready = [];
      for (const project of projects) {
        const defects = await store.list('defects', { filters: { diagnosticProjectId: project.id } });
        if (defects.length > 0 || project.data?.noDefectsConfirmed) ready.push(project.id);
      }
      return { correlationId: correlationId(clock), readyCount: ready.length, readyIds: ready };
    },

    // 10. qa_reminders: flags projects sitting in QA with no recorded QA result yet.
    'ros.qa_reminders': async () => {
      const projects = await store.list('diagnosticProjects', { filters: { status: 'QA' } });
      const needsReminder = projects.filter(p => !p.data?.qaResult).map(p => p.id);
      return { correlationId: correlationId(clock), needsReminderCount: needsReminder.length, needsReminderIds: needsReminder };
    },

    // 11. delivery_readiness: runs the real deliveryGate against every project in
    // READY_TO_DELIVER, using whatever is already recorded on the project -- never invents a
    // payment/scope/QA result that isn't there.
    'ros.delivery_readiness': async () => {
      const projects = await store.list('diagnosticProjects', { filters: { status: 'READY_TO_DELIVER' } });
      const results = [];
      for (const project of projects) {
        const defects = await store.list('defects', { filters: { diagnosticProjectId: project.id } });
        const evidenceItems = await store.list('evidenceItems');
        const gate = deliveryGate({
          project, payment: project.data?.payment, scopeAcceptance: project.data?.scopeAcceptance,
          evidenceItems: evidenceItems.filter(e => e.data?.diagnosticProjectId === project.id),
          defectCards: defects, report: project.data?.report, qaResult: project.data?.qaResult, brand: project.data?.brand
        });
        results.push({ projectId: project.id, blocked: gate.blocked, blockers: gate.blockers });
      }
      return { correlationId: correlationId(clock), checked: results.length, blockedCount: results.filter(r => r.blocked).length, results };
    },

    // 12. monitoring_checks: this job's payload must supply the crawler + sites to check (this
    // package's scheduler starts no timer and does no I/O on its own -- see scheduler.mjs); it
    // records nothing here beyond confirming which active offers are due, since actually running
    // checks requires a crawler provider injected per-call, not held by the handler factory.
    'ros.monitoring_checks': async () => {
      const offers = await store.list('monitoringOffers', { filters: { active: true } });
      return { correlationId: correlationId(clock), activeOfferCount: offers.length, dueIds: offers.map(o => o.id) };
    },

    // 13. owner_digest: a real compiled summary of every open owner-facing item across the whole
    // system -- the same counts the owner command center's home screen shows.
    'ros.owner_digest': async () => {
      const [approvalsPending, projectsBlocked, paymentsPending, monitoringActive] = await Promise.all([
        store.list('approvals', { filters: { status: 'pending' } }),
        store.list('blockers', { filters: { status: 'open' } }),
        store.list('payments', { filters: { status: 'PENDING_VERIFICATION' } }),
        store.list('monitoringOffers', { filters: { active: true } })
      ]);
      return {
        correlationId: correlationId(clock), generatedAt: new Date(clock()).toISOString(),
        approvalsPendingCount: approvalsPending.length, projectsBlockedCount: projectsBlocked.length,
        paymentsPendingCount: paymentsPending.length, monitoringActiveCount: monitoringActive.length
      };
    },

    // 14. retention_purge: delegates entirely to monitoring.mjs's own soft-delete sweep.
    'ros.retention_purge': async ({ retentionDays = 365 } = {}) => {
      const result = await purgeExpiredEvidence(store, retentionDays, clock());
      return { correlationId: correlationId(clock), ...result };
    },

    // 15. deterministic_verification: a self-test job -- re-verifies every already-signed report
    // manifest still validates against its stored data, catching silent corruption (a manually
    // edited store file, a bit-flip) rather than assuming a signed record is still intact forever.
    'ros.deterministic_verification': async () => {
      const reports = await store.list('reports');
      let verified = 0, failed = 0;
      for (const report of reports) {
        if (!report.data?.reportData || !report.manifestSignature) continue;
        const result = verifyReportManifest(report.data.reportData, { signature: report.manifestSignature }, reportSecret);
        if (result.valid) verified += 1; else failed += 1;
      }
      if (failed > 0) await store.log('deterministic_verification_failed', { correlationId: correlationId(clock), failed });
      return { correlationId: correlationId(clock), verified, failed };
    }
  };
}
