import { id, now } from './utils.mjs';
import { crawlSiteBrowser } from './browser-crawler.mjs';
import { deterministicAudit, scoreProspect, chooseIssue } from './audit-rules.mjs';
import { enhanceAudit, classifyReply } from './ai.mjs';
import { discoverContacts, verifyEmail } from './contacts.mjs';
import { buildMessage, buildSubject, routeInbox } from './copy.mjs';
import { buildDossier } from './dossier.mjs';
import { sendEmail, listMessages, getMessage, parseGmailMessage, sealTokens } from './gmail.mjs';
import { ConflictError } from './store.mjs';
import { persistCrawlArtifacts } from './artifacts.mjs';
import { evaluateSendEligibility, sendIdempotencyKey, classifyDeliverySignal, suppressionLookup } from './send-safety.mjs';
import { evaluateDeliverabilityGuard } from './deliverability-guard.mjs';
import { evaluateConsequenceBoundary, buildOutboundActionIntent } from './consequence-boundary.mjs';
import { unsubscribeUrl, oneClickUnsubscribeUrl } from './unsubscribe.mjs';
import { buildOutboundShadowContext, observeOutboundFinalAdmission } from './omnia-v9/final-admission-shadow.mjs';
import { buildOutboundConsequenceContext, enforceOutboundConsequence } from './omnia-v9/integrations/outbound-consequence-gate.mjs';
import { dispatchPostalCanary } from './postal-live-send.mjs';
import { evaluateOutreachGovernance } from './outreach-governance.mjs';
import { compileUberReplyCampaignDecision } from './uberreply-four-offer-genome.mjs';
import { evaluateDomainMailboxGate, DOMAIN_MAILBOX_GATE_POLICY_VERSION } from './domain-mailbox-gate.mjs';
import { loadSendingDomain } from './sending-domain-registry.mjs';
import { loadSendingMailbox } from './sending-mailbox-registry.mjs';

export class Pipeline {
  constructor(store, cfg, hooks = {}) {
    this.store = store;
    this.cfg = cfg;
    this.hooks = hooks;
    this.running = false;
    this.activeBatches = 0;
    this.paused = false;
    this.sendEmailFn = hooks.sendEmail || sendEmail;
    this.getMessageFn = hooks.getMessage || getMessage;
    this.parseMessageFn = hooks.parseGmailMessage || parseGmailMessage;
    this.clock = hooks.clock || (() => new Date());
    // Optional: the V9 admission context (approvals, policyAuthorizer,
    // evidence resolvers, etc.) an owner injects once real policy content
    // exists. Absent by default -- see logConsequenceBoundaryDecision and
    // the outbound.v9AdmissionRequired config flag below.
    this.v9Context = hooks.v9Context || {};
    // Optional, non-authoritative shadow observer (recovered from the
    // historical OMNIA-V9 closure archive -- see
    // docs/INSTANTLY_RECONCILIATION.md). observeOutboundFinalAdmission()
    // can never block, alter, or duplicate a send: every path through it is
    // wrapped so a missing hook, a hook exception, or a store failure all
    // degrade to a harmless logged observation, never a thrown error or a
    // behavior change. Absent by default (this.outboundFinalAdmissionShadowFn
    // stays null) until an owner wires a real shadow policy hook.
    this.outboundFinalAdmissionShadowFn = hooks.outboundFinalAdmissionShadow || null;
    // Authoritative consequence gate recovered from UberBond's V9 lineage.
    // Unlike the shadow observer above, this gate may block a real provider call.
    this.outboundConsequenceGateFn = hooks.outboundConsequenceGate || null;
    this.postalSendFn = hooks.postalSend || dispatchPostalCanary;
  }

  async refreshOwnerSender() {
    if (typeof this.store.getSettings !== 'function') return this.cfg.sender;
    const settings = await this.store.getSettings();
    const identity = settings?.businessIdentity;
    if (!identity || typeof identity !== 'object' || Array.isArray(identity)) return this.cfg.sender;
    const address = String(identity.postalAddress || '').trim();
    if (!address) return this.cfg.sender;
    this.cfg.sender = {
      ...this.cfg.sender,
      name: String(identity.senderName || this.cfg.sender?.name || '').trim(),
      company: String(identity.company || identity.legalName || this.cfg.sender?.company || '').trim(),
      address
    };
    return this.cfg.sender;
  }

  async isSuppressed(prospect, email = '') {
    const result = await suppressionLookup(this.store, { website: prospect.website, email });
    return result.suppressed;
  }

  async campaignFor(prospect) {
    return this.store.get('campaigns', prospect.campaignId);
  }

  async processProspect(prospect) {
    await this.refreshOwnerSender();
    const campaign = await this.campaignFor(prospect);
    if (!campaign || !campaign.approved) throw new Error('Campaign is not approved');
    if (await this.isSuppressed(prospect)) {
      return this.store.patch('prospects', prospect.id, { status: 'suppressed' });
    }

    await this.store.patch('prospects', prospect.id, { status: 'crawling', startedAt: now(), error: '' });
    const crawl = await crawlSiteBrowser(prospect.website, {
      maxPages: this.cfg.crawl.maxPages,
      delayMs: this.cfg.crawl.delayMs,
      timeoutMs: this.cfg.crawl.timeoutMs,
      screenshotDir: this.cfg.screenshotDir,
      allowLocal: this.cfg.allowLocalFixtures,
      executablePath: this.cfg.chromiumPath,
      htmlOnly: Boolean(this.cfg.crawl.htmlOnly),
      // Render's free web instance can recycle while a browser waits on a
      // third-party document. Fetch the public HTML with an explicit wall-clock
      // bound, then let Playwright parse the same document for DOM and screenshots.
      // This keeps research read-only and makes the network boundary finite.
      htmlFetcher: async url => {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), Math.max(5000, Math.min(10000, Number(this.cfg.crawl.timeoutMs || 10000))));
        try {
          const response = await fetch(url, {
            headers: { 'user-agent': 'UberBondRevenueEngine/1.3' },
            signal: controller.signal
          });
          return {
            status: response.status,
            finalUrl: response.url,
            headers: response.headers,
            html: await response.text()
          };
        } finally {
          clearTimeout(timeout);
        }
      }
    });
    if (!crawl.pages.length) {
      throw new Error(`No usable pages crawled: ${crawl.errors.map(item => item.error || item.status).join(', ')}`);
    }
    await persistCrawlArtifacts(this.store, crawl, this.cfg, prospect.id);

    let audit = deterministicAudit(crawl, prospect);
    let aiMeta = { provider: 'rules' };
    try {
      const ai = await enhanceAudit(this.cfg.ai, prospect, crawl, audit);
      if (ai?.issues?.length) {
        const mapped = ai.issues
          .filter(item => item.evidenceUrl && item.evidenceExcerpt && Number(item.confidence) >= 0.65)
          .map((item, index) => ({
            code: `ai-${index}`,
            title: String(item.title || 'AI-supported opportunity'),
            severity: Math.max(1, Math.min(5, Number(item.severity) || 2)),
            confidence: Math.max(0, Math.min(1, Number(item.confidence) || 0.65)),
            category: item.category || 'AI review',
            evidenceUrl: item.evidenceUrl,
            evidenceExcerpt: String(item.evidenceExcerpt).slice(0, 320),
            screenshots: crawl.pages.find(page => page.url === item.evidenceUrl)?.screenshots || crawl.pages[0]?.screenshots || {},
            implication: String(item.implication || ''),
            service: String(item.service || 'Website strategy'),
            safeForOutreach: Boolean(item.safeForOutreach !== false)
          }));
        if (mapped.length) {
          audit = [...mapped, ...audit]
            .filter((item, index, all) => all.findIndex(other => other.title === item.title && other.evidenceUrl === item.evidenceUrl) === index)
            .slice(0, 12);
        }
        aiMeta = {
          provider: this.cfg.ai.provider,
          model: this.cfg.ai.provider === 'anthropic' ? this.cfg.ai.anthropicModel : this.cfg.ai.openaiModel
        };
      }
    } catch (error) {
      await this.store.log('ai_audit_failed', { prospectId: prospect.id, error: error.message });
    }

    const ownerRecordedContact = prospect.sourceMetadata?.authorization?.status === 'owner-evidence-recorded'
      && prospect.contact?.email
      ? { ...prospect.contact }
      : null;
    const providerEnrichmentEnabled = Boolean(
      this.cfg.leadGeneration?.providerCallsEnabled && this.cfg.leadGeneration?.hunterEnabled
    );
    const hunterKey = ownerRecordedContact || !providerEnrichmentEnabled ? '' : this.cfg.hunterKey;
    const discoveredContacts = await discoverContacts(prospect, crawl, hunterKey);
    const contacts = ownerRecordedContact
      ? {
          ...discoveredContacts,
          candidates: [ownerRecordedContact, ...(discoveredContacts.candidates || []).filter(item => item.email !== ownerRecordedContact.email)],
          selected: ownerRecordedContact,
          selectionReason: 'owner-recorded-exact-recipient'
        }
      : discoveredContacts;
    let contact = contacts.selected;
    if (contact?.email && !ownerRecordedContact && providerEnrichmentEnabled && this.cfg.hunterKey && contact.verified === 'unverified') {
      try {
        const verification = await verifyEmail(contact.email, this.cfg.hunterKey);
        contact = { ...contact, verified: verification.status, verificationScore: verification.score };
      } catch (error) {
        await this.store.log('verification_failed', { prospectId: prospect.id, error: error.message });
      }
    }

    const score = scoreProspect(prospect, audit, contact);
    const issue = chooseIssue(audit);
    const inbox = routeInbox(prospect, audit);
    const offerDecision = campaign.offerId
      ? compileUberReplyCampaignDecision({
          offerId: campaign.offerId,
          prospect: {
            ...prospect,
            industry: prospect.industry || prospect.niche,
            tags: [...(Array.isArray(prospect.tags) ? prospect.tags : []), prospect.niche, issue?.service],
            sourceCount: audit.length,
            sourceFreshness: 1,
            problemEvidenceScore: Math.min(1, score.total / 100),
            fitEvidenceConfidence: issue?.confidence || Math.min(1, score.total / 100)
          },
          research: {
            accountValueScore: Math.min(1, score.total / 100),
            signalStrength: issue?.confidence || 0,
            artifactFeasibility: issue ? 1 : 0,
            evidenceDensity: Math.min(1, audit.length / 3),
            estimatedResearchMinutes: Math.max(1, crawl.pages.length * 2 + audit.length)
          },
          sequencePosition: 1
        })
      : null;
    const researchQualified = Boolean(issue && score.total >= campaign.minScore && (!campaign.offerId || offerDecision?.ok));
    const suppressed = contact?.email ? await this.isSuppressed(prospect, contact.email) : false;
    const sendEligible = Boolean(
      researchQualified && contact?.email &&
      ['valid', 'accept_all', 'unverified', 'unknown'].includes(contact.verified || 'unverified') &&
      !suppressed
    );
    const optoutUrl = contact?.email ? unsubscribeUrl(this.cfg.baseUrl, prospect.id, this.cfg.unsubscribeSecret) : '';
    const oneClickOptoutUrl = contact?.email ? oneClickUnsubscribeUrl(this.cfg.baseUrl, prospect.id, this.cfg.unsubscribeSecret) : '';
    const draft = researchQualified ? buildMessage({ prospect, issue, contact, sender: this.cfg.sender, offerName: offerDecision?.offer?.publicName, unsubscribeUrl: optoutUrl }) : '';
    const subject = researchQualified ? buildSubject(prospect, issue, 0, offerDecision?.offer?.publicName) : '';
    const status = researchQualified ? (sendEligible ? 'ready' : 'research-complete') : 'rejected';
    const dossier = buildDossier({ prospect, crawl, audit, contact, score, issue, inbox, subject, draft, aiMeta });
    const patch = { status, crawl, audit, contacts, contact, score, issue, inbox, offerDecision, draft, subject, unsubscribeUrl: optoutUrl, oneClickUnsubscribeUrl: oneClickOptoutUrl, dossier, completedAt: now() };

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

  async logGuardDecision(phase, guardResult, { prospect, campaign, followup, reservationId } = {}) {
    return this.store.log('deliverability_guard_decision', {
      phase,
      decision: guardResult.decision,
      prospectId: prospect?.id || null,
      campaignId: campaign?.id || null,
      followup: Number(followup || 0),
      idempotencyKey: guardResult.idempotencyKey,
      actionIdentity: guardResult.actionIdentity,
      workspaceId: guardResult.workspaceId,
      reservationId: reservationId || null,
      receipt: guardResult
    });
  }

  async logConsequenceBoundaryDecision(boundaryResult, { prospect, campaign, reservationId } = {}) {
    return this.store.log('omnia_v9_consequence_boundary_decision', {
      finalDecision: boundaryResult.finalDecision,
      guardDecision: boundaryResult.guardDecision,
      v9Consulted: boundaryResult.v9Consulted,
      reasons: boundaryResult.v9Decision?.reasons || [],
      prospectId: prospect?.id || null,
      campaignId: campaign?.id || null,
      reservationId: reservationId || null,
      policyVersion: boundaryResult.policyVersion
    });
  }

  async countOutboundSendsToday(inbox, date = this.clock()) {
    if (!this.store || typeof this.store.list !== 'function') return null;
    const at = date instanceof Date && !Number.isNaN(date.getTime()) ? date : new Date(date);
    if (Number.isNaN(at.getTime())) return null;
    let events;
    try {
      events = await this.store.list('outboundEvents');
    } catch {
      return null;
    }
    if (!Array.isArray(events)) return null;
    const day = at.toISOString().slice(0, 10);
    return events.filter(event => event?.inbox === inbox
      && event?.eventType === 'sent'
      && String(event.occurredAt || event.createdAt || '').slice(0, 10) === day).length;
  }

  async evaluateDomainMailboxSendGate({ account, inbox, date = this.clock() } = {}) {
    if (this.cfg.outbound?.domainMailboxGateRequired !== true) return null;

    const at = date instanceof Date && !Number.isNaN(date.getTime()) ? date : new Date(date);
    const timestamp = Number.isNaN(at.getTime()) ? new Date().toISOString() : at.toISOString();
    const domainId = String(account?.sendingDomainId || account?.domainId || '').trim();
    const mailboxId = String(account?.sendingMailboxId || account?.mailboxId || '').trim();
    const workspaceId = String(account?.sendingWorkspaceId || account?.workspaceId || this.cfg.outbound?.workspaceId || this.cfg.workspaceId || '').trim();
    if (!domainId || !mailboxId || !workspaceId) {
      return {
        decision: 'DENY',
        policyVersion: DOMAIN_MAILBOX_GATE_POLICY_VERSION,
        reasonCodes: [
          ...(!domainId || !mailboxId ? ['domain-mailbox-registry-linkage-required'] : []),
          ...(!workspaceId ? ['sending-workspace-linkage-required'] : [])
        ],
        timestamp
      };
    }

    const registryConfig = this.cfg.domainMailbox || {};
    const minWarmupDays = Number.isFinite(Number(registryConfig.minWarmupDays))
      ? Number(registryConfig.minWarmupDays) : 14;
    const maxDnsEvidenceAgeHours = Number.isFinite(Number(registryConfig.maxDnsEvidenceAgeHours))
      ? Number(registryConfig.maxDnsEvidenceAgeHours) : 24;
    const [domainState, mailboxState, sentToday] = await Promise.all([
      loadSendingDomain(this.store, domainId, {
        date: at,
        minWarmupDays,
        maxDnsEvidenceAgeHours
      }),
      loadSendingMailbox(this.store, mailboxId, { date: at }),
      this.countOutboundSendsToday(inbox, at)
    ]);
    if (sentToday == null) {
      return {
        decision: 'DENY',
        policyVersion: DOMAIN_MAILBOX_GATE_POLICY_VERSION,
        reasonCodes: ['outbound-volume-observation-required'],
        timestamp,
        domainState,
        mailboxState
      };
    }

    const gate = evaluateDomainMailboxGate({
      domainState,
      mailboxState,
      workspaceId,
      minWarmupDays,
      volumeCeiling: { dailyCap: mailboxState?.currentDailyCap, sentToday },
      date: at
    });
    return { ...gate, domainState, mailboxState, sentToday, domainId, mailboxId, workspaceId };
  }

  async logDomainMailboxGateDecision(gate, { prospect, campaign } = {}) {
    return this.store.log('domain_mailbox_gate_decision', {
      decision: gate.decision,
      policyVersion: gate.policyVersion,
      reasonCodes: gate.reasonCodes || [],
      prospectId: prospect?.id || null,
      campaignId: campaign?.id || null,
      inbox: prospect?.inbox || null,
      sendingDomainId: gate.domainId || null,
      sendingMailboxId: gate.mailboxId || null,
      workspaceId: gate.workspaceId || null,
      sentToday: gate.sentToday ?? null,
      domainState: gate.domainState ? {
        state: gate.domainState.state,
        dnsStatus: gate.domainState.dnsState?.status || null,
        evidenceFreshness: gate.domainState.evidenceFreshness || null,
        outreachState: gate.domainState.outreachState || null
      } : null,
      mailboxState: gate.mailboxState ? {
        authenticationStatus: gate.mailboxState.authenticationStatus || null,
        warmupStatus: gate.mailboxState.warmupStatus || null,
        warmupAgeDays: gate.mailboxState.warmupAgeDays ?? null,
        currentDailyCap: gate.mailboxState.currentDailyCap ?? null,
        paused: Boolean(gate.mailboxState.paused)
      } : null,
      checkedAt: gate.timestamp
    });
  }

  async maybeSend(prospect, campaign, options = {}) {
    await this.refreshOwnerSender();
    const followup = Number(options.followup || 0);
    const body = options.body || prospect?.draft;
    const subject = options.subject || prospect?.subject;
    const candidate = { ...(prospect || {}), draft: body, subject };

    // Admission gate: every proposed outbound action is evaluated and the
    // decision receipt is persisted before any reservation is attempted.
    const admission = await evaluateDeliverabilityGuard({
      store: this.store, prospect: candidate, campaign, cfg: this.cfg, date: this.clock(), followup, body, subject
    });
    await this.logGuardDecision('admission', admission, { prospect, campaign, followup });
    if (admission.decision !== 'ALLOW_LOCAL_PREPARATION') {
      // A denial whose ONLY reason is a replay against an existing reservation is not a
      // new failure: it is this exact action being re-asked for. Preserve the pre-existing
      // idempotent contract (already-sent replays report success; in-flight/uncertain
      // replays report their status) rather than surfacing a fresh denial that could mask
      // that the action already completed. Any other reason present still hard-denies.
      const existing = admission.deduplicationResult?.existingReservation;
      const isPureReplay = existing && admission.denyReasonCodes.length === 1 && admission.denyReasonCodes[0].startsWith('replay-idempotency-key');
      if (isPureReplay && prospect?.id) {
        if (existing.status === 'sent') {
          const duplicatePatch = followup ? {
            status: 'sent', followupCount: Math.max(Number(prospect.followupCount || 0), followup),
            nextFollowupAt: followup < campaign.maxFollowups ? new Date(Date.now() + 5 * 86400000).toISOString() : null,
            sendSafety: { sent: true, reason: 'already-sent', reservationId: existing.id, checkedAt: now() }
          } : {
            status: 'sent', sentAt: existing.sentAt || existing.completedAt || prospect.sentAt,
            sendSafety: { sent: true, reason: 'already-sent', reservationId: existing.id, checkedAt: now() }
          };
          await this.store.patch('prospects', prospect.id, duplicatePatch);
          return { sent: true, duplicate: true, reservation: existing };
        }
        return this.markSendSafety(prospect, { sent: false, reason: `duplicate-${existing.status}`, reservation: existing });
      }
      if (prospect?.id) {
        await this.markSendSafety(prospect, {
          sent: false, reason: admission.decision === 'DENY' ? 'deliverability-guard-denied' : 'deliverability-guard-review-required',
          decision: admission.decision, reasonCodes: admission.reasonCodes
        });
      }
      return { sent: false, decision: admission.decision, guard: admission };
    }

    // The guard's ALLOW_LOCAL_PREPARATION only means "safe to draft"; every
    // pre-existing send gate below still runs, unweakened, so removing the
    // guard could never silently widen what is allowed to send.
    if (await this.isSuppressed(prospect, prospect.contact?.email)) {
      await this.store.patch('prospects', prospect.id, { status: 'suppressed', nextFollowupAt: null });
      return { sent: false, reason: 'suppressed' };
    }
    const eligibility = evaluateSendEligibility({ prospect: candidate, campaign, cfg: this.cfg, date: this.clock(), followup });
    if (!eligibility.ok) return this.markSendSafety(prospect, { sent: false, ...eligibility });

    const account = await this.store.findOne('accounts', { slot: prospect.inbox });
    if (!account?.connected) return this.markSendSafety(prospect, { sent: false, reason: 'needs-gmail' });

    const domainMailboxGate = await this.evaluateDomainMailboxSendGate({ account, inbox: prospect.inbox, date: this.clock() });
    if (domainMailboxGate) {
      await this.logDomainMailboxGateDecision(domainMailboxGate, { prospect, campaign });
      if (domainMailboxGate.decision !== 'NOT_BLOCKED_BY_DOMAIN_MAILBOX_GATE') {
        return this.markSendSafety(prospect, {
          sent: false,
          reason: 'domain-mailbox-gate-denied',
          decision: domainMailboxGate.decision,
          reasonCodes: domainMailboxGate.reasonCodes
        });
      }
    }

    // The bounded canary is the only live launch phase currently supported by
    // the route-authorization layer. It is intentionally an additional gate:
    // the legacy eligibility, suppression, cap, cooldown and final-recheck
    // controls above and below remain authoritative. In every other phase the
    // existing behavior is preserved, including local dry-run preparation.
    if (this.cfg.outbound?.launchPhase === 'canary') {
      const governance = evaluateOutreachGovernance({
        prospect: candidate,
        campaign,
        cfg: this.cfg,
        subject,
        body,
        followup,
        date: this.clock()
      });
      await this.store.log('outreach_governance_decision', {
        decision: governance.ok ? 'ALLOW' : 'DENY',
        reason: governance.reason || 'bounded-outreach-canary-authorized',
        prospectId: prospect?.id || null,
        campaignId: campaign?.id || null,
        followup,
        routeDigest: governance.routeDigest || null,
        approvalId: governance.approvalId || null,
        approvalDigest: governance.approvalDigest || null,
        messageDigest: governance.messageDigest || null,
        effectPayloadDigest: governance.effectPayloadDigest || null,
        checkedAt: this.clock().toISOString()
      });
      if (!governance.ok) {
        return this.markSendSafety(prospect, {
          sent: false,
          reason: 'outreach-governance-denied',
          reasonCodes: [governance.reason || 'outreach-governance-denied']
        });
      }
    }

    const configuredDaily = Number(this.cfg.caps?.[prospect.inbox] ?? 0);
    const campaignDaily = Number(campaign.dailyCaps?.[prospect.inbox] ?? configuredDaily);
    const dailyCap = Math.max(0, Math.min(campaignDaily, configuredDaily));
    const hourlyCap = Math.max(0, Number(this.cfg.outbound?.hourlyCaps?.[prospect.inbox] ?? 0));
    const idempotencyKey = sendIdempotencyKey(prospect.id, followup);
    const reserved = await this.store.reserveOutboundSend({
      idempotencyKey, prospectId: prospect.id, campaignId: campaign.id, inbox: prospect.inbox,
      recipientEmail: prospect.contact.email, kind: followup ? 'followup' : 'initial', followup,
      dailyCap, hourlyCap, minGapSeconds: this.cfg.outbound?.minGapSeconds, now: this.clock().toISOString()
    });
    if (!reserved.ok) {
      if (reserved.reason === 'duplicate-sent' && reserved.reservation) {
        const duplicatePatch = followup ? {
          status: 'sent', followupCount: Math.max(Number(prospect.followupCount || 0), followup),
          nextFollowupAt: followup < campaign.maxFollowups ? new Date(Date.now() + 5 * 86400000).toISOString() : null,
          sendSafety: { sent: true, reason: 'already-sent', reservationId: reserved.reservation.id, checkedAt: now() }
        } : {
          status: 'sent', sentAt: reserved.reservation.sentAt || reserved.reservation.completedAt || prospect.sentAt,
          sendSafety: { sent: true, reason: 'already-sent', reservationId: reserved.reservation.id, checkedAt: now() }
        };
        await this.store.patch('prospects', prospect.id, duplicatePatch);
        return { sent: true, duplicate: true, reservation: reserved.reservation };
      }
      return this.markSendSafety(prospect, { sent: false, ...reserved });
    }

    const reservation = reserved.reservation;
    await this.store.markOutboundReservation(reservation.id, 'dispatching');

    // Non-authoritative shadow observation only -- see the constructor
    // comment. Never affects `result` below; exists purely to compare a
    // shadow policy's decision against what the legacy path actually did,
    // without ever being able to change it.
    await observeOutboundFinalAdmission({
      hook: this.outboundFinalAdmissionShadowFn,
      store: this.store,
      context: buildOutboundShadowContext({
        reservation, prospect, campaign, account, subject, body, followup, idempotencyKey,
        observedAt: this.clock().toISOString()
      })
    });

    // Final recheck immediately before the provider boundary: state (suppression,
    // evidence, authority, sender health, policy) may have changed since
    // admission. excludeReservationId keeps the guard from flagging the
    // reservation this very call just made as a replay or ceiling breach.
    const finalRecheck = await evaluateDeliverabilityGuard({
      store: this.store, prospect: candidate, campaign, cfg: this.cfg, date: this.clock(), followup, body, subject,
      excludeReservationId: reservation.id
    });
    await this.logGuardDecision('final-recheck', finalRecheck, { prospect, campaign, followup, reservationId: reservation.id });
    if (finalRecheck.decision !== 'ALLOW_LOCAL_PREPARATION') {
      await this.store.markOutboundReservation(reservation.id, 'cancelled', {
        cancelReason: finalRecheck.decision, cancelReasonCodes: finalRecheck.reasonCodes
      });
      await this.markSendSafety(prospect, {
        sent: false, reason: 'deliverability-guard-denied-on-final-recheck',
        decision: finalRecheck.decision, reasonCodes: finalRecheck.reasonCodes, reservationId: reservation.id
      });
      return { sent: false, decision: finalRecheck.decision, guard: finalRecheck, reservation };
    }

    // V9 consequence boundary: composed with, not a replacement for, the
    // Guard checks above (see docs/PROMETHEUS_CANONICAL_INTEGRATION_PLAN.md).
    // Guard already ran twice and allowed; V9 -- when the owner has turned
    // it on -- has the final word before any provider is ever called. Off
    // by default (outbound.v9AdmissionRequired), so existing behavior for
    // every caller that hasn't opted in is completely unchanged.
    if (this.cfg.outbound?.v9AdmissionRequired) {
      const boundary = evaluateConsequenceBoundary({
        guardDecision: finalRecheck.decision,
        buildIntent: () => buildOutboundActionIntent({
          prospect, campaign, inbox: prospect.inbox, cfg: this.cfg, date: this.clock(),
          nonce: reservation.id, idempotencyKey
        }),
        v9Context: this.v9Context,
        date: this.clock()
      });
      await this.logConsequenceBoundaryDecision(boundary, { prospect, campaign, reservationId: reservation.id });
      if (!boundary.ok) {
        await this.store.markOutboundReservation(reservation.id, 'cancelled', {
          cancelReason: `v9-${boundary.finalDecision}`, cancelReasonCodes: boundary.v9Decision?.reasons || ['v9-not-consulted']
        });
        await this.markSendSafety(prospect, {
          sent: false, reason: 'v9-consequence-boundary-denied',
          decision: boundary.finalDecision, reasonCodes: boundary.v9Decision?.reasons || [], reservationId: reservation.id
        });
        return { sent: false, decision: boundary.finalDecision, v9: boundary, reservation };
      }
    }

    const outboundProvider = String(this.cfg.outbound?.provider || 'gmail-api').toLowerCase();
    const effectPayload = {
      from: outboundProvider === 'postal' ? account.email : `${this.cfg.sender.name} <${account.email}>`,
      to: prospect.contact.email,
      subject,
      body,
      threadId: followup ? prospect.threadId : undefined,
      replyToId: followup ? prospect.rfcMessageId : undefined,
      listUnsubscribe: prospect.oneClickUnsubscribeUrl
    };

    // The provider-neutral/effect-adapter path is stricter than legacy Gmail:
    // it requires a fresh authoritative consequence decision bound to the exact
    // reservation and exact payload after all other final checks.
    if (this.cfg.outbound?.useEffectAdapter === true) {
      const consequenceContext = buildOutboundConsequenceContext({
        reservation, prospect, campaign, account, effectPayload, followup, idempotencyKey,
        checkedAt: this.clock().toISOString()
      });
      const consequenceAdmission = await enforceOutboundConsequence({
        hook: this.outboundConsequenceGateFn,
        context: consequenceContext
      });
      await this.store.log('omnia_v9_outbound_consequence_admission', {
        prospectId: prospect.id,
        campaignId: campaign.id,
        reservationId: reservation.id,
        provider: outboundProvider,
        ...consequenceAdmission
      });
      if (!consequenceAdmission.allowed) {
        await this.store.markOutboundReservation(reservation.id, 'cancelled', {
          cancelReason: consequenceAdmission.reason,
          consequenceAdmission
        });
        return this.markSendSafety(prospect, {
          sent: false,
          reason: 'v9-authoritative-consequence-admission-required',
          detail: consequenceAdmission.reason,
          reservationId: reservation.id
        });
      }
    }

    let result;
    let providerMeta = null;
    try {
      if (this.cfg.outbound?.useEffectAdapter === true && outboundProvider === 'postal') {
        providerMeta = await this.postalSendFn({
          cfg: this.cfg, account, reservation, effectPayload, followup, now: this.clock
        });
        if (providerMeta?.classification === 'REJECTED') {
          await this.store.markOutboundReservation(reservation.id, 'cancelled', {
            cancelReason: 'postal-provider-rejected',
            providerReasonCodes: providerMeta.reasonCodes || [],
            providerEvidence: providerMeta.evidence || null
          });
          await this.store.recordOutboundEvent({
            inbox: prospect.inbox, eventType: 'send_failure', prospectId: prospect.id,
            recipientEmail: prospect.contact.email,
            detail: { reservationId: reservation.id, provider: 'postal', reasonCodes: providerMeta.reasonCodes || [] }
          }, this.outboundThresholds());
          return this.markSendSafety(prospect, {
            sent: false, reason: 'provider-rejected', reservationId: reservation.id,
            reasonCodes: providerMeta.reasonCodes || []
          });
        }
        if (providerMeta?.classification !== 'ACCEPTED' || !providerMeta?.providerReferenceId) {
          const uncertain = new Error(providerMeta?.dispatchError || 'postal-provider-result-uncertain');
          uncertain.providerMeta = providerMeta;
          throw uncertain;
        }
        result = { data: { id: providerMeta.providerReferenceId, threadId: '' } };
      } else {
        result = await this.sendEmailFn(this.cfg.google, account, this.cfg.encryptionKey, effectPayload);
      }
    } catch (error) {
      await this.store.markOutboundReservation(reservation.id, 'uncertain', {
        error: String(error.message || error).slice(0, 1000),
        provider: outboundProvider,
        providerEvidence: error?.providerMeta?.evidence || null
      });
      const health = await this.store.recordOutboundEvent({
        inbox: prospect.inbox, eventType: 'send_uncertain', prospectId: prospect.id,
        recipientEmail: prospect.contact.email, detail: { reservationId: reservation.id, provider: outboundProvider, error: error.message }
      }, this.outboundThresholds());
      await this.store.patch('prospects', prospect.id, {
        status: 'send-uncertain', nextFollowupAt: null,
        sendSafety: { sent: false, reason: 'provider-result-uncertain', reservationId: reservation.id, senderPaused: Boolean(health?.paused), checkedAt: now() }
      });
      await this.store.log('outbound_send_uncertain', { prospectId: prospect.id, reservationId: reservation.id, provider: outboundProvider, error: error.message });
      return { sent: false, uncertain: true, reservation, health };
    }

    if (result.tokens) {
      account.tokens = sealTokens(result.tokens, this.cfg.encryptionKey);
      await this.store.upsert('accounts', account);
    }

    let rfcMessageId = providerMeta?.messageId || '';
    if (outboundProvider !== 'postal') {
      try {
        const sent = await this.getMessageFn(this.cfg.google, account, this.cfg.encryptionKey, result.data.id);
        rfcMessageId = this.parseMessageFn(sent.data).messageId;
        if (sent.tokens) {
          account.tokens = sealTokens(sent.tokens, this.cfg.encryptionKey);
          await this.store.upsert('accounts', account);
        }
      } catch (error) {
        // Best-effort metadata enrichment only: the message is already sent and
        // recorded above, so this must never fail the send.
        console.warn('[pipeline] could not fetch RFC message-id after send:', error?.message || error);
      }
    }

    const sentAt = now();
    await this.store.markOutboundReservation(reservation.id, 'sent', {
      sentAt,
      provider: outboundProvider,
      providerReferenceId: providerMeta?.providerReferenceId || result.data.id,
      gmailId: outboundProvider === 'postal' ? null : result.data.id,
      threadId: result.data.threadId || '',
      rfcMessageId
    });
    await this.store.recordOutboundEvent({
      inbox: prospect.inbox, eventType: 'sent', prospectId: prospect.id,
      recipientEmail: prospect.contact.email, detail: { reservationId: reservation.id, followup }
    }, this.outboundThresholds());

    const message = {
      id: `msg_${reservation.id}`, prospectId: prospect.id, campaignId: campaign.id, inbox: prospect.inbox,
      to: prospect.contact.email, subject,
      provider: outboundProvider,
      providerReferenceId: providerMeta?.providerReferenceId || result.data.id,
      gmailId: outboundProvider === 'postal' ? null : result.data.id,
      threadId: result.data.threadId || '',
      rfcMessageId, followup, sentAt, reservationId: reservation.id, idempotencyKey
    };
    try { await this.store.add('messages', message); }
    catch (error) { if (!(error instanceof ConflictError)) throw error; }

    const patch = followup ? {
      followupCount: followup,
      nextFollowupAt: followup < campaign.maxFollowups ? new Date(Date.now() + 5 * 86400000).toISOString() : null,
      sendSafety: { sent: true, reservationId: reservation.id, checkedAt: now() }
    } : {
      status: 'sent', sentAt, threadId: message.threadId, rfcMessageId,
      followupCount: 0,
      nextFollowupAt: campaign.maxFollowups ? new Date(Date.now() + 4 * 86400000).toISOString() : null,
      sendSafety: { sent: true, reservationId: reservation.id, checkedAt: now() }
    };
    await this.store.patch('prospects', prospect.id, patch);
    return { sent: true, message, reservation };
  }

  async processOutboundQueue(limit = this.cfg.outbound?.processBatchSize || 10, options = {}) {
    let attempted = 0;
    let sent = 0;
    const targetProspectId = String(options?.prospectId || '').trim();
    const candidates = (await this.store.list('prospects'))
      .filter(prospect => ['ready', 'research-complete'].includes(prospect.status)
        && !prospect.repliedAt
        && (!targetProspectId || prospect.id === targetProspectId))
      .slice(0, Math.max(1, Number(limit || 10)));
    for (const prospect of candidates) {
      const campaign = await this.campaignFor(prospect);
      if (!campaign?.approved || !campaign.autoSend) continue;
      attempted += 1;
      const result = await this.maybeSend(prospect, campaign);
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
      await this.store.patch('prospects', prospect.id, { status: 'retry', error: 'Recovered after an interrupted worker job', recoveredAt: now() });
    }
    return stale.length;
  }

  async runBatch(limit = this.cfg.maxBatch, target = {}) {
    if (this.paused) throw new Error('Worker is paused');
    this.activeBatches += 1;
    this.running = true;
    const execution = { type: 'research-batch', status: 'running', startedAt: now(), processed: 0, errors: [] };
    try {
      await this.recoverStaleProspects();
      let targetProspectId = target.prospectId || '';
      if (!targetProspectId && target.leadId) {
        const lead = await this.store.get('leads', target.leadId);
        targetProspectId = lead?.prospectId || '';
      }
      const candidates = targetProspectId
        ? [await this.store.claimProspect(targetProspectId)].filter(Boolean)
        : await this.store.claimProspects(Math.max(1, Number(limit || this.cfg.maxBatch)));
      for (const prospect of candidates) {
        if (this.paused) break;
        try {
          await this.processProspect(prospect);
          execution.processed += 1;
        } catch (error) {
          execution.errors.push({ prospectId: prospect.id, error: error.message });
          await this.store.patch('prospects', prospect.id, { status: 'error', error: error.message, completedAt: now() });
        }
      }
      execution.status = this.paused ? 'paused' : 'completed';
      execution.completedAt = now();
      return execution;
    } finally {
      this.activeBatches = Math.max(0, this.activeBatches - 1);
      this.running = this.activeBatches > 0;
    }
  }

  pause() { this.paused = true; }
  resume() { this.paused = false; }

  async processFollowups() {
    await this.refreshOwnerSender();
    let processed = 0;
    const due = (await this.store.list('prospects')).filter(prospect =>
      prospect.status === 'sent' && prospect.nextFollowupAt &&
      Date.parse(prospect.nextFollowupAt) <= Date.now() && !prospect.repliedAt
    );
    for (const prospect of due) {
      const campaign = await this.campaignFor(prospect);
      if (!campaign?.approved || !campaign.autoSend) continue;
      const followup = Number(prospect.followupCount || 0) + 1;
      if (followup > campaign.maxFollowups) {
        await this.store.patch('prospects', prospect.id, { nextFollowupAt: null });
        continue;
      }
      if (await this.isSuppressed(prospect, prospect.contact?.email)) {
        await this.store.patch('prospects', prospect.id, { status: 'suppressed', nextFollowupAt: null });
        continue;
      }
      const body = buildMessage({ prospect, issue: prospect.issue, contact: prospect.contact, sender: this.cfg.sender, offerName: prospect.offerDecision?.offer?.publicName, followup, unsubscribeUrl: prospect.unsubscribeUrl });
      const subject = buildSubject(prospect, prospect.issue, followup, prospect.offerDecision?.offer?.publicName);
      const result = await this.maybeSend(prospect, campaign, { followup, body, subject });
      if (result?.sent) processed += 1;
    }
    return processed;
  }

  async pollReplies() {
    let matched = 0;
    const accounts = (await this.store.list('accounts')).filter(account => account.connected);
    for (const account of accounts) {
      const after = Math.floor((account.lastReplyPoll || Date.now() - 86400000) / 1000);
      const list = await listMessages(this.cfg.google, account, this.cfg.encryptionKey, `in:inbox after:${after}`, 100);
      if (list.tokens) account.tokens = sealTokens(list.tokens, this.cfg.encryptionKey);
      for (const reference of list.data.messages || []) {
        if (await this.store.findOne('replies', { gmailId: reference.id })) continue;
        const full = await getMessage(this.cfg.google, account, this.cfg.encryptionKey, reference.id);
        const parsed = parseGmailMessage(full.data);
        const prospects = await this.store.list('prospects');
        const prospect = prospects.find(item =>
          item.threadId === parsed.threadId ||
          (item.contact?.email && parsed.from.toLowerCase().includes(item.contact.email.toLowerCase()))
        );
        if (!prospect) continue;
        const classification = classifyDeliverySignal(parsed) || await classifyReply(this.cfg.ai, parsed.body);
        try {
          await this.store.add('replies', {
            id: id('reply'), prospectId: prospect.id, gmailId: parsed.id, threadId: parsed.threadId,
            from: parsed.from, subject: parsed.subject, body: parsed.body, classification, receivedAt: now()
          });
        } catch (error) {
          if (error instanceof ConflictError) continue;
          throw error;
        }
        const terminalDelivery = ['bounce','complaint'].includes(classification.label);
        const automatic = classification.label === 'automatic';
        await this.store.patch('prospects', prospect.id, automatic ? {
          status: 'sent', replyLabel: classification.label, automaticReplyAt: now(),
          nextFollowupAt: new Date(Date.now() + 7 * 86400000).toISOString()
        } : {
          status: terminalDelivery ? classification.label : 'replied', replyLabel: classification.label,
          repliedAt: now(), nextFollowupAt: null
        });
        matched += 1;
        if (['optout', 'negative', 'bounce', 'complaint'].includes(classification.label)) {
          try {
            await this.store.add('suppressions', {
              id: id('sup'), value: prospect.contact.email.toLowerCase(), reason: classification.label, createdAt: now()
            });
          } catch (error) {
            if (!(error instanceof ConflictError)) throw error;
          }
        }
        if (classification.label === 'bounce' || classification.label === 'complaint') {
          await this.store.recordOutboundEvent({
            inbox: account.slot, eventType: classification.label === 'bounce' ? 'hard_bounce' : 'complaint',
            prospectId: prospect.id, recipientEmail: prospect.contact?.email || '', detail: { gmailId: parsed.id }
          }, this.outboundThresholds());
        }
      }
      account.lastReplyPoll = Date.now();
      await this.store.upsert('accounts', account);
    }
    return matched;
  }
}
