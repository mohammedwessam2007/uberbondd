import crypto from 'node:crypto';
import { id, now, normalizeDomain, isEmail } from './utils.mjs';
import { checkoutUrl, normalizeLemonEvent, verifyLemonSignature, classifyPaymentEvent, PAYMENT_TRUTH_POLICY_VERSION } from './payments.mjs';
import { sendEmail, sealTokens } from './gmail.mjs';
import { encryptJson, decryptJson } from './crypto.mjs';
import { ConflictError } from './store.mjs';

const DAY = 86400000;
const sha = value => crypto.createHash('sha256').update(String(value)).digest('hex');
const validKey = key => /^[a-f0-9]{64}$/i.test(key || '');

// Bump when the audit decision logic changes so past receipts stay
// attributable to the policy version that produced them.
export const REPORT_EMAIL_POLICY_VERSION = 'report-email-recovery-1.1.0';

function protectToken(token, key) {
  return validKey(key) ? { encrypted: true, value: encryptJson({ token }, key) } : { encrypted: false, value: token };
}
function revealToken(record, key) {
  if (!record) return '';
  try { return record.encrypted ? decryptJson(record.value, key).token : record.value; }
  catch { return ''; }
}
function cleanText(value, max = 300) {
  return String(value || '').trim().replace(/\s+/g, ' ').slice(0, max);
}
function safeCents(value, fallback = null) {
  const number = Number(value);
  return Number.isSafeInteger(number) ? number : fallback;
}

export class RevenueEngine {
  constructor(store, cfg, pipeline, hooks = {}) {
    this.store = store;
    this.cfg = cfg;
    this.pipeline = pipeline;
    this.hooks = hooks;
    this.publicHits = new Map();
    this.sendEmailFn = hooks.sendEmail || sendEmail;
    this.clock = hooks.clock || (() => new Date());
  }

  // Distinct from cold-outreach: the destination is the address the customer
  // themselves typed into the public intake form (see createLead), not
  // discovered or inferred, and delivery is gated by its own independent
  // kill switch (cfg.revenue.autoEmailReports) and idempotency key
  // (lead.id), never the outreach guard or campaign machinery.
  async logReportEmailDecision(outcome, reason, { lead, prospect } = {}) {
    return this.logReportEmailDecisionOn(this.store, outcome, reason, { lead, prospect });
  }

  async logReportEmailDecisionOn(store, outcome, reason, { lead, prospect } = {}) {
    return store.log('report_email_audit', {
      effectClass: 'transactional-report-email',
      outcome, reason,
      leadId: lead?.id || null,
      prospectId: prospect?.id || lead?.prospectId || null,
      workspaceId: prospect?.campaignId || null,
      idempotencyKey: lead?.id ? `report-email:${lead.id}` : '',
      destinationProvenance: 'self-submitted-at-public-intake-form',
      killSwitchEnabled: Boolean(this.cfg.revenue?.autoEmailReports),
      policyVersion: REPORT_EMAIL_POLICY_VERSION,
      timestamp: this.clock().toISOString()
    });
  }

  async ensureInboundCampaign() {
    let campaign = await this.store.findOne('campaigns', { systemKey: 'inbound-audit' });
    if (campaign) return campaign;
    campaign = {
      id: id('camp'), systemKey: 'inbound-audit', name: 'Inbound Opportunity Audit',
      niche: 'Global businesses requesting a website opportunity audit', offer: 'Digital Opportunity Audit',
      allowedCountries: [], minScore: 0, dailyCaps: { A: 0, B: 0 }, maxFollowups: 0,
      autoSend: false, approved: true, createdAt: now()
    };
    try { await this.store.add('campaigns', campaign); }
    catch (error) {
      if (!(error instanceof ConflictError)) throw error;
      campaign = await this.store.findOne('campaigns', { systemKey: 'inbound-audit' });
    }
    return campaign;
  }

  rateLimit(ip = 'unknown') {
    const hour = Math.floor(Date.now() / 3600000);
    const key = `${ip}:${hour}`;
    const count = (this.publicHits.get(key) || 0) + 1;
    this.publicHits.set(key, count);
    if (this.publicHits.size > 1000) {
      for (const entry of this.publicHits.keys()) if (!entry.endsWith(`:${hour}`)) this.publicHits.delete(entry);
    }
    return count <= this.cfg.revenue.publicRateLimitPerHour;
  }

  async createLead(input, ip = 'unknown') {
    if (!this.cfg.revenue.publicIntake) throw new Error('Public audit intake is disabled');
    if (!this.rateLimit(ip)) throw new Error('Too many audit requests. Please try again later.');
    const company = cleanText(input.company, 180);
    const website = cleanText(input.website, 500);
    const email = cleanText(input.email, 240).toLowerCase();
    if (!company || !website || !isEmail(email)) throw new Error('Company, website, and a valid email are required');
    const domain = normalizeDomain(website);
    if (!domain) throw new Error('Enter a valid public website');

    const campaign = await this.ensureInboundCampaign();
    const accessToken = crypto.randomBytes(24).toString('base64url');
    const lead = {
      id: id('lead'), company, website, email, domain,
      industry: cleanText(input.industry, 120), country: cleanText(input.country, 80),
      language: cleanText(input.language, 30) || 'English', source: cleanText(input.source, 80) || 'public-audit',
      status: 'queued', plan: 'free', paymentStatus: 'unpaid', consent: Boolean(input.consent),
      accessTokenHash: sha(accessToken), accessTokenSecret: protectToken(accessToken, this.cfg.encryptionKey), createdAt: now()
    };
    const prospect = {
      id: id('pros'), company, website, domain, niche: lead.industry, country: lead.country, city: '', contactName: '',
      campaignId: campaign.id, abilityToPay: 10, serviceFit: 12,
      marketAdvantage: /arabic/i.test(lead.language) ? 9 : 6,
      notes: `Inbound audit request from ${email}`, source: 'inbound', leadId: lead.id,
      customerEmail: email, status: 'queued', createdAt: now()
    };
    lead.prospectId = prospect.id;

    await this.store.transaction(async tx => {
      await tx.add('leads', lead);
      await tx.add('prospects', prospect);
      await tx.add('notifications', {
        id: id('note'), type: 'new_lead', leadId: lead.id, prospectId: prospect.id,
        title: `New audit request: ${company}`, status: 'unread', createdAt: now()
      });
    });
    setTimeout(() => {
      // Best-effort background kickoff; the lead is already persisted above and
      // will be picked up on the next tick even if this fails. Log for visibility.
      if (this.hooks.enqueueResearch) this.hooks.enqueueResearch({ limit: 1, reason: 'public-audit', leadId: lead.id }).catch(error => console.error('[revenue] research enqueue failed for lead', lead.id, error?.message || error));
      else if (!this.pipeline.running && !this.pipeline.paused) this.pipeline.runBatch(1).catch(error => console.error('[revenue] background batch run failed', error?.message || error));
    }, 50);
    return { leadId: lead.id, accessToken, statusUrl: `${this.cfg.baseUrl}/report.html?token=${encodeURIComponent(accessToken)}` };
  }

  async leadByToken(token) {
    return this.store.findOne('leads', { accessTokenHash: sha(token || '') });
  }

  tokenForLead(lead) { return revealToken(lead?.accessTokenSecret, this.cfg.encryptionKey); }

  checkoutFor(lead, product) {
    const map = {
      full: { url: this.cfg.revenue.fullAuditCheckoutUrl, price: this.cfg.revenue.fullAuditPrice },
      strategy: { url: this.cfg.revenue.strategyAuditCheckoutUrl, price: this.cfg.revenue.strategyAuditPrice },
      monitoring: { url: this.cfg.revenue.monitoringCheckoutUrl, price: this.cfg.revenue.monitoringPrice }
    };
    const entry = map[product];
    if (!entry) throw new Error('Unknown product');
    const url = checkoutUrl(entry.url, { lead_id: lead.id, prospect_id: lead.prospectId, product });
    return { product, price: entry.price, currency: 'USD', configured: Boolean(url), url };
  }

  async publicReport(token) {
    const lead = await this.leadByToken(token);
    if (!lead) return null;
    const prospect = await this.store.get('prospects', lead.prospectId);
    if (!prospect) return null;
    const full = lead.paymentStatus === 'paid' || ['full', 'strategy', 'monitoring'].includes(lead.plan);
    const audit = Array.isArray(prospect.audit) ? prospect.audit : [];
    const visible = full ? audit : audit.slice(0, Math.max(1, this.cfg.revenue.freeFindings));
    const screenshots = (prospect.dossier?.screenshots || []).slice(0, full ? 8 : 1);
    return {
      lead: {
        id: lead.id, company: lead.company, website: lead.website, email: lead.email,
        status: lead.status, plan: lead.plan, paymentStatus: lead.paymentStatus, createdAt: lead.createdAt
      },
      report: {
        ready: ['ready', 'research-complete', 'rejected', 'sent', 'replied'].includes(prospect.status),
        status: prospect.status, error: prospect.error || '', score: prospect.score || null,
        primaryOpportunity: prospect.issue || null, observations: visible,
        hiddenFindings: Math.max(0, audit.length - visible.length), screenshots,
        generatedAt: prospect.completedAt || null, fullAccess: full, riskFlags: prospect.dossier?.riskFlags || []
      },
      offers: {
        full: this.checkoutFor(lead, 'full'), strategy: this.checkoutFor(lead, 'strategy'),
        monitoring: this.checkoutFor(lead, 'monitoring'),
        implementation: { priceFrom: this.cfg.revenue.implementationFrom, bookingUrl: this.cfg.revenue.bookingUrl }
      }
    };
  }

  async onProspectComplete(prospect) {
    if (!prospect?.leadId) return;
    const lead = await this.store.get('leads', prospect.leadId);
    if (!lead) return;
    const ready = ['ready', 'research-complete', 'rejected'].includes(prospect.status);
    await this.store.patch('leads', lead.id, { status: ready ? 'report-ready' : prospect.status, reportReadyAt: ready ? now() : null });
    if (ready && !(await this.store.findOne('notifications', { type: 'report_ready', leadId: lead.id }))) {
      await this.store.add('notifications', {
        id: id('note'), type: 'report_ready', leadId: lead.id, prospectId: prospect.id,
        title: `Audit ready: ${lead.company}`, status: 'unread', createdAt: now()
      });
    }
    if (ready && this.cfg.revenue.autoEmailReports && !lead.reportEmailSentAt && lead.reportEmailAttemptStatus !== 'uncertain') {
      await this.sendReportEmail(lead, prospect);
    }
  }

  async lockReportEmailLead(store, leadId) {
    if (store?.pool?.query) {
      const result = await store.pool.query('SELECT data FROM leads WHERE id=$1 FOR UPDATE', [leadId]);
      return result.rows[0]?.data || null;
    }
    return store.get('leads', leadId);
  }

  async lockReportEmailAccount(store, slot) {
    if (store?.pool?.query) {
      const result = await store.pool.query('SELECT data FROM accounts WHERE slot=$1 FOR UPDATE', [slot]);
      return result.rows[0]?.data || null;
    }
    return store.findOne('accounts', { slot });
  }

  async upsertReportEmailLead(store, current, patch) {
    // `PostgresStore.patch()` opens its own transaction, which is not valid
    // while this path is already inside the claim/finalization transaction.
    // Upsert is the store's direct scoped operation on both backends, so the
    // caller's row lock and the state transition share one transaction.
    return store.upsert('leads', { ...current, ...patch, updatedAt: now() });
  }

  // This is the only admission path to the irreversible report-email provider
  // call. The caller's lead is deliberately treated as a stale hint: the
  // durable row is re-read and claimed inside one transaction before the
  // provider boundary. JSON transactions serialize this naturally; PostgreSQL
  // locks the lead row for the same invariant across processes.
  async claimReportEmailAttempt(lead, prospect) {
    if (!lead?.id) return { ok: false, reason: 'missing-lead', lead, prospect };
    return this.store.transaction(async tx => {
      const current = await this.lockReportEmailLead(tx, lead.id);
      if (!current) return { ok: false, reason: 'missing-lead', lead, prospect };
      const durableProspect = current.prospectId ? await tx.get('prospects', current.prospectId) : null;
      const selectedProspect = durableProspect || prospect;
      const attemptStatus = String(current.reportEmailAttemptStatus || '').toLowerCase();

      if (current.reportEmailSentAt || attemptStatus === 'sent') {
        return { ok: false, reason: 'already-sent', lead: current, prospect: selectedProspect };
      }
      if (attemptStatus === 'uncertain') {
        // A prior provider effect is unresolved. It requires explicit owner
        // reconciliation and can never be replayed automatically.
        return { ok: false, reason: 'unresolved-prior-attempt-requires-owner-review', lead: current, prospect: selectedProspect };
      }
      if (attemptStatus === 'dispatching') {
        return { ok: false, reason: 'report-email-in-flight', lead: current, prospect: selectedProspect };
      }
      if (attemptStatus && !['dispatching', 'uncertain'].includes(attemptStatus)) {
        return { ok: false, reason: 'unrecognized-prior-attempt-state', lead: current, prospect: selectedProspect };
      }
      if (current.reportEmailAttemptId && !attemptStatus) {
        return { ok: false, reason: 'unrecognized-prior-attempt-state', lead: current, prospect: selectedProspect };
      }
      if (!selectedProspect) return { ok: false, reason: 'missing-prospect', lead: current, prospect: selectedProspect };
      if (!isEmail(current.email)) return { ok: false, reason: 'missing-destination', lead: current, prospect: selectedProspect };

      const account = await this.lockReportEmailAccount(tx, this.cfg.revenue.reportDeliveryInbox);
      if (!account?.connected) return { ok: false, reason: 'provider-capability-absent', lead: current, prospect: selectedProspect };
      const token = this.tokenForLead(current);
      if (!token) return { ok: false, reason: 'missing-access-token', lead: current, prospect: selectedProspect };

      const attemptId = id('report-attempt');
      const claimedAt = this.clock().toISOString();
      const claimed = await this.upsertReportEmailLead(tx, current, {
        reportEmailAttemptId: attemptId,
        reportEmailAttemptStatus: 'dispatching',
        reportEmailClaimedAt: claimedAt,
        reportEmailUncertainAt: null,
        reportEmailUncertainReason: null
      });
      return { ok: true, attemptId, lead: claimed || current, prospect: selectedProspect, account, token };
    });
  }

  async markReportEmailUncertain({ leadId, attemptId, prospect, reason }) {
    try {
      return await this.store.transaction(async tx => {
        const current = await this.lockReportEmailLead(tx, leadId);
        if (!current) return { persisted: false, reason: 'missing-lead' };
        const status = String(current.reportEmailAttemptStatus || '').toLowerCase();
        if (current.reportEmailSentAt || status === 'sent') return { persisted: false, terminal: 'sent' };
        if (current.reportEmailAttemptId && current.reportEmailAttemptId !== attemptId) {
          return { persisted: false, reason: 'claim-replaced' };
        }
        const updated = await this.upsertReportEmailLead(tx, current, {
          reportEmailAttemptStatus: 'uncertain',
          reportEmailUncertainAt: this.clock().toISOString(),
          reportEmailUncertainReason: reason
        });
        await this.logReportEmailDecisionOn(tx, 'uncertain', reason, { lead: updated || current, prospect });
        return { persisted: true, lead: updated || current };
      });
    } catch {
      // A failed uncertainty write leaves the durable pre-provider claim in
      // dispatching. That state is itself a permanent automatic-retry block;
      // never fall back to replay merely because this repair receipt failed.
      return { persisted: false, reason: 'uncertainty-persistence-failed' };
    }
  }

  async finalizeReportEmailAttempt(claim, result) {
    const providerId = String(result?.data?.id || '').trim();
    const providerThreadId = String(result?.data?.threadId || '').trim();
    if (!providerId || !providerThreadId) throw new Error('provider-result-missing-message-reference');

    return this.store.transaction(async tx => {
      const current = await this.lockReportEmailLead(tx, claim.lead.id);
      if (!current) throw new Error('report-email-lead-missing-during-finalization');
      const status = String(current.reportEmailAttemptStatus || '').toLowerCase();
      if (current.reportEmailSentAt || status === 'sent') return { sent: false, reason: 'already-sent' };
      if (status !== 'dispatching' || current.reportEmailAttemptId !== claim.attemptId) {
        throw new Error('report-email-claim-not-current');
      }

      const account = await this.lockReportEmailAccount(tx, this.cfg.revenue.reportDeliveryInbox);
      if (!account) throw new Error('report-email-account-missing-during-finalization');
      if (result.tokens) {
        await tx.upsert('accounts', { ...account, tokens: sealTokens(result.tokens, this.cfg.encryptionKey) });
      }

      const sentAt = this.clock().toISOString();
      const updated = await this.upsertReportEmailLead(tx, current, {
        reportEmailSentAt: sentAt,
        reportEmailAttemptStatus: 'sent',
        reportEmailProviderId: providerId,
        reportEmailProviderThreadId: providerThreadId,
        reportEmailFinalizedAt: sentAt
      });
      await tx.add('messages', {
        id: `report-email:${claim.attemptId}`, kind: 'transactional-report', leadId: current.id,
        prospectId: claim.prospect.id, inbox: account.slot, to: current.email,
        subject: `${current.company} digital opportunity report`, gmailId: providerId,
        threadId: providerThreadId, sentAt
      });
      await this.logReportEmailDecisionOn(tx, 'sent', 'sent', { lead: updated || current, prospect: claim.prospect });
      return { sent: true };
    });
  }

  async sendReportEmail(lead, prospect) {
    if (!this.cfg.revenue?.autoEmailReports) {
      await this.logReportEmailDecision('blocked', 'kill-switch-disabled', { lead, prospect });
      return { sent: false, reason: 'kill-switch-disabled' };
    }

    const claim = await this.claimReportEmailAttempt(lead, prospect);
    if (!claim.ok) {
      await this.logReportEmailDecision('blocked', claim.reason, { lead: claim.lead || lead, prospect: claim.prospect || prospect });
      return { sent: false, reason: claim.reason };
    }

    const reportUrl = `${this.cfg.baseUrl}/report.html?token=${encodeURIComponent(claim.token)}`;
    const body = `Hi,\n\nYour UberBond Digital Opportunity Snapshot for ${claim.lead.company} is ready.\n\nScore: ${claim.prospect.score?.total ?? 'ready'}\nView the report: ${reportUrl}\n\nThe free snapshot includes the primary evidence-backed opportunity. The report page also contains options for a full audit, strategy review, and recurring monitoring.\n\nUberBond`;

    let result;
    try {
      result = await this.sendEmailFn(this.cfg.google, claim.account, this.cfg.encryptionKey, {
        from: `${this.cfg.sender.name} <${claim.account.email}>`, to: claim.lead.email,
        subject: `${claim.lead.company} digital opportunity report`, body
      });
    } catch {
      await this.markReportEmailUncertain({
        leadId: claim.lead.id, attemptId: claim.attemptId, prospect: claim.prospect,
        reason: 'provider-result-uncertain'
      });
      return { sent: false, uncertain: true, reason: 'provider-result-uncertain' };
    }

    try {
      return await this.finalizeReportEmailAttempt(claim, result);
    } catch {
      // The provider has already answered successfully, so every local failure
      // after this point is an uncertain external effect, never a safe retry.
      await this.markReportEmailUncertain({
        leadId: claim.lead.id, attemptId: claim.attemptId, prospect: claim.prospect,
        reason: 'post-provider-persistence-failed'
      });
      return { sent: false, uncertain: true, reason: 'post-provider-persistence-failed' };
    }
  }

  async unlockLead(leadId, product = 'full', detail = {}, store = this.store) {
    const lead = await store.get('leads', leadId);
    if (!lead) throw new Error('Lead not found');
    await store.patch('leads', lead.id, {
      paymentStatus: 'paid', plan: product, paidAt: now(), provider: detail.provider || 'manual'
    });
    const amount = Number(detail.amountCents || ({
      full: this.cfg.revenue.fullAuditPrice,
      strategy: this.cfg.revenue.strategyAuditPrice,
      monitoring: this.cfg.revenue.monitoringPrice
    }[product] || 0) * 100);
    const eventId = detail.eventId || id('rev');
    try {
      await store.add('revenueEvents', {
        id: id('rev'), providerEventId: eventId, leadId: lead.id, prospectId: lead.prospectId,
        product, kind: product === 'monitoring' ? 'subscription' : 'sale', amountCents: amount,
        currency: detail.currency || 'USD', createdAt: now()
      });
    } catch (error) {
      if (!(error instanceof ConflictError)) throw error;
    }
    if (product === 'monitoring') await this.activateSubscription(lead, detail, store);
    await store.add('notifications', {
      id: id('note'), type: 'payment', leadId: lead.id, prospectId: lead.prospectId,
      title: `Payment received: ${lead.company} · ${product}`, status: 'unread', createdAt: now()
    });
    return store.get('leads', lead.id);
  }

  async activateSubscription(lead, detail = {}, store = this.store) {
    const subscriptions = await store.list('subscriptions');
    let subscription = subscriptions.find(item =>
      item.leadId === lead.id && item.provider === (detail.provider || 'lemonsqueezy') && item.status !== 'expired'
    );
    const nextRunAt = new Date(Date.now() + this.cfg.revenue.monitoringIntervalDays * DAY).toISOString();
    if (subscription) {
      await store.patch('subscriptions', subscription.id, {
        providerId: String(detail.providerId || subscription.providerId || ''), status: detail.status || 'active',
        amountCents: Number(detail.amountCents || subscription.amountCents || this.cfg.revenue.monitoringPrice * 100),
        currency: detail.currency || subscription.currency || 'USD', nextRunAt
      });
      return store.get('subscriptions', subscription.id);
    }
    subscription = {
      id: id('sub'), leadId: lead.id, prospectId: lead.prospectId,
      provider: detail.provider || 'lemonsqueezy', providerId: String(detail.providerId || ''),
      status: detail.status || 'active', amountCents: Number(detail.amountCents || this.cfg.revenue.monitoringPrice * 100),
      currency: detail.currency || 'USD', intervalDays: this.cfg.revenue.monitoringIntervalDays,
      nextRunAt, createdAt: now()
    };
    await store.add('subscriptions', subscription);
    return subscription;
  }

  async logPaymentDecision(event, decision, lead, store = this.store) {
    return store.log('payment_classification', {
      classification: decision.classification,
      reasonCodes: decision.reasonCodes,
      eventName: event?.eventName || null,
      eventId: event?.eventId || null,
      providerOccurrenceId: event?.providerOccurrenceId || event?.eventId || null,
      providerObjectId: event?.providerObjectId || null,
      providerStateDigest: event?.snapshotDigest || null,
      // The money this classification was made about.
      //
      // `payment-renewal-truth` compares amount and currency across all three
      // witnesses -- order, receipt, ledger -- and treats an absent field as
      // silence rather than disagreement, so that older receipts keep
      // reconciling. This writer is the only producer of `payment_classification`
      // rows, and it never wrote either field, so the receipt was permanently
      // silent and the "triple witness" was a double witness on money.
      //
      // The consequence was not theoretical: corrupt the order and the ledger
      // to agree with each other at 100x and the reconciliation reported
      // $4,900.00 PROVIDER_CLEARED_PAYMENT_PROVEN with no contradictions,
      // because the one witness written by a different code path at a different
      // moment had nothing to say about the number.
      amountCents: Number.isSafeInteger(Number(event?.amountCents)) ? Number(event.amountCents) : null,
      providerAmountCents: safeCents(event?.providerAmountCents),
      cumulativeRefundedAmountCents: safeCents(event?.cumulativeRefundedAmountCents),
      refundDeltaCents: safeCents(event?.refundDeltaCents),
      currency: String(event?.currency || '').trim().toUpperCase() || null,
      leadId: lead?.id || event?.custom?.lead_id || null,
      prospectId: lead?.prospectId || event?.custom?.prospect_id || null,
      product: event?.custom?.product || null,
      testMode: Boolean(event?.testMode),
      shouldUnlock: decision.shouldUnlock,
      shouldRecordRevenue: decision.shouldRecordRevenue,
      revenueKind: decision.revenueKind,
      policyVersion: PAYMENT_TRUTH_POLICY_VERSION,
      timestamp: this.clock().toISOString()
    });
  }

  async recordRevenueEvent(lead, event, decision, store = this.store) {
    const eventId = `${event.eventName}:${event.eventId}`;
    try {
      await store.add('revenueEvents', {
        id: id('rev'), providerEventId: eventId, leadId: lead?.id || null, prospectId: lead?.prospectId || null,
        product: event.custom?.product || '', kind: decision.revenueKind,
        amountCents: Number(event.amountCents || 0) * decision.revenueSign,
        currency: event.currency || 'USD', createdAt: now()
      });
    } catch (error) {
      if (!(error instanceof ConflictError)) throw error;
    }
    if (decision.revenueKind === 'refund' && lead?.id) {
      await store.patch('leads', lead.id, { refundedAt: now() });
    }
  }

  paymentOrderWitness(event) {
    return {
      provider: 'lemonsqueezy', providerEventId: event.eventId,
      providerOccurrenceId: event.providerOccurrenceId || event.eventId,
      providerObjectId: event.providerObjectId || '',
      providerStateDigest: event.snapshotDigest || '',
      eventName: event.eventName, leadId: event.custom.lead_id || '', prospectId: event.custom.prospect_id || '',
      product: event.custom.product || '', amountCents: event.amountCents, currency: event.currency,
      providerAmountCents: event.providerAmountCents,
      providerCumulativeRefundedAmountCents: event.cumulativeRefundedAmountCents,
      refundDeltaCents: event.refundDeltaCents,
      status: event.status, testMode: event.testMode
    };
  }

  async legacyPaymentEventComplete(store, event, decision, lead) {
    const classified = (await store.list('auditLog')).some(entry => {
      const detail = entry?.detail || {};
      return entry?.type === 'payment_classification'
        && detail.eventName === event.eventName
        && detail.eventId === event.eventId
        && detail.classification === decision.classification;
    });
    if (!classified) return false;

    const eventKey = `${event.eventName}:${event.eventId}`;
    if (decision.shouldUnlock || decision.shouldRecordRevenue) {
      const revenue = await store.findOne('revenueEvents', { providerEventId: eventKey });
      if (!revenue) return false;
      if (decision.shouldUnlock && lead?.paymentStatus !== 'paid') return false;
      if (decision.revenueKind === 'refund' && lead?.id && !lead.refundedAt) return false;
      if (decision.shouldUnlock && event.custom?.product === 'monitoring') {
        const subscriptions = await store.list('subscriptions');
        if (!subscriptions.some(item => item.leadId === lead?.id && item.provider === 'lemonsqueezy' && item.status !== 'expired')) return false;
      }
    }
    if (decision.shouldSyncSubscriptionStatus && lead?.id) {
      const subscription = (await store.list('subscriptions')).find(item => item.leadId === lead.id);
      if (subscription && subscription.status !== decision.subscriptionStatus) return false;
    }
    return true;
  }

  async applyLemonDecisionTransaction(store, lead, event, decision) {
    const leadId = event.custom.lead_id || '';
    if (decision.shouldUnlock) {
      await this.unlockLead(leadId, event.custom.product || 'full', {
        provider: 'lemonsqueezy', providerId: event.providerObjectId || event.eventId,
        eventId: `${event.eventName}:${event.eventId}`, amountCents: event.amountCents,
        currency: event.currency, status: decision.subscriptionStatus || event.status || 'active'
      }, store);
    } else if (decision.shouldRecordRevenue) {
      await this.recordRevenueEvent(lead, event, decision, store);
    }

    if (decision.shouldSyncSubscriptionStatus && !decision.shouldUnlock && leadId) {
      const subscription = (await store.list('subscriptions')).find(item => item.leadId === leadId);
      if (subscription) {
        await store.patch('subscriptions', subscription.id, {
          status: decision.subscriptionStatus,
          nextRunAt: decision.subscriptionStatus === 'active'
            ? (subscription.nextRunAt || new Date(Date.now() + this.cfg.revenue.monitoringIntervalDays * DAY).toISOString())
            : null
        });
      }
    }
  }

  async handleLemonWebhook(rawBody, signature) {
    if (!verifyLemonSignature(rawBody, signature, this.cfg.revenue.lemonWebhookSecret)) throw new Error('Invalid webhook signature');
    const payload = JSON.parse(rawBody);
    const event = normalizeLemonEvent(payload);

    // Serialize state transitions for one Lemon object. A provider object can
    // emit order_created and then several order_refunded snapshots, all with
    // the same data.id. The lock is a no-op for JSON (its transaction queue is
    // already serialized) and a transaction advisory lock for PostgreSQL.
    // This protects the refund delta calculation without confusing object
    // identity with webhook occurrence identity.
    const prepared = await this.store.transaction(async tx => {
      const lockKey = event.providerObjectId || event.eventId;
      if (tx.pool?.query && lockKey) {
        await tx.pool.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`lemon-webhook:${lockKey}`]);
      }

      const orders = await tx.list('orders');
      const existing = orders.find(row => row.provider === 'lemonsqueezy' && row.providerEventId === event.eventId);
      if (existing) {
        const contradictory = Boolean(
          existing.providerStateDigest && event.snapshotDigest && existing.providerStateDigest !== event.snapshotDigest
        );
        return {
          kind: contradictory ? 'review' : 'existing',
          event,
          existing,
          reasonCodes: contradictory ? ['duplicate-provider-event-contradiction'] : ['duplicate-provider-event-id']
        };
      }

      const sameObject = event.providerObjectId
        ? orders.filter(row => row.provider === 'lemonsqueezy' && (
            row.providerObjectId === event.providerObjectId
            // Rows written before object/occurrence separation are still part
            // of the same provider object when their old event id is data.id.
            || (!row.providerObjectId && row.providerEventId === event.providerObjectId)
          ))
        : [];
      const stateReasonCodes = [];
      const nonFatalStateReasonCodes = [];
      let preparedEvent = { ...event };

      if (event.eventName === 'order_refunded') {
        const nonNegativeCents = value => {
          const number = Number(value);
          return Number.isSafeInteger(number) && number >= 0 ? number : null;
        };
        const cumulative = nonNegativeCents(event.cumulativeRefundedAmountCents);
        // Older stored witnesses and a few provider integrations may not carry
        // the same object id on the refund. If the signed custom data identifies
        // exactly one order, use that order as a cautious migration fallback;
        // the normal path remains provider-object linkage.
        let relatedOrders = sameObject;
        if (!relatedOrders.length) {
          const candidates = orders.filter(row => row.provider === 'lemonsqueezy'
            && row.eventName === 'order_created'
            && String(row.leadId || '') === String(event.custom.lead_id || '')
            && String(row.prospectId || '') === String(event.custom.prospect_id || '')
            && String(row.product || '') === String(event.custom.product || '')
            && String(row.currency || '').toUpperCase() === String(event.currency || '').toUpperCase());
          if (candidates.length === 1) {
            relatedOrders = candidates;
            nonFatalStateReasonCodes.push('refund-object-linkage-fallback');
          }
        }
        const refundHistory = sameObject.length
          ? sameObject
          : orders.filter(row => row.provider === 'lemonsqueezy'
            && row.eventName === 'order_refunded'
            && String(row.leadId || '') === String(event.custom.lead_id || '')
            && String(row.prospectId || '') === String(event.custom.prospect_id || '')
            && String(row.product || '') === String(event.custom.product || '')
            && String(row.currency || '').toUpperCase() === String(event.currency || '').toUpperCase());
        const revenueEvents = await tx.list('revenueEvents');
        const clearedRevenue = revenueEvents.filter(row => Number(row.amountCents || 0) > 0
          && relatedOrders.some(order => {
            const occurrence = order.providerOccurrenceId || order.providerEventId;
            return row.providerEventId === `${order.eventName}:${occurrence}`
              || row.providerEventId === order.providerEventId;
          }));
        const priorCumulative = Math.max(0, ...refundHistory
          .filter(row => row.eventName === 'order_refunded')
          .map(row => nonNegativeCents(
            row.providerCumulativeRefundedAmountCents
              ?? row.cumulativeRefundedAmountCents
              ?? Math.abs(Number(row.amountCents || 0))
          ) ?? 0));
        const originalAmount = Math.max(0, ...clearedRevenue
          .map(row => nonNegativeCents(row.amountCents) ?? 0));

        if (cumulative === null) stateReasonCodes.push('refund-cumulative-amount-invalid');
        const currentCumulative = cumulative ?? 0;
        const delta = currentCumulative - priorCumulative;
        preparedEvent = {
          ...preparedEvent,
          amountCents: delta > 0 ? delta : 0,
          providerAmountCents: currentCumulative,
          cumulativeRefundedAmountCents: currentCumulative,
          refundDeltaCents: delta
        };
        if (delta < 0) stateReasonCodes.push('refund-cumulative-regression');
        else if (delta === 0) stateReasonCodes.push('refund-state-already-applied');
        if (delta > 0 && originalAmount === 0) stateReasonCodes.push('refund-before-cleared-payment');
        if (delta > 0 && originalAmount > 0 && currentCumulative > originalAmount) {
          stateReasonCodes.push('refund-exceeds-cleared-order');
        }
      }

      const witness = this.paymentOrderWitness(preparedEvent);
      const order = {
        id: id('order'), ...witness, processingStatus: 'received',
        stateReasonCodes, nonFatalStateReasonCodes, createdAt: now()
      };
      try {
        await tx.add('orders', order);
      } catch (error) {
        if (!(error instanceof ConflictError)) throw error;
        const winner = await tx.findOne('orders', { providerEventId: preparedEvent.eventId });
        if (!winner) throw error;
        return { kind: 'existing', event: preparedEvent, existing: winner };
      }
      return { kind: 'new', event: preparedEvent, stateReasonCodes, nonFatalStateReasonCodes };
    });

    if (prepared.kind === 'review') {
      const decision = {
        classification: 'REVIEW_REQUIRED',
        reasonCodes: prepared.reasonCodes,
        shouldUnlock: false, shouldRecordRevenue: false, revenueKind: null
      };
      await this.logPaymentDecision(prepared.event, decision, null);
      return { review: true, event: prepared.event, classification: decision.classification, reasonCodes: decision.reasonCodes };
    }

    return this.store.transaction(async tx => {
      const lockKey = event.providerObjectId || event.eventId;
      if (tx.pool?.query && lockKey) {
        await tx.pool.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`lemon-webhook:${lockKey}`]);
      }

      let order = await tx.findOne('orders', { providerEventId: event.eventId });
      if (!order) throw new Error('Payment witness missing after verified webhook persistence');
      if (tx.pool?.query) {
        await tx.pool.query('SELECT data FROM orders WHERE id=$1 FOR UPDATE', [order.id]);
        order = await tx.get('orders', order.id);
      }

      const contradictory = Boolean(
        order.providerStateDigest && event.snapshotDigest && order.providerStateDigest !== event.snapshotDigest
      );
      if (contradictory) {
        const decision = {
          classification: 'REVIEW_REQUIRED',
          reasonCodes: ['duplicate-provider-event-contradiction'],
          shouldUnlock: false, shouldRecordRevenue: false, revenueKind: null
        };
        await this.logPaymentDecision(event, decision, null, tx);
        return { review: true, event, classification: decision.classification, reasonCodes: decision.reasonCodes };
      }

      if (order.processingStatus === 'completed') {
        const decision = {
          classification: 'DUPLICATE', reasonCodes: ['duplicate-provider-event-id'],
          shouldUnlock: false, shouldRecordRevenue: false, revenueKind: null
        };
        await this.logPaymentDecision(event, decision, null, tx);
        return { duplicate: true, event };
      }

      const eventToProcess = {
        ...prepared.event,
        eventId: order.providerOccurrenceId || order.providerEventId,
        providerOccurrenceId: order.providerOccurrenceId || order.providerEventId,
        providerObjectId: order.providerObjectId || prepared.event.providerObjectId,
        snapshotDigest: order.providerStateDigest || prepared.event.snapshotDigest,
        amountCents: order.amountCents ?? prepared.event.amountCents,
        providerAmountCents: order.providerAmountCents ?? prepared.event.providerAmountCents,
        cumulativeRefundedAmountCents: order.providerCumulativeRefundedAmountCents ?? prepared.event.cumulativeRefundedAmountCents,
        refundDeltaCents: order.refundDeltaCents,
        currency: order.currency || prepared.event.currency,
        status: order.status || prepared.event.status,
        testMode: order.testMode ?? prepared.event.testMode
      };
      const leadId = eventToProcess.custom.lead_id || '';
      if (tx.pool?.query && leadId) {
        await tx.pool.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`payment-lead:${leadId}`]);
        await tx.pool.query('SELECT data FROM leads WHERE id=$1 FOR UPDATE', [leadId]);
      }
      const lead = leadId ? await tx.get('leads', leadId) : null;
      let decision = classifyPaymentEvent({ event: eventToProcess, lead, cfg: this.cfg });

      if (!order.processingStatus && await this.legacyPaymentEventComplete(tx, eventToProcess, decision, lead)) {
        await tx.upsert('orders', { ...order, processingStatus: 'completed', processedAt: now(), classification: decision.classification, updatedAt: now() });
        const duplicate = {
          classification: 'DUPLICATE', reasonCodes: ['duplicate-provider-event-id', 'legacy-event-already-complete'],
          shouldUnlock: false, shouldRecordRevenue: false, revenueKind: null
        };
        await this.logPaymentDecision(eventToProcess, duplicate, lead, tx);
        return { duplicate: true, event: eventToProcess };
      }

      const hardStateReasonCodes = Array.isArray(order.stateReasonCodes)
        ? order.stateReasonCodes
        : (prepared.stateReasonCodes || []);
      const nonFatalStateReasonCodes = Array.isArray(order.nonFatalStateReasonCodes)
        ? order.nonFatalStateReasonCodes
        : (prepared.nonFatalStateReasonCodes || []);
      const stateReasonCodes = [...new Set([...hardStateReasonCodes, ...nonFatalStateReasonCodes])];
      if (hardStateReasonCodes.length) {
        const reasonCodes = [...new Set([...decision.reasonCodes, ...stateReasonCodes])];
        const noEconomicDelta = hardStateReasonCodes.length === 1
          && hardStateReasonCodes[0] === 'refund-state-already-applied';
        decision = {
          ...decision,
          reasonCodes,
          ...(noEconomicDelta ? {
            shouldUnlock: false, shouldRecordRevenue: false, revenueKind: null, revenueSign: 0
          } : {
            classification: 'REVIEW_REQUIRED',
            shouldUnlock: false, shouldRecordRevenue: false, revenueKind: null, revenueSign: 0,
            shouldSyncSubscriptionStatus: false, subscriptionStatus: null
          })
        };
      }

      await this.logPaymentDecision(eventToProcess, decision, lead, tx);
      await this.applyLemonDecisionTransaction(tx, lead, eventToProcess, decision);
      await tx.upsert('orders', {
        ...order, processingStatus: 'completed', processedAt: now(), classification: decision.classification,
        stateReasonCodes, nonFatalStateReasonCodes, updatedAt: now()
      });

      if (hardStateReasonCodes.length && decision.classification === 'REVIEW_REQUIRED') {
        return {
          review: true, event: eventToProcess, classification: decision.classification,
          reasonCodes: decision.reasonCodes
        };
      }
      return { ok: true, event: eventToProcess, classification: decision.classification, resumed: prepared.kind === 'existing' };
    });
  }

  async processMonitoring() {
    const due = (await this.store.list('subscriptions'))
      .filter(item => ['active', 'on_trial', 'trialing'].includes(item.status) && item.nextRunAt && Date.parse(item.nextRunAt) <= Date.now())
      .slice(0, this.cfg.revenue.monitoringBatchSize);
    for (const subscription of due) {
      const prospect = await this.store.get('prospects', subscription.prospectId);
      if (!prospect) continue;
      const run = {
        id: id('mon'), subscriptionId: subscription.id, leadId: subscription.leadId,
        prospectId: subscription.prospectId, status: 'queued', previousScore: prospect.score?.total ?? null,
        createdAt: now()
      };
      await this.store.add('monitoringRuns', run);
      const history = [...(prospect.auditHistory || [])];
      if (prospect.dossier) history.push({ generatedAt: prospect.completedAt || now(), score: prospect.score, dossier: prospect.dossier });
      await this.store.patch('prospects', prospect.id, { status: 'retry', auditHistory: history.slice(-12), monitoringRunId: run.id });
      await this.store.patch('subscriptions', subscription.id, {
        nextRunAt: new Date(Date.now() + subscription.intervalDays * DAY).toISOString(), lastRunAt: now()
      });
    }
    if (due.length) {
      if (this.hooks.enqueueResearch) {
        await this.hooks.enqueueResearch({ limit: Math.min(due.length, this.cfg.revenue.monitoringBatchSize), reason: 'monitoring' });
      } else if (!this.pipeline.running && !this.pipeline.paused) {
        await this.pipeline.runBatch(Math.min(due.length, this.cfg.revenue.monitoringBatchSize));
      }
    }
    const queuedRuns = (await this.store.list('monitoringRuns')).filter(run => run.status === 'queued');
    for (const run of queuedRuns) {
      const prospect = await this.store.get('prospects', run.prospectId);
      if (prospect && ['ready', 'research-complete', 'rejected'].includes(prospect.status)) {
        await this.store.patch('monitoringRuns', run.id, {
          status: 'completed', newScore: prospect.score?.total ?? null, completedAt: now()
        });
      }
    }
    return due.length;
  }

  async summary() {
    const [events, allSubscriptions, leads, orders, notifications] = await Promise.all([
      this.store.list('revenueEvents'), this.store.list('subscriptions'), this.store.list('leads'),
      this.store.list('orders'), this.store.list('notifications')
    ]);
    const subscriptions = allSubscriptions.filter(item => ['active', 'on_trial', 'trialing'].includes(item.status));
    // Refunds are stored as negative revenueEvents (kind: 'refund'), so a
    // plain sum already nets them out of grossRevenue without special-casing.
    const grossCents = events.reduce((sum, event) => sum + Number(event.amountCents || 0), 0);
    const clearedCents = events.filter(event => Number(event.amountCents || 0) > 0).reduce((sum, event) => sum + Number(event.amountCents || 0), 0);
    const refundedCents = Math.abs(events.filter(event => Number(event.amountCents || 0) < 0).reduce((sum, event) => sum + Number(event.amountCents || 0), 0));
    const mrrCents = subscriptions.reduce((sum, subscription) => sum + Number(subscription.amountCents || 0), 0);
    const today = new Date().toISOString().slice(0, 10);
    const todayCents = events.filter(event => event.createdAt?.startsWith(today)).reduce((sum, event) => sum + Number(event.amountCents || 0), 0);
    const pendingOrders = orders.filter(order =>
      order.eventName === 'order_created' && !['paid', 'completed', 'success'].includes(String(order.status || '').toLowerCase())
    ).length;
    return {
      leads: leads.length,
      reportReady: leads.filter(lead => lead.status === 'report-ready').length,
      orders: orders.length,
      paidCustomers: leads.filter(lead => lead.paymentStatus === 'paid').length,
      activeSubscriptions: subscriptions.length,
      grossRevenue: grossCents / 100,
      clearedRevenue: clearedCents / 100,
      refundedRevenue: refundedCents / 100,
      pendingOrders,
      mrr: mrrCents / 100,
      todayRevenue: todayCents / 100,
      dailyTarget: 200,
      targetProgress: Math.min(100, Math.round((todayCents / 100) / 200 * 100)),
      notifications: notifications.filter(notification => notification.status !== 'read').length
    };
  }
}
