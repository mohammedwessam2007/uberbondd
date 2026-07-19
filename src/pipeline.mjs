import { id, now, normalizeDomain, sleep, uniq } from './utils.mjs';
import { crawlSiteBrowser } from './browser-crawler.mjs';
import { deterministicAudit, scoreProspect, chooseIssue } from './audit-rules.mjs';
import { enhanceAudit, enhanceOutreach, classifyReply } from './ai.mjs';
import { discoverContacts, verifyEmail } from './contacts.mjs';
import { buildMessage, buildSubject, composeOutreach, createOutreachContext, outreachContextForAi, routeInbox } from './copy.mjs';
import { buildDossier } from './dossier.mjs';
import { createTestGmailAdapter, sendEmail, listMessages, getMessage, parseGmailMessage, sealTokens } from './gmail.mjs';
import { ConflictError } from './store.mjs';
import { persistCrawlArtifacts } from './artifacts.mjs';
import { contactEligibility, deterministicCadenceSeconds, evaluateSendEligibility, sendIdempotencyKey } from './send-safety.mjs';
import {
  classifyReplyWithFallback,
  matchReplyToProspect,
  prospectReplyPatch,
  responseDraftFor,
  suppressionPolicy
} from './replies.mjs';
import { unsubscribeUrl, oneClickUnsubscribeUrl } from './unsubscribe.mjs';
import {
  CrawlProcessingError,
  assessCrawlQuality,
  classifyCrawlFailure,
  noUsableCrawlError,
  validateAuditEvidence
} from './qualification.mjs';

const campaignFollowupLimit = campaign => Math.max(0, Math.min(1, Number(campaign?.maximumFollowups ?? campaign?.maxFollowups ?? 0)));
const campaignFollowupDelayMs = campaign => Math.max(1, Math.min(30, Number(campaign?.followupDelayDays ?? 5))) * 86400000;

class CrawlSemaphore {
  constructor(limit = 1) {
    this.limit = Math.max(1, Number(limit || 1));
    this.active = 0;
    this.waiting = [];
  }

  async acquire() {
    if (this.active < this.limit) this.active += 1;
    else await new Promise(resolve => this.waiting.push(resolve));
    let released = false;
    return () => {
      if (released) return;
      released = true;
      const next = this.waiting.shift();
      if (next) next();
      else this.active = Math.max(0, this.active - 1);
    };
  }
}

export class Pipeline {
  constructor(store, cfg, hooks = {}) {
    this.store = store;
    this.cfg = cfg;
    this.hooks = hooks;
    this.running = false;
    this.activeBatches = 0;
    this.paused = false;
    this.mailAdapter = hooks.mailAdapter || (cfg.outbound?.provider === 'test' ? createTestGmailAdapter() : null);
    this.sendEmailFn = hooks.sendEmail || this.mailAdapter?.sendEmail || sendEmail;
    this.getMessageFn = hooks.getMessage || this.mailAdapter?.getMessage || getMessage;
    this.listMessagesFn = hooks.listMessages || this.mailAdapter?.listMessages || listMessages;
    this.parseMessageFn = hooks.parseGmailMessage || parseGmailMessage;
    this.classifyReplyFn = hooks.classifyReply || classifyReply;
    this.clock = hooks.clock || (() => new Date());
    this.sleepFn = hooks.sleep || sleep;
    this.crawlSiteFn = hooks.crawlSite || crawlSiteBrowser;
    this.enhanceAuditFn = hooks.enhanceAudit || enhanceAudit;
    this.enhanceOutreachFn = hooks.enhanceOutreach || enhanceOutreach;
    this.discoverContactsFn = hooks.discoverContacts || discoverContacts;
    this.verifyEmailFn = hooks.verifyEmail || verifyEmail;
    this.crawlSemaphore = new CrawlSemaphore(this.cfg.crawl?.concurrency || 1);
  }

  async isSuppressed(prospect, email = '') {
    const domain = normalizeDomain(prospect.website);
    const normalizedEmail = String(email).toLowerCase();
    const suppressions = await this.store.list('suppressions');
    return suppressions.some(item => String(item.value || '').toLowerCase() === normalizedEmail || String(item.value || '').toLowerCase() === domain);
  }

  async addSuppression(prospect, reason, { includeDomain = false } = {}) {
    const values = [String(prospect.contact?.email || '').toLowerCase()];
    if (includeDomain) values.push(normalizeDomain(prospect.website));
    if (typeof this.store.suppressOutbound === 'function') {
      await this.store.suppressOutbound({ values: [...new Set(values.filter(Boolean))], reason });
      return;
    }
    for (const value of [...new Set(values.filter(Boolean))]) {
      try { await this.store.add('suppressions', { id: id('sup'), value, reason, createdAt: now() }); }
      catch (error) { if (!(error instanceof ConflictError)) throw error; }
    }
  }

  async hasPaymentStop(prospect) {
    if (prospect.paymentStatus === 'paid' || prospect.paidAt) return true;
    if (prospect.leadId) {
      const lead = await this.store.get('leads', prospect.leadId);
      if (lead?.paymentStatus === 'paid' || lead?.paidAt) return true;
    }
    const orders = await this.store.list('orders');
    return orders.some(order => order.prospectId === prospect.id && ['paid', 'order_created', 'subscription_created', 'transaction.completed'].includes(String(order.status || order.eventName || '').toLowerCase()));
  }

  async campaignFor(prospect) {
    return this.store.get('campaigns', prospect.campaignId);
  }

  campaignPageLimit(campaign) {
    const systemLimit = Math.max(1, Math.min(12, Number(this.cfg.crawl?.maxPages || 5)));
    const campaignLimit = Math.max(1, Math.min(12, Number(campaign?.maximumPagesPerSite || systemLimit)));
    return Math.min(systemLimit, campaignLimit);
  }

  async prepareProspectOutreach({ prospect, campaign, issue, contact, score, auditDate, deferDrafts = false }) {
    const configuredProspectScore = Number(campaign.minimumProspectScore ?? campaign.minScore ?? 0);
    const minimumProspectScore = Number.isFinite(configuredProspectScore)
      ? Math.max(0, Math.min(100, configuredProspectScore))
      : 0;
    const researchQualified = Boolean(issue && Number(score?.total || 0) >= minimumProspectScore);
    const suppressed = contact?.email ? await this.isSuppressed(prospect, contact.email) : false;
    const contactReadiness = contactEligibility(contact || {}, prospect);
    const configuredDraftCap = Number(campaign.dailyDraftCap ?? 100);
    const dailyDraftCap = Number.isFinite(configuredDraftCap) ? Math.max(0, Math.min(100, configuredDraftCap)) : 100;
    const draftCapacity = deferDrafts && researchQualified
      ? { ok: false, deferred: true, reason: 'queued-for-draft-worker', remaining: dailyDraftCap }
      : researchQualified && typeof this.store.reserveDraftCapacity === 'function'
        ? await this.store.reserveDraftCapacity(campaign.id, auditDate, dailyDraftCap, prospect.id)
        : researchQualified ? { ok: true, remaining: dailyDraftCap } : { ok: false, reason: 'not-qualified' };
    const optoutUrl = contact?.email ? unsubscribeUrl(this.cfg.baseUrl, prospect.id, this.cfg.unsubscribeSecret) : '';
    const oneClickOptoutUrl = contact?.email ? oneClickUnsubscribeUrl(this.cfg.baseUrl, prospect.id, this.cfg.unsubscribeSecret) : '';
    const outreachContext = researchQualified && draftCapacity.ok
      ? createOutreachContext({ prospect, issue, contact, sender: this.cfg.sender, campaign, unsubscribeUrl: optoutUrl })
      : null;
    let aiDraftCandidates = [];
    const outreachAiMeta = { attempted: false, accepted: 0, rejected: 0 };
    if (outreachContext?.valid && this.cfg.ai?.provider && this.cfg.ai.provider !== 'rules') {
      outreachAiMeta.attempted = true;
      outreachAiMeta.provider = this.cfg.ai.provider;
      try {
        const enhanced = await this.enhanceOutreachFn(this.cfg.ai, outreachContextForAi(outreachContext));
        aiDraftCandidates = Array.isArray(enhanced?.variants) ? enhanced.variants : [];
      } catch {
        await this.store.log('ai_outreach_failed', { prospectId: prospect.id, code: 'provider_or_validation_failure' });
      }
    }
    const outreach = outreachContext
      ? composeOutreach({ context: outreachContext, aiCandidates: aiDraftCandidates, selectionKey: prospect.id })
      : null;
    if (outreach) {
      outreachAiMeta.accepted = outreach.variants.filter(variant => variant.source === 'ai').length;
      outreachAiMeta.rejected = outreach.rejectedVariants.filter(variant => variant.source === 'ai').length;
    }
    const draftReady = Boolean(outreach?.selected?.quality?.passed);
    const sendEligible = Boolean(
      researchQualified && draftReady && contact?.email && contactReadiness.ok && !suppressed
    );
    const draft = draftReady ? outreach.selected.body : '';
    const subject = draftReady ? outreach.selected.subject : '';
    const status = researchQualified ? (sendEligible ? 'ready' : 'research-complete') : 'rejected';
    const rejectionReason = researchQualified ? '' : issue ? 'score_below_campaign_threshold' : 'no_credible_evidence';
    const draftRejectionReason = !researchQualified
      ? 'prospect-not-qualified'
      : !draftCapacity.ok ? draftCapacity.reason || 'campaign-daily-draft-cap'
        : !draftReady ? 'draft-quality-gate' : '';
    return {
      minimumProspectScore, researchQualified, contactReadiness, dailyDraftCap, draftCapacity,
      outreach, outreachAiMeta, draftReady, sendEligible, draft, subject, status,
      rejectionReason, draftRejectionReason, optoutUrl, oneClickOptoutUrl
    };
  }

  async controlledCrawl(prospect, campaign) {
    const release = await this.crawlSemaphore.acquire();
    try {
      const domain = normalizeDomain(prospect.website);
      const minGapMs = Math.max(0, Number(this.cfg.crawl?.minDomainGapMs || this.cfg.crawl?.delayMs || 0));
      const rateReservation = typeof this.store.reserveCrawlSlot === 'function'
        ? await this.store.reserveCrawlSlot(domain, minGapMs, this.clock().toISOString())
        : { waitMs: 0, reservedAt: this.clock().toISOString() };
      if (rateReservation.waitMs > 0) await this.sleepFn(rateReservation.waitMs);
      const maxPages = this.campaignPageLimit(campaign);
      const crawl = await this.crawlSiteFn(prospect.website, {
        maxPages,
        delayMs: this.cfg.crawl.delayMs,
        timeoutMs: this.cfg.crawl.timeoutMs,
        screenshotDir: this.cfg.screenshotDir,
        allowLocal: this.cfg.allowLocalFixtures,
        executablePath: this.cfg.chromiumPath,
        htmlFetcher: this.cfg.allowLocalFixtures
          ? async url => {
              const response = await fetch(url, { headers: { 'user-agent': 'UberBondRevenueEngine/1.4 (+public website quality research)' } });
              return { status: response.status, finalUrl: response.url, headers: Object.fromEntries(response.headers.entries()), html: await response.text() };
            }
          : null
      });
      return { crawl, rateReservation, maxPages };
    } finally {
      release();
    }
  }

  async processProspect(prospect, options = {}) {
    const campaign = await this.campaignFor(prospect);
    if (!campaign || !campaign.approved || campaign.enabled === false) {
      throw new CrawlProcessingError('Campaign is not enabled', { category: 'campaign_disabled', retryable: false });
    }
    if (await this.isSuppressed(prospect)) {
      return this.store.patch('prospects', prospect.id, { status: 'suppressed' });
    }

    const auditDate = this.clock().toISOString().slice(0, 10);
    const configuredAuditCap = Number(campaign.dailyAuditCap ?? 100);
    const dailyAuditCap = Number.isFinite(configuredAuditCap) ? Math.max(0, Math.min(100, configuredAuditCap)) : 100;
    const auditCapacity = typeof this.store.reserveAuditCapacity === 'function'
      ? await this.store.reserveAuditCapacity(campaign.id, auditDate, dailyAuditCap, prospect.id)
      : { ok: true, remaining: dailyAuditCap };
    if (!auditCapacity.ok) {
      const nextCrawl = new Date(this.clock());
      nextCrawl.setUTCDate(nextCrawl.getUTCDate() + 1);
      nextCrawl.setUTCHours(0, 5, 0, 0);
      const patch = {
        status: 'queued',
        crawlQueueStatus: 'deferred',
        nextCrawlAt: nextCrawl.toISOString(),
        auditCapacity: { date: auditDate, cap: dailyAuditCap, reserved: false, reason: auditCapacity.reason },
        error: ''
      };
      await this.store.patch('prospects', prospect.id, patch);
      return patch;
    }

    const crawlAttempt = Number(prospect.crawlAttempts || 0) + 1;
    await this.store.patch('prospects', prospect.id, {
      status: 'crawling',
      crawlQueueStatus: 'active',
      crawlAttempts: crawlAttempt,
      auditCapacity: { date: auditDate, cap: dailyAuditCap, reserved: true, duplicate: auditCapacity.duplicate === true, remaining: auditCapacity.remaining },
      startedAt: now(),
      nextCrawlAt: null,
      error: '',
      failure: null
    });
    const { crawl, rateReservation, maxPages } = await this.controlledCrawl(prospect, campaign);
    await persistCrawlArtifacts(this.store, crawl, this.cfg, prospect.id);
    const crawlQuality = assessCrawlQuality(crawl, {
      minimumTextLength: this.cfg.crawl?.minimumTextLength,
      minimumScore: this.cfg.crawl?.minimumQualityScore
    });
    if (!crawlQuality.credible && crawlQuality.retryable) throw noUsableCrawlError(crawl, crawlQuality);
    if (!crawlQuality.credible) {
      const score = scoreProspect(prospect, [], null);
      const dossier = buildDossier({
        prospect, crawl, audit: [], contact: null, score, issue: null, inbox: '', subject: '', draft: '',
        crawlQuality, minimumScore: Number(campaign.minimumProspectScore ?? campaign.minScore ?? 0),
        rejectionReason: crawlQuality.failureCategory
      });
      const patch = {
        status: 'rejected',
        crawlQueueStatus: 'completed',
        crawl,
        crawlQuality,
        crawlControl: { maxPages, rateReservedAt: rateReservation.reservedAt || '' },
        audit: [],
        auditValidation: { accepted: 0, rejected: 0 },
        score,
        issue: null,
        rejectionReason: crawlQuality.failureCategory || 'low_quality_crawl',
        failure: { stage: 'crawl', category: crawlQuality.failureCategory || 'low_quality_crawl', retryable: false },
        dossier,
        completedAt: now()
      };
      await this.store.patch('prospects', prospect.id, patch);
      if (this.hooks.onProspectComplete) await this.hooks.onProspectComplete({ ...prospect, ...patch });
      return patch;
    }

    const deterministic = deterministicAudit(crawl, prospect).map(finding => ({ ...finding, evidenceSource: 'deterministic_rules' }));
    const deterministicValidation = validateAuditEvidence(deterministic, crawl, { minimumConfidence: 0.5 });
    let audit = deterministicValidation.accepted;
    const rejectedEvidence = [...deterministicValidation.rejected];
    let aiMeta = { provider: 'rules' };
    try {
      const ai = await this.enhanceAuditFn(this.cfg.ai, prospect, crawl, audit);
      if (ai?.issues?.length) {
        const mapped = ai.issues
          .filter(item => item.evidenceUrl && item.evidenceExcerpt && Number(item.confidence) >= 0.65 && item.implication && item.service)
          .map((item, index) => ({
            code: `ai-${index}`,
            title: String(item.title || 'AI-supported opportunity'),
            severity: Math.max(1, Math.min(5, Number(item.severity) || 2)),
            confidence: Math.max(0, Math.min(1, Number(item.confidence) || 0.65)),
            category: item.category || 'AI review',
            evidenceUrl: item.evidenceUrl,
            evidenceExcerpt: String(item.evidenceExcerpt).slice(0, 320),
            evidence: { type: 'page_excerpt', url: item.evidenceUrl, excerpt: String(item.evidenceExcerpt).slice(0, 320) },
            implication: String(item.implication || ''),
            service: String(item.service || 'Website strategy'),
            safeForOutreach: false,
            requiresHumanReview: true,
            evidenceSource: 'ai_exact_excerpt_enhancement'
          }));
        const aiValidation = validateAuditEvidence(mapped, crawl, { minimumConfidence: 0.65, requireExcerptMatch: true });
        rejectedEvidence.push(...aiValidation.rejected);
        if (aiValidation.accepted.length) {
          audit = [...audit, ...aiValidation.accepted]
            .filter((item, index, all) => all.findIndex(other => other.title === item.title && other.evidenceUrl === item.evidenceUrl) === index)
            .sort((a, b) => b.severity * b.confidence - a.severity * a.confidence)
            .slice(0, 12);
        }
        aiMeta = {
          provider: this.cfg.ai.provider,
          model: this.cfg.ai.provider === 'anthropic' ? this.cfg.ai.anthropicModel : this.cfg.ai.openaiModel,
          acceptedEvidence: aiValidation.accepted.length,
          rejectedEvidence: aiValidation.rejected.length,
          outreachEligible: false
        };
      }
    } catch (error) {
      await this.store.log('ai_audit_failed', { prospectId: prospect.id, code: 'provider_or_validation_failure' });
    }

    const configuredEvidenceConfidence = Number(campaign.minimumEvidenceConfidence ?? campaign.minEvidenceConfidence ?? 0.72);
    const minimumEvidenceConfidence = Number.isFinite(configuredEvidenceConfidence)
      ? Math.max(0.65, Math.min(1, configuredEvidenceConfidence))
      : 0.72;
    const issue = chooseIssue(audit, minimumEvidenceConfidence);
    const contacts = issue ? await this.discoverContactsFn(prospect, crawl, this.cfg.hunterKey) : { all: [], selected: null };
    let contact = contacts.selected;
    if (contact?.email && this.cfg.hunterKey && contact.verified === 'unverified') {
      try {
        const verification = await this.verifyEmailFn(contact.email, this.cfg.hunterKey);
        contact = {
          ...contact,
          verified: verification.status,
          verificationStatus: verification.status,
          verificationScore: verification.score,
          externallyVerified: contact.externallyVerified === true || verification.externallyVerified === true
        };
      } catch (error) {
        await this.store.log('verification_failed', { prospectId: prospect.id, code: 'provider_or_validation_failure' });
      }
    }

    const score = scoreProspect(prospect, audit, contact);
    const inbox = routeInbox(prospect, audit);
    const outreachResult = await this.prepareProspectOutreach({
      prospect, campaign, issue, contact, score, auditDate, deferDrafts: options.deferDrafts === true
    });
    const {
      minimumProspectScore, researchQualified, contactReadiness, dailyDraftCap, draftCapacity,
      outreach, outreachAiMeta, draftReady, sendEligible, draft, subject, status,
      rejectionReason, draftRejectionReason, optoutUrl, oneClickOptoutUrl
    } = outreachResult;
    const dossier = buildDossier({
      prospect, crawl, audit, contact, score, issue, inbox, subject, draft, aiMeta, crawlQuality,
      minimumScore: minimumProspectScore, rejectionReason
    });
    const patch = {
      status,
      crawlQueueStatus: 'completed',
      crawl,
      crawlQuality,
      crawlControl: { maxPages, rateReservedAt: rateReservation.reservedAt || '' },
      audit,
      auditValidation: { accepted: audit.length, rejected: rejectedEvidence.length, rejectedEvidence },
      contacts,
      contact,
      contactReadiness,
      draftCapacity: { date: auditDate, cap: dailyDraftCap, ...draftCapacity },
      outreach,
      outreachAiMeta,
      draftApproval: draftReady ? { status: 'pending', generatedAt: outreach.generatedAt } : { status: 'blocked', reason: draftRejectionReason },
      score,
      issue,
      inbox,
      draft,
      subject,
      unsubscribeUrl: optoutUrl,
      oneClickUnsubscribeUrl: oneClickOptoutUrl,
      dossier,
      rejectionReason,
      draftRejectionReason,
      completedAt: now()
    };

    await this.store.patch('prospects', prospect.id, patch);
    if (this.hooks.onProspectComplete) await this.hooks.onProspectComplete({ ...prospect, ...patch });
    if (sendEligible && campaign.autoSend) await this.maybeSend({ ...prospect, ...patch }, campaign);
    if (researchQualified) await this.createSocialTask({ ...prospect, ...patch });
    return patch;
  }

  outboundThresholds() {
    return {
      hardBouncePauseThreshold: this.cfg.outbound?.hardBouncePauseThreshold,
      complaintPauseThreshold: this.cfg.outbound?.complaintPauseThreshold,
      failurePauseThreshold: this.cfg.outbound?.failurePauseThreshold
    };
  }

  async markSendSafety(prospect, result) {
    await this.store.patch('prospects', prospect.id, {
      sendSafety: { ...result, checkedAt: now() }
    });
    return result;
  }

  async maybeSend(prospect, campaign, options = {}) {
    const followup = Number(options.followup || 0);
    if (await this.isSuppressed(prospect, prospect.contact?.email)) {
      await this.store.patch('prospects', prospect.id, { status: 'suppressed', nextFollowupAt: null });
      return { sent: false, reason: 'suppressed' };
    }
    const body = options.body || prospect.draft;
    const subject = options.subject || prospect.subject;
    const candidate = { ...prospect, draft: body, subject };
    const authorization = options.authorization || (!followup && prospect.status === 'scheduled' ? 'owner-approved' : 'auto');
    const simulation = this.cfg.outbound?.provider === 'test';
    const eligibility = evaluateSendEligibility({ prospect: candidate, campaign, cfg: this.cfg, date: this.clock(), followup, authorization, simulation });
    if (!eligibility.ok) return this.markSendSafety(prospect, { sent: false, ...eligibility });

    const account = simulation
      ? { id: `test-${prospect.inbox}`, slot: prospect.inbox, connected: true, email: `test-${String(prospect.inbox || 'A').toLowerCase()}@gmail.invalid`, tokens: '' }
      : await this.store.findOne('accounts', { slot: prospect.inbox });
    if (!account?.connected) return this.markSendSafety(prospect, { sent: false, reason: 'needs-gmail' });

    const configuredDaily = Number(this.cfg.caps?.[prospect.inbox] ?? 0);
    const campaignDaily = Number(campaign.dailyCaps?.[prospect.inbox] ?? campaign.dailySendCap ?? configuredDaily);
    const dailyCap = Math.max(0, Math.min(campaignDaily, configuredDaily));
    const configuredHourly = Math.max(0, Number(this.cfg.outbound?.hourlyCaps?.[prospect.inbox] ?? 0));
    const hourlyCap = Math.max(0, Math.min(Number(campaign.hourlySendCap ?? configuredHourly), configuredHourly));
    const idempotencyKey = sendIdempotencyKey(prospect.id, followup);
    const cadenceSeconds = deterministicCadenceSeconds(
      this.cfg.outbound?.minGapSeconds,
      this.cfg.outbound?.maxGapJitterSeconds,
      idempotencyKey
    );
    const reserved = await this.store.reserveOutboundSend({
      idempotencyKey, prospectId: prospect.id, campaignId: campaign.id, inbox: prospect.inbox,
      recipientEmail: prospect.contact.email, kind: followup ? 'followup' : 'initial', followup,
      dailyCap, hourlyCap, minGapSeconds: cadenceSeconds, now: this.clock().toISOString()
    });
    if (!reserved.ok) {
      if (reserved.reason === 'duplicate-sent' && reserved.reservation) {
        const duplicateSimulated = reserved.reservation.simulated === true || reserved.reservation.provider === 'test';
        const duplicateFollowupLimit = campaign.autoSend ? campaignFollowupLimit(campaign) : 0;
        const duplicatePatch = followup ? {
          status: 'sent', followupCount: Math.max(Number(prospect.followupCount || 0), followup),
          nextFollowupAt: followup < duplicateFollowupLimit ? new Date(this.clock().getTime() + campaignFollowupDelayMs(campaign)).toISOString() : null,
          sendSafety: { sent: true, simulated: duplicateSimulated, reason: 'already-sent', reservationId: reserved.reservation.id, checkedAt: now() }
        } : {
          status: 'sent', sentAt: reserved.reservation.sentAt || reserved.reservation.completedAt || prospect.sentAt,
          deliveryMode: duplicateSimulated ? 'test' : 'gmail', simulatedAt: duplicateSimulated ? reserved.reservation.sentAt || reserved.reservation.completedAt : null,
          sendSafety: { sent: true, simulated: duplicateSimulated, reason: 'already-sent', reservationId: reserved.reservation.id, checkedAt: now() }
        };
        await this.store.patch('prospects', prospect.id, duplicatePatch);
        return { sent: true, duplicate: true, reservation: reserved.reservation };
      }
      return this.markSendSafety(prospect, { sent: false, ...reserved });
    }

    const reservation = reserved.reservation;
    const dispatch = await this.store.beginOutboundDispatch(reservation.id, {
      authorization,
      simulation,
      systemProvider: this.cfg.outbound?.provider,
      systemEnabled: this.cfg.outbound?.enabled === true,
      systemDryRun: this.cfg.outbound?.dryRun === true,
      systemLiveSendApproved: this.cfg.outbound?.liveSendApproved === true,
      draftBody: body,
      draftSubject: subject
    });
    if (!dispatch.ok) {
      return this.markSendSafety(prospect, {
        sent: false, reason: dispatch.reason, reservationId: reservation.id, finalDispatchFence: true
      });
    }
    let result;
    try {
      result = await this.sendEmailFn(this.cfg.google, account, this.cfg.encryptionKey, {
        from: `${this.cfg.sender.name} <${account.email}>`, to: prospect.contact.email, subject, body,
        threadId: followup ? prospect.threadId : undefined,
        replyToId: followup ? prospect.rfcMessageId : undefined,
        listUnsubscribe: prospect.oneClickUnsubscribeUrl
      });
    } catch (error) {
      const providerCode = String(error?.code || 'provider-transport-uncertain').replace(/[^a-z0-9_-]/gi, '-').slice(0, 100);
      const health = await this.store.recordOutboundEvent({
        inbox: prospect.inbox, eventType: 'send_uncertain', prospectId: prospect.id,
        recipientEmail: prospect.contact.email, detail: { reservationId: reservation.id, providerCode }
      }, this.outboundThresholds());
      const finalized = await this.store.finalizeOutboundDispatch(reservation.id, 'uncertain', { providerCode }, {
        status: 'send-uncertain', nextFollowupAt: null,
        sendSafety: { sent: false, reason: 'provider-result-uncertain', reservationId: reservation.id, senderPaused: Boolean(health?.paused), checkedAt: now() }
      });
      if (!finalized.ok) await this.store.log('outbound_finalization_deferred', { prospectId: prospect.id, reservationId: reservation.id, providerStatus: 'uncertain', reason: finalized.reason });
      await this.store.log('outbound_send_uncertain', { prospectId: prospect.id, reservationId: reservation.id, providerCode });
      return { sent: false, uncertain: true, reservation: finalized.reservation || reservation, health, stopReason: finalized.stopReason || '' };
    }

    if (result.tokens && !simulation) {
      account.tokens = sealTokens(result.tokens, this.cfg.encryptionKey);
      await this.store.upsert('accounts', account);
    }

    let rfcMessageId = '';
    try {
      const sent = await this.getMessageFn(this.cfg.google, account, this.cfg.encryptionKey, result.data.id);
      rfcMessageId = this.parseMessageFn(sent.data).messageId;
      if (sent.tokens) {
        account.tokens = sealTokens(sent.tokens, this.cfg.encryptionKey);
        await this.store.upsert('accounts', account);
      }
    } catch (error) {
      // Best-effort metadata enrichment only: the message is already sent and
      // recorded above, so this must never fail the send. Log for visibility in
      // case it starts failing consistently (e.g. a token or scope problem).
      console.warn('[pipeline] could not fetch RFC message-id after send:', String(error?.code || 'provider-metadata-unavailable'));
    }

    const sentAt = now();
    await this.store.recordOutboundEvent({
      inbox: prospect.inbox, eventType: 'sent', prospectId: prospect.id,
      recipientEmail: prospect.contact.email, detail: { reservationId: reservation.id, followup }
    }, this.outboundThresholds());

    const message = {
      id: `msg_${reservation.id}`, prospectId: prospect.id, campaignId: campaign.id, inbox: prospect.inbox,
      to: prospect.contact.email, subject, gmailId: result.data.id, threadId: result.data.threadId,
      rfcMessageId, followup, sentAt, reservationId: reservation.id, idempotencyKey,
      provider: simulation ? 'test' : 'gmail', simulated: simulation
    };
    try { await this.store.add('messages', message); }
    catch (error) { if (!(error instanceof ConflictError)) throw error; }

    const followupLimit = campaign.autoSend ? campaignFollowupLimit(campaign) : 0;
    const patch = followup ? {
      followupCount: followup,
      nextFollowupAt: followup < followupLimit ? new Date(this.clock().getTime() + campaignFollowupDelayMs(campaign)).toISOString() : null,
      sendSafety: { sent: true, simulated: simulation, provider: simulation ? 'test' : 'gmail', reservationId: reservation.id, checkedAt: now() }
    } : {
      status: 'sent', sentAt, threadId: message.threadId, rfcMessageId,
      followupCount: 0,
      nextFollowupAt: followupLimit ? new Date(this.clock().getTime() + campaignFollowupDelayMs(campaign)).toISOString() : null,
      deliveryMode: simulation ? 'test' : 'gmail', simulatedAt: simulation ? sentAt : null,
      sendSafety: { sent: true, simulated: simulation, provider: simulation ? 'test' : 'gmail', reservationId: reservation.id, checkedAt: now() }
    };
    const finalized = await this.store.finalizeOutboundDispatch(reservation.id, 'sent', {
      sentAt, gmailId: result.data.id, threadId: result.data.threadId, rfcMessageId,
      provider: simulation ? 'test' : 'gmail', simulated: simulation
    }, patch);
    if (!finalized.ok) await this.store.log('outbound_finalization_deferred', { prospectId: prospect.id, reservationId: reservation.id, providerStatus: 'sent', reason: finalized.reason });
    return { sent: true, message, reservation: finalized.reservation || reservation, stopReason: finalized.stopReason || '' };
  }

  async processOutboundQueue(limit = this.cfg.outbound?.processBatchSize || 10, target = {}) {
    let attempted = 0;
    let sent = 0;
    const candidates = (await this.store.list('prospects'))
      .filter(prospect => (!target.prospectId || prospect.id === target.prospectId) && (
        (prospect.status === 'scheduled' && prospect.draftApproval?.status === 'approved') ||
        ['ready', 'research-complete'].includes(prospect.status)
      ) && !prospect.repliedAt)
      .slice(0, Math.max(1, Number(limit || 10)));
    for (const prospect of candidates) {
      const campaign = await this.campaignFor(prospect);
      const authorization = prospect.status === 'scheduled' ? 'owner-approved' : 'auto';
      if (!campaign?.approved || (authorization === 'auto' && !campaign.autoSend)) continue;
      attempted += 1;
      const result = await this.maybeSend(prospect, campaign, { authorization });
      if (result?.sent) sent += 1;
    }
    return { attempted, sent };
  }

  async createSocialTask(prospect) {
    if (await this.store.findOne('socialTasks', { prospectId: prospect.id })) return;
    const channel = /(clinic|dent|med spa|restaurant|hotel|gym|beauty|luxury)/i.test(prospect.niche || '')
      ? 'Instagram'
      : /(startup|saas|founder|agency|consult|real estate)/i.test(prospect.niche || '') ? 'LinkedIn' : 'X';
    try {
      return await this.store.add('socialTasks', {
        id: id('social'), prospectId: prospect.id, company: prospect.company, channel, status: 'manual',
        reason: 'Use only public context or a warm follow-up',
        draft: `Review ${prospect.company}'s ${channel} presence. Add a useful observation in your own words; do not paste the email or automate the platform action.`,
        createdAt: now()
      });
    } catch (error) {
      if (error instanceof ConflictError) return null;
      throw error;
    }
  }

  async recoverStaleProspects(maxAgeMs = this.cfg.queue?.lockTimeoutMs || 1200000) {
    const cutoff = Date.now() - Math.max(60000, Number(maxAgeMs));
    const stale = (await this.store.list('prospects')).filter(prospect => {
      if (!['claimed', 'crawling'].includes(prospect.status)) return false;
      const stamp = Date.parse(prospect.startedAt || prospect.claimedAt || prospect.updatedAt || prospect.createdAt || 0);
      return Number.isFinite(stamp) && stamp < cutoff;
    });
    for (const prospect of stale) {
      await this.store.patch('prospects', prospect.id, {
        status: 'retry',
        crawlQueueStatus: 'queued',
        error: 'Recovered after an interrupted worker job',
        failure: { stage: 'crawl', category: 'stale_worker_recovery', retryable: true },
        nextCrawlAt: now(),
        recoveredAt: now()
      });
    }
    return stale.length;
  }

  async runBatch(limit = this.cfg.maxBatch, target = {}) {
    if (this.paused) throw new Error('Worker is paused');
    this.activeBatches += 1;
    this.running = true;
    const execution = { type: 'research-batch', status: 'running', startedAt: now(), processed: 0, errors: [] };
    const retryableFailures = [];
    try {
      await this.recoverStaleProspects();
      let targetProspectId = target.prospectId || '';
      if (!targetProspectId && target.leadId) {
        const lead = await this.store.get('leads', target.leadId);
        targetProspectId = lead?.prospectId || '';
      }
      const targetProspectIds = uniq((Array.isArray(target.prospectIds) ? target.prospectIds : [])
        .map(value => String(value || '').trim())
        .filter(Boolean))
        .slice(0, Math.min(100, Math.max(1, Number(limit || this.cfg.maxBatch))));
      let candidates;
      if (targetProspectId) {
        candidates = [await this.store.claimProspect(targetProspectId)].filter(Boolean);
      } else if (targetProspectIds.length) {
        candidates = [];
        for (const prospectId of targetProspectIds) {
          const prospect = await this.store.claimProspect(prospectId);
          if (prospect) candidates.push(prospect);
        }
      } else {
        candidates = await this.store.claimProspects(Math.max(1, Number(limit || this.cfg.maxBatch)));
      }
      for (const prospect of candidates) {
        if (this.paused) break;
        try {
          await this.processProspect(prospect, target);
          execution.processed += 1;
        } catch (error) {
          const classified = error instanceof CrawlProcessingError
            ? { category: error.category, retryable: error.retryable, message: error.message }
            : classifyCrawlFailure(error);
          const current = await this.store.get('prospects', prospect.id);
          const attempts = Math.max(1, Number(current?.crawlAttempts || prospect.crawlAttempts || 1));
          const maxAttempts = Math.max(1, Number(this.cfg.crawl?.maxAttempts || 3));
          const retryable = classified.retryable !== false && attempts < maxAttempts;
          const retryDelayMs = Math.min(
            Number(this.cfg.queue?.retryMaxMs || 3600000),
            Number(this.cfg.queue?.retryBaseMs || 30000) * (2 ** Math.max(0, attempts - 1))
          );
          const nextCrawlAt = retryable ? new Date(Date.now() + retryDelayMs).toISOString() : null;
          execution.errors.push({ prospectId: prospect.id, category: classified.category, retryable, attempts, maxAttempts });
          await this.store.patch('prospects', prospect.id, {
            status: retryable ? 'retry' : 'audit-failed',
            crawlQueueStatus: retryable ? 'queued' : 'failed',
            error: classified.message,
            failure: { stage: 'crawl', category: classified.category, retryable, attempts, maxAttempts },
            nextCrawlAt,
            completedAt: retryable ? null : now()
          });
          if (retryable) retryableFailures.push({ prospectId: prospect.id, category: classified.category });
        }
      }
      execution.status = this.paused ? 'paused' : retryableFailures.length ? 'retry' : 'completed';
      execution.completedAt = now();
      if (retryableFailures.length) {
        const error = new CrawlProcessingError(`Research batch has ${retryableFailures.length} retryable crawl failure${retryableFailures.length === 1 ? '' : 's'}`, {
          category: 'batch_retryable_crawl_failure',
          retryable: true,
          detail: { failures: retryableFailures }
        });
        error.execution = execution;
        throw error;
      }
      return execution;
    } finally {
      this.activeBatches = Math.max(0, this.activeBatches - 1);
      this.running = this.activeBatches > 0;
    }
  }

  async processDraftQueue(limit = 10) {
    const maximum = Math.max(1, Math.min(20, Number(limit || 10)));
    const terminal = new Set(['sent', 'replied', 'paid', 'unsubscribed', 'suppressed', 'bounced', 'complaint']);
    const candidates = (await this.store.list('prospects'))
      .filter(prospect => !terminal.has(prospect.status))
      .filter(prospect => ['research-complete', 'ready'].includes(prospect.status))
      .filter(prospect => prospect.issue && Number.isFinite(Number(prospect.score?.total)))
      .filter(prospect => prospect.draftApproval?.status !== 'approved' && prospect.draftApproval?.status !== 'rejected')
      .filter(prospect => !prospect.outreach?.selected?.quality?.passed)
      .slice(0, maximum);
    let processed = 0;
    let ready = 0;
    let blocked = 0;
    for (const prospect of candidates) {
      const campaign = await this.campaignFor(prospect);
      if (!campaign?.approved || campaign.enabled === false) {
        blocked += 1;
        continue;
      }
      const auditDate = this.clock().toISOString().slice(0, 10);
      const result = await this.prepareProspectOutreach({
        prospect,
        campaign,
        issue: prospect.issue,
        contact: prospect.contact || prospect.contacts?.selected || null,
        score: prospect.score,
        auditDate
      });
      const dossier = buildDossier({
        prospect,
        crawl: prospect.crawl || {},
        audit: prospect.audit || [],
        contact: prospect.contact || prospect.contacts?.selected || null,
        score: prospect.score,
        issue: prospect.issue,
        inbox: prospect.inbox || routeInbox(prospect, prospect.audit || []),
        subject: result.subject,
        draft: result.draft,
        aiMeta: prospect.aiMeta || { provider: 'rules' },
        crawlQuality: prospect.crawlQuality,
        minimumScore: result.minimumProspectScore,
        rejectionReason: result.rejectionReason
      });
      const patch = {
        status: result.status,
        contactReadiness: result.contactReadiness,
        draftCapacity: { date: auditDate, cap: result.dailyDraftCap, ...result.draftCapacity },
        outreach: result.outreach,
        outreachAiMeta: result.outreachAiMeta,
        draftApproval: result.draftReady
          ? { status: 'pending', generatedAt: result.outreach.generatedAt }
          : { status: 'blocked', reason: result.draftRejectionReason },
        draft: result.draft,
        subject: result.subject,
        unsubscribeUrl: result.optoutUrl,
        oneClickUnsubscribeUrl: result.oneClickOptoutUrl,
        dossier,
        rejectionReason: result.rejectionReason,
        draftRejectionReason: result.draftRejectionReason,
        draftGeneratedAt: result.draftReady ? now() : null
      };
      await this.store.patch('prospects', prospect.id, patch);
      if (result.researchQualified) await this.createSocialTask({ ...prospect, ...patch });
      processed += 1;
      if (result.draftReady) ready += 1;
      else blocked += 1;
    }
    return { considered: candidates.length, processed, ready, blocked };
  }

  pause() { this.paused = true; }
  resume() { this.paused = false; }

  async processFollowups(limit = 20) {
    let processed = 0;
    const due = (await this.store.list('prospects')).filter(prospect =>
      prospect.status === 'sent' && prospect.nextFollowupAt &&
      Date.parse(prospect.nextFollowupAt) <= this.clock().getTime() && !prospect.repliedAt
    ).slice(0, Math.max(1, Math.min(20, Number(limit || 20))));
    for (const prospect of due) {
      const campaign = await this.campaignFor(prospect);
      if (!campaign?.approved || !campaign.autoSend) continue;
      if (await this.hasPaymentStop(prospect)) {
        await this.store.patch('prospects', prospect.id, { status: 'paid', nextFollowupAt: null, paymentStopAt: now() });
        continue;
      }
      const followup = Number(prospect.followupCount || 0) + 1;
      if (followup > campaignFollowupLimit(campaign)) {
        await this.store.patch('prospects', prospect.id, { nextFollowupAt: null });
        continue;
      }
      if (await this.isSuppressed(prospect, prospect.contact?.email)) {
        await this.store.patch('prospects', prospect.id, { status: 'suppressed', nextFollowupAt: null });
        continue;
      }
      const body = buildMessage({ prospect, issue: prospect.issue, contact: prospect.contact, sender: this.cfg.sender, campaign, followup, unsubscribeUrl: prospect.unsubscribeUrl });
      const subject = buildSubject(prospect, prospect.issue, followup);
      const result = await this.maybeSend(prospect, campaign, { followup, body, subject });
      if (result?.sent) processed += 1;
    }
    return processed;
  }

  async pollReplies(options = {}) {
    let ingested = 0;
    const accountLimit = Math.max(1, Math.min(10, Number(options.accountLimit || 10)));
    const messageLimit = Math.max(1, Math.min(100, Number(options.messageLimit || 100)));
    const accounts = (await this.store.list('accounts')).filter(account => account.connected).slice(0, accountLimit);
    for (const account of accounts) {
      const after = Math.floor((account.lastReplyPoll || Date.now() - 86400000) / 1000);
      const list = await this.listMessagesFn(this.cfg.google, account, this.cfg.encryptionKey, `in:inbox after:${after}`, messageLimit);
      if (list.tokens) account.tokens = sealTokens(list.tokens, this.cfg.encryptionKey);
      for (const reference of list.data.messages || []) {
        const existingByReference = await this.store.findOne('replies', { gmailId: reference.id });
        if (existingByReference && !['stored', 'processing'].includes(existingByReference.processingStatus)) continue;
        const full = await this.getMessageFn(this.cfg.google, account, this.cfg.encryptionKey, reference.id);
        if (full.tokens) account.tokens = sealTokens(full.tokens, this.cfg.encryptionKey);
        const parsed = this.parseMessageFn(full.data);
        const gmailId = parsed.id || reference.id;
        if (!gmailId) continue;
        let existing = existingByReference || (gmailId !== reference.id ? await this.store.findOne('replies', { gmailId }) : null);
        if (existing && !['stored', 'processing'].includes(existing.processingStatus)) continue;
        const [prospects, messages] = await Promise.all([
          this.store.list('prospects'),
          this.store.list('messages')
        ]);
        const storedProspect = existing?.prospectId ? prospects.find(item => item.id === existing.prospectId) : null;
        const match = existing ? {
          prospect: storedProspect || null,
          source: existing.match?.source || (storedProspect ? 'stored-match' : 'unmatched'),
          confidence: Number(existing.match?.confidence || (storedProspect ? 1 : 0)),
          ambiguous: existing.match?.ambiguous === true
        } : matchReplyToProspect(parsed, { prospects, messages, inbox: account.slot });
        const prospect = match.prospect;
        const classification = existing?.classification || await classifyReplyWithFallback(parsed, this.cfg.ai, this.classifyReplyFn);
        const receivedAt = this.clock().toISOString();
        const responseDraft = existing?.responseDraft || (prospect ? responseDraftFor(classification, parsed) : null);
        let replyStopRecorded = false;
        if (!existing) {
          const record = {
            id: id('reply'),
            prospectId: prospect?.id || null,
            inbox: account.slot,
            gmailId,
            threadId: parsed.threadId,
            messageId: parsed.messageId || '',
            inReplyTo: parsed.inReplyTo || '',
            from: parsed.from,
            subject: parsed.subject,
            body: parsed.body,
            classification,
            match: { source: match.source, confidence: match.confidence, ambiguous: match.ambiguous },
            responseDraft,
            processingStatus: 'processing',
            receivedAt,
            createdAt: receivedAt
          };
          try {
            if (prospect && typeof this.store.recordReplyAndStop === 'function') {
              const stored = await this.store.recordReplyAndStop(record, prospectReplyPatch(classification, receivedAt));
              existing = stored.reply;
              replyStopRecorded = true;
            } else existing = await this.store.add('replies', record);
          } catch (error) {
            if (!(error instanceof ConflictError)) throw error;
            existing = await this.store.findOne('replies', { gmailId });
            if (!existing || !['stored', 'processing'].includes(existing.processingStatus)) continue;
          }
        }
        const replyId = existing.id;
        ingested += 1;
        const notifyOnce = async notification => {
          const duplicate = (await this.store.list('notifications')).some(item => item.type === notification.type && item.replyId === replyId);
          if (!duplicate) await this.store.add('notifications', notification);
        };
        if (!prospect) {
          await notifyOnce({
            id: id('note'), type: 'reply_review', replyId, status: 'unread',
            title: match.ambiguous ? 'Ambiguous inbox reply needs review' : 'Unmatched inbox reply needs review',
            createdAt: receivedAt
          });
          await this.store.patch('replies', replyId, { processingStatus: 'completed', processedAt: receivedAt });
          continue;
        }

        if (!replyStopRecorded) await this.store.patch('prospects', prospect.id, prospectReplyPatch(classification, receivedAt));
        const suppression = suppressionPolicy(classification.label);
        if (suppression.suppressEmail) {
          await this.addSuppression(prospect, classification.label, { includeDomain: suppression.suppressDomain });
        }
        if (classification.label === 'bounce' || classification.label === 'complaint') {
          const eventExists = (await this.store.list('outboundEvents')).some(event => event.detail?.replyId === replyId);
          if (!eventExists) {
            await this.store.recordOutboundEvent({
              inbox: account.slot, eventType: classification.label === 'bounce' ? 'hard_bounce' : 'complaint',
              prospectId: prospect.id, recipientEmail: prospect.contact?.email || '', detail: { replyId }
            }, this.outboundThresholds());
          }
        }
        if (['interested', 'meeting-requested', 'asks-for-information'].includes(classification.label) || classification.humanReviewRequired) {
          await notifyOnce({
            id: id('note'),
            type: classification.humanReviewRequired ? 'reply_review' : 'positive_reply',
            prospectId: prospect.id,
            replyId,
            status: 'unread',
            title: classification.humanReviewRequired
              ? `${String(prospect.company || 'Prospect').slice(0, 120)} reply needs review`
              : `${String(prospect.company || 'Prospect').slice(0, 120)} sent a positive reply`,
            createdAt: receivedAt
          });
        }
        await this.store.patch('replies', replyId, { processingStatus: 'completed', processedAt: receivedAt });
      }
      account.lastReplyPoll = Date.now();
      await this.store.upsert('accounts', account);
    }
    return ingested;
  }
}
