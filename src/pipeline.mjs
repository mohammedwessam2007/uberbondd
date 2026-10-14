import { id, now } from './utils.mjs';
import { crawlSiteBrowser } from './browser-crawler.mjs';
import { deterministicAudit, scoreProspect, chooseIssue } from './audit-rules.mjs';
import { enhanceAudit, classifyReply } from './ai.mjs';
import { discoverContacts, verifyEmail } from './contacts.mjs';
import { buildMessage, buildSubject, buildUberReplyV5Message, buildUberReplyV5Subject, routeInbox } from './copy.mjs';
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
import { compileUberReplyCampaignDecision, compileUberReplyPreSendGate, compileUberReplyAsyncCloseDecision } from './uberreply-four-offer-genome.mjs';
import { compileUberReplyPreworkArtifact } from './uberreply-prework-artifact.mjs';
import { evaluateDomainMailboxGate, DOMAIN_MAILBOX_GATE_POLICY_VERSION } from './domain-mailbox-gate.mjs';
import { loadSendingDomain } from './sending-domain-registry.mjs';
import { loadSendingMailbox } from './sending-mailbox-registry.mjs';
import { selectFleetMailbox, dispatchSmtpFleetAccount } from './uberfleet.mjs';
import { gateOutboundRoute } from './outbound-send-authorization.mjs';
import { evaluateOutreachPersonalization } from './ubertruth-outreach.mjs';
import { pollImapForwardingAccount } from './uberimap.mjs';
import { detectUnsubscribeIntent, leadingReplyText, boundedPreview, classifyImapPollFailure, imapBackoffMs, credentialDigest, isDeliveryNotice, attributeDeliveryNotice, IMAP_AUTH_FAILURE_LIMIT, IMAP_TRANSIENT_RETRY_LIMIT } from './inbound-classify.mjs';
import { propagateSuppression, recordInboundHealthEvent, buildOperatorEscalation, recordOperatorEscalation } from './inbound-suppression-propagation.mjs';

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
    this.canonicalExternalEffects = hooks.canonicalExternalEffects ?? null;
    this.smtpSendFn = hooks.smtpSend || dispatchSmtpFleetAccount;
    this.imapPollFn = hooks.imapPoll || pollImapForwardingAccount;
    // Live-route authorization. No package is built by default, so every provider branch refuses before any credential,
    // transport or provider call. An owner-approved supplier and its consent verifier must be injected to send at all.
    this.outboundAuthorizationFn = hooks.outboundAuthorization || null;
    this.outboundConsentVerifier = hooks.consentVerifier;
  }

  async selectFleetInbox(prospect, audit = []) {
    const provider = String(this.cfg.outbound?.provider || 'gmail-api').toLowerCase();
    if (provider !== 'smtp-relay') return prospect?.inbox || routeInbox(prospect, audit);
    const [accounts, senderHealth, outboundEvents] = await Promise.all([
      this.store.list('accounts'), this.store.list('senderHealth'), this.store.list('outboundEvents')
    ]);
    const allocation = selectFleetMailbox({
      prospectId: prospect?.id || prospect?.domain || prospect?.company || '',
      currentSlot: prospect?.inbox || '',
      accounts,
      senderHealth,
      outboundEvents,
      provider,
      date: this.clock()
    });
    return allocation.ok ? allocation.slot : '';
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
        contact = { ...contact, verified: verification.status, verificationScore: verification.score, verifications: verification.verification ? [verification.verification] : [] };
      } catch (error) {
        await this.store.log('verification_failed', { prospectId: prospect.id, error: error.message });
      }
    }

    const score = scoreProspect(prospect, audit, contact);
    const issue = chooseIssue(audit);
    const inbox = await this.selectFleetInbox(prospect, audit);
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
    const optoutUrl = contact?.email ? unsubscribeUrl(this.cfg.baseUrl, prospect.id, this.cfg.unsubscribeSecret) : '';
    const oneClickOptoutUrl = contact?.email ? oneClickUnsubscribeUrl(this.cfg.baseUrl, prospect.id, this.cfg.unsubscribeSecret) : '';
    const uberReplyPreworkArtifact = researchQualified && campaign.offerId && offerDecision?.ok
      ? compileUberReplyPreworkArtifact({
          offerId: campaign.offerId,
          prospect,
          issue,
          audit,
          maxFindings: 3
        })
      : null;
    const draft = researchQualified
      ? (campaign.offerId && offerDecision?.ok
          ? buildUberReplyV5Message({
              offerId: campaign.offerId,
              prospect,
              issue,
              audit,
              contact,
              sender: this.cfg.sender,
              artifact: uberReplyPreworkArtifact,
              unsubscribeUrl: optoutUrl
            })
          : buildMessage({ prospect, issue, contact, sender: this.cfg.sender, offerName: offerDecision?.offer?.publicName, unsubscribeUrl: optoutUrl }))
      : '';
    const subject = researchQualified
      ? (campaign.offerId && offerDecision?.ok
          ? buildUberReplyV5Subject({ offerId: campaign.offerId, prospect, issue, followup: 0 })
          : buildSubject(prospect, issue, 0, offerDecision?.offer?.publicName))
      : '';
    const personalizationDecision = researchQualified ? evaluateOutreachPersonalization({
      prospect, issue, contact: contact || {}, subject, body: draft,
      minEvidenceConfidence: this.cfg.outbound?.minEvidenceConfidence
    }) : null;
    const legalRecord = prospect.recipientEligibility || prospect.legalEligibility || prospect.outreachEligibility || null;
    const legalStatus = legalRecord?.legal?.status || legalRecord?.status || '';
    const v5PreparationReady = !campaign.offerId || (
      uberReplyPreworkArtifact?.prepared === true
      && legalStatus === 'PASSED'
    );
    const sendEligible = Boolean(
      researchQualified && inbox && contact?.email &&
      ['valid', 'accept_all', 'unverified', 'unknown'].includes(contact.verified || 'unverified') &&
      !suppressed && personalizationDecision?.autoSendEligible === true &&
      v5PreparationReady
    );
    const status = researchQualified ? (sendEligible ? 'ready' : 'research-complete') : 'rejected';
    const dossier = buildDossier({ prospect, crawl, audit, contact, score, issue, inbox, subject, draft, aiMeta });
    const patch = {
      status, crawl, audit, contacts, contact, score, issue, inbox, offerDecision,
      uberReplyPreworkArtifact,
      draft, subject, personalizationDecision,
      unsubscribeUrl: optoutUrl, oneClickUnsubscribeUrl: oneClickOptoutUrl,
      dossier, completedAt: now()
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

    if (String(this.cfg.outbound?.provider || '').toLowerCase() === 'smtp-relay') {
      const assigned = await this.selectFleetInbox(prospect, prospect.audit || []);
      if (assigned && assigned !== prospect.inbox) {
        await this.store.patch('prospects', prospect.id, { inbox: assigned });
        prospect = { ...prospect, inbox: assigned };
      }
    }
    const account = await this.store.findOne('accounts', { slot: prospect.inbox });
    if (!account?.connected) return this.markSendSafety(prospect, { sent: false, reason: 'needs-connected-sender' });

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

    if (campaign.offerId) {
      const legalRecord = prospect.recipientEligibility || prospect.legalEligibility || prospect.outreachEligibility || null;
      const preSend = compileUberReplyPreSendGate({
        offerId: campaign.offerId,
        prospect: {
          ...prospect,
          problemEvidenceScore: Math.min(1, Number(prospect?.score?.total || 0) / 100)
        },
        evidence: { refs: prospect?.uberReplyPreworkArtifact?.evidenceRefs || [] },
        eligibility: {
          legalEligible: (legalRecord?.legal?.status || legalRecord?.status) === 'PASSED',
          suppressed: false,
          validContactRoute: Boolean(prospect?.contact?.email)
        },
        sender: {
          healthy: Boolean(account?.connected) && (!domainMailboxGate || domainMailboxGate.decision === 'NOT_BLOCKED_BY_DOMAIN_MAILBOX_GATE')
        },
        artifact: { prepared: prospect?.uberReplyPreworkArtifact?.prepared === true }
      });
      await this.store.log('uberreply_v5_pre_send_gate', {
        prospectId: prospect.id,
        campaignId: campaign.id,
        offerId: campaign.offerId,
        state: preSend.state,
        reasonCodes: preSend.reasonCodes || [],
        checkedAt: this.clock().toISOString()
      });
      if (!preSend.ok) {
        return this.markSendSafety(prospect, {
          sent: false,
          reason: 'uberreply-v5-pre-send-gate-denied',
          decision: preSend.state,
          reasonCodes: preSend.reasonCodes
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

    const observedDaily = Number(domainMailboxGate?.mailboxState?.currentDailyCap ?? account.currentDailyCap ?? account.plannedDailyCap ?? 0);
    const observedHourly = Number(domainMailboxGate?.mailboxState?.currentHourlyCap ?? account.currentHourlyCap ?? account.plannedHourlyCap ?? 0);
    const configuredDaily = Number(this.cfg.caps?.[prospect.inbox] ?? observedDaily);
    const campaignDaily = Number(campaign.dailyCaps?.[prospect.inbox] ?? configuredDaily);
    const dailyCap = Math.max(0, Math.min(campaignDaily, configuredDaily));
    const hourlyCap = Math.max(0, Number(this.cfg.outbound?.hourlyCaps?.[prospect.inbox] ?? observedHourly));
    const minGapSeconds = Math.max(0, Number(account.minGapSeconds ?? this.cfg.outbound?.minGapSeconds ?? 0));
    const idempotencyKey = sendIdempotencyKey(prospect.id, followup);
    const reserved = await this.store.reserveOutboundSend({
      idempotencyKey, prospectId: prospect.id, campaignId: campaign.id, inbox: prospect.inbox,
      recipientEmail: prospect.contact.email, kind: followup ? 'followup' : 'initial', followup,
      dailyCap, hourlyCap, minGapSeconds, now: this.clock().toISOString()
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
      from: ['postal','smtp-relay'].includes(outboundProvider) ? account.email : `${this.cfg.sender.name} <${account.email}>`,
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
        checkedAt: this.clock().toISOString(),
        provider: outboundProvider
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

    // Live-route gate, before any credential, transport or provider call on every branch below. The package must bind this
    // exact payload and sender and decideOutboundSend must allow it. Without one the reservation is released with an explicit
    // reason and no provider effect. A supplier error is treated as a missing package, never as permission.
    let outboundAuthorization = null;
    try {
      outboundAuthorization = this.outboundAuthorizationFn
        ? await this.outboundAuthorizationFn({ message: effectPayload, account, campaign, prospect, reservation, followup })
        : null;
    } catch {
      outboundAuthorization = null;
    }
    const outboundMessage = { ...effectPayload, authorization: outboundAuthorization || undefined };
    // The provider branch that will actually run below. Only the SMTP effect-adapter branch is bound to the package model.
    const routeProvider = this.cfg.outbound?.useEffectAdapter === true && ['smtp-relay', 'postal'].includes(outboundProvider) ? outboundProvider : 'gmail-api';
    const outboundRefusal = gateOutboundRoute({ account, message: outboundMessage, consentVerifier: this.outboundConsentVerifier, routeProvider });
    if (outboundRefusal) {
      await this.store.markOutboundReservation(reservation.id, 'cancelled', {
        cancelReason: 'outbound-authorization-refused', providerReasonCodes: outboundRefusal.reasonCodes
      });
      return this.markSendSafety(prospect, {
        sent: false, reason: 'outbound-authorization-refused', reservationId: reservation.id,
        reasonCodes: outboundRefusal.reasonCodes
      });
    }

    let result;
    let providerMeta = null;
    try {
      if (this.cfg.outbound?.useEffectAdapter === true && outboundProvider === 'smtp-relay') {
        providerMeta = await this.smtpSendFn({
          account, encryptionKey: this.cfg.encryptionKey, message: outboundMessage, consentVerifier: this.outboundConsentVerifier
        });
        if (providerMeta?.classification === 'REFUSED') {
          await this.store.markOutboundReservation(reservation.id, 'cancelled', {
            cancelReason: 'outbound-authorization-refused', providerReasonCodes: providerMeta.reasonCodes || []
          });
          return this.markSendSafety(prospect, {
            sent: false, reason: 'outbound-authorization-refused', reservationId: reservation.id,
            reasonCodes: providerMeta.reasonCodes || []
          });
        }
        if (providerMeta?.classification === 'REJECTED') {
          await this.store.markOutboundReservation(reservation.id, 'cancelled', {
            cancelReason: 'smtp-provider-rejected',
            providerReasonCodes: providerMeta.reasonCodes || []
          });
          return this.markSendSafety(prospect, {
            sent: false, reason: 'provider-rejected', reservationId: reservation.id,
            reasonCodes: providerMeta.reasonCodes || []
          });
        }
        if (providerMeta?.classification !== 'ACCEPTED' || !providerMeta?.providerReferenceId) {
          const uncertain = new Error(providerMeta?.dispatchError || 'smtp-provider-result-uncertain');
          uncertain.providerMeta = providerMeta;
          throw uncertain;
        }
        result = { data: { id: providerMeta.providerReferenceId, threadId: '' } };
      } else if (this.cfg.outbound?.useEffectAdapter === true && outboundProvider === 'postal') {
        providerMeta = await this.postalSendFn({
          cfg: this.cfg, account, reservation, effectPayload: outboundMessage, followup, now: this.clock,
          canonicalRuntime: this.canonicalExternalEffects, consentVerifier: this.outboundConsentVerifier
        });
        if (providerMeta?.classification === 'REFUSED') {
          await this.store.markOutboundReservation(reservation.id, 'cancelled', {
            cancelReason: 'outbound-authorization-refused', providerReasonCodes: providerMeta.reasonCodes || []
          });
          return this.markSendSafety(prospect, {
            sent: false, reason: 'outbound-authorization-refused', reservationId: reservation.id,
            reasonCodes: providerMeta.reasonCodes || []
          });
        }
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
    if (outboundProvider === 'gmail-api') {
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
      gmailId: outboundProvider === 'gmail-api' ? result.data.id : null,
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
      gmailId: outboundProvider === 'gmail-api' ? result.data.id : null,
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
      const body = campaign.offerId && prospect.offerDecision?.ok
        ? buildUberReplyV5Message({
            offerId: campaign.offerId,
            prospect,
            issue: prospect.issue,
            audit: prospect.audit || [],
            contact: prospect.contact,
            sender: this.cfg.sender,
            artifact: prospect.uberReplyPreworkArtifact,
            followup,
            unsubscribeUrl: prospect.unsubscribeUrl
          })
        : buildMessage({ prospect, issue: prospect.issue, contact: prospect.contact, sender: this.cfg.sender, offerName: prospect.offerDecision?.offer?.publicName, followup, unsubscribeUrl: prospect.unsubscribeUrl });
      if (!body) {
        await this.store.patch('prospects', prospect.id, { nextFollowupAt: null, sequenceStopReason: 'no-new-evidence-for-v5-followup' });
        continue;
      }
      const subject = campaign.offerId && prospect.offerDecision?.ok
        ? buildUberReplyV5Subject({ offerId: campaign.offerId, prospect, issue: prospect.issue, followup })
        : buildSubject(prospect, prospect.issue, followup, prospect.offerDecision?.offer?.publicName);
      const result = await this.maybeSend(prospect, campaign, { followup, body, subject });
      if (result?.sent) processed += 1;
    }
    return processed;
  }

  async pollReplies() {
    let matched = 0;
    const storedAccounts = await this.store.list('accounts');
    const allAccounts = storedAccounts.filter(account => account.connected);
    const prospects = await this.store.list('prospects');
    const sentMessages = await this.store.list('messages');

    // Helpers stay inside pollReplies so the whole reply path is in one place.
    // The configured sending domains: the outbound override when set, and the domain of every stored sending address.
    const sendingDomains = [...new Set([
      String(this.cfg.outbound?.sendingDomain || '').trim().toLowerCase(),
      ...storedAccounts.map(account => String(account.email || '').trim().toLowerCase().split('@')[1] || '')
    ].filter(Boolean))];
    // A delivery notice is recognised by the inbound-classify rule: an RFC 3464 multipart/report with report-type
    // delivery-status from any sender, or a mailer-daemon/postmaster at a configured sending domain. A From header alone
    // is forgeable, so a bounce-looking sender at a foreign domain is never a notice.
    // A notice is charged only when it comes from a system sender (mailer-daemon or postmaster). The module's any-sender
    // RFC 3464 recognition is not used for charging: a structured report from another sender stays manual review.
    const systemSenderLocalPart = /^(mailer-daemon|postmaster)@/i;
    const isDeliveryNoticeHere = input => systemSenderLocalPart.test(String(input.fromEmail || ''))
      && (isDeliveryNotice({ ...input, sendingDomain: '' })
        || sendingDomains.some(sendingDomain => isDeliveryNotice({ ...input, sendingDomain })));
    const IMAP_POISON_LIMIT = 3;
    // Stored reply bodies are bounded previews. Classification still reads the full decoded text.
    const REPLY_BODY_STORE_CHARS = 4000;
    const UNLINKED_PREVIEW_CHARS = 500;
    // Log a code-style class only. Library and provider messages can echo hosts or credentials.
    const sanitizedErrorClass = error => String(error?.code || error?.name || 'ERROR').toUpperCase().replace(/[^A-Z0-9_-]/g, '_').slice(0, 80) || 'ERROR';
    // UIDVALIDITY-qualified keys, so a rebuilt mailbox cannot collide with old UIDs.
    // Legacy 'imap:slot:uid' keys stay valid for records written before this change.
    const imapExternalId = (slot, uidValidity, uid) => (uidValidity > 0 ? `imap:${slot}:v${uidValidity}:${uid}` : `imap:${slot}:${uid}`);
    // A Message-ID is stable across UIDVALIDITY resets and across forwarding slots, so it is the dedupe key when present.
    // Without one, the parser's content digest also survives a UIDVALIDITY reset. The UID key is the last resort.
    const imapMessageKey = (parsed, slot, uidValidity, uid) => {
      if (parsed.messageId) return `mid:${parsed.messageId}`;
      if (/^imapmsg:[0-9a-f]{32}$/.test(String(parsed.id || ''))) return `imapmsg:${String(parsed.id).slice('imapmsg:'.length)}`;
      return imapExternalId(slot, uidValidity, uid);
    };
    // Message-ID tokens, bracket-stripped and lower-cased. An In-Reply-To header may carry several IDs.
    const messageIdTokens = value => {
      const text = String(value ?? '');
      const bracketed = text.match(/<[^<>\s]+>/g);
      return (bracketed || text.split(/\s+/)).map(part => part.trim().replace(/^<+|>+$/g, '').toLowerCase()).filter(Boolean);
    };
    // The one sending address stored for an outbound slot. Zero or several accounts for the slot yield no address.
    const senderAddressFor = slot => {
      if (!slot) return '';
      const owners = storedAccounts.filter(account => account.slot === slot && String(account.email || '').trim());
      return owners.length === 1 ? String(owners[0].email).trim().toLowerCase() : '';
    };

    // Side effects for one classified reply. Every step is safe to repeat: suppression, health events, escalations and the
    // prospect status are idempotent. The completion marker is written last, so a run that stopped midway is finished by the next poll.
    const applySideEffects = async ({ prospect, classification, asyncCloseDecision, externalId, sendingSlot, markId, correlation = 'none', replyId = '', senderEmail = '' }) => {
      const terminalDelivery = ['bounce', 'complaint'].includes(classification.label);
      const automatic = ['automatic', 'out_of_office'].includes(classification.label);
      await this.store.patch('prospects', prospect.id, automatic ? {
        status: 'sent', replyLabel: classification.label, automaticReplyAt: now(),
        nextFollowupAt: new Date(Date.now() + 7 * 86400000).toISOString()
      } : {
        status: terminalDelivery ? classification.label : 'replied', replyLabel: classification.label,
        repliedAt: now(), nextFollowupAt: null,
        asyncCloseDecision
      });
      const suppressedEmail = String(prospect.contact?.email || '').toLowerCase();
      if (suppressedEmail && (classification.suppressionRecommended === true || ['optout', 'negative', 'bounce', 'complaint'].includes(classification.label))) {
        // Suppression is keyed by recipient address, so it applies to every sender slot.
        await propagateSuppression(this.store, { email: suppressedEmail, reason: classification.label, sourceId: externalId });
      }
      // A thread-linked opt-out also suppresses the address that sent it, which may be an assistant rather than the contact.
      // Our own mailboxes are never suppressed by a reply.
      const ownAddresses = new Set(storedAccounts.map(account => String(account.email || '').trim().toLowerCase()));
      if (classification.label === 'optout' && senderEmail && senderEmail !== suppressedEmail && !ownAddresses.has(senderEmail)) {
        await propagateSuppression(this.store, { email: senderEmail, reason: 'optout', sourceId: externalId });
      }
      if (terminalDelivery) {
        // The sending mailbox takes the health charge, never the IMAP mailbox that happened to receive the notice.
        // A complaint also holds the sending slot, even below the configured complaint threshold.
        await recordInboundHealthEvent(this.store, {
          eventType: classification.label === 'bounce' ? 'hard_bounce' : 'complaint',
          inbox: sendingSlot || prospect.inbox || '', prospectId: prospect.id, recipientEmail: prospect.contact?.email || '',
          externalId, thresholds: this.outboundThresholds()
        });
      }
      // Operator escalation for a complaint, an unsubscribe, or a non-automatic reply inside a linked thread.
      // The pipeline never answers these automatically.
      const escalationKind = classification.label === 'complaint' ? 'complaint'
        : classification.unsubscribeIntent === true ? 'unsubscribe'
          : (correlation === 'thread' && !automatic && classification.label !== 'bounce') ? 'human_response' : '';
      if (escalationKind) {
        const reasonCode = {
          complaint: classification.reasonCode || 'COMPLAINT_SIGNAL',
          unsubscribe: 'UNSUBSCRIBE_INTENT',
          human_response: 'THREAD_LINKED_HUMAN_REPLY'
        }[escalationKind];
        await recordOperatorEscalation(this.store, buildOperatorEscalation({
          kind: escalationKind, externalId, replyId, prospectId: prospect.id, slot: sendingSlot || '',
          correlation, label: classification.label, reasonCode, at: now()
        }));
      }
      await this.store.patch('replies', markId, { sideEffectsDone: true });
    };

    const recordReply = async ({
      externalId, threadId = '', from = '', fromEmail = '', subject = '', body = '', inReplyTo = '', references = [],
      accountSlot = '', contentType = '', structural = false, autoSubmitted = false, persistUnlinked = false,
      listUnsubscribe = '', reportType = '', embeddedMessageIds = [], originalMailFrom = '', deliveryFinalRecipients = [], deliveryActions = [], deliveryStatuses = [], mimeQuarantine = null
    } = {}) => {
      if (!externalId) return false;
      const existing = await this.store.findOne('replies', { gmailId: externalId });
      if (existing) {
        // Recorded by an earlier run. If that run stopped before its side effects finished, finish them now.
        if (existing.sideEffectsDone !== true && existing.prospectId) {
          const replayProspect = prospects.find(item => item.id === existing.prospectId);
          if (replayProspect) {
            await applySideEffects({
              prospect: replayProspect, classification: existing.classification || { label: 'manual_review' },
              asyncCloseDecision: existing.asyncCloseDecision || null, externalId,
              sendingSlot: existing.sendingSlot || replayProspect.inbox || '', markId: existing.id,
              correlation: existing.correlation || 'none', replyId: existing.id, senderEmail: existing.fromEmail || ''
            });
          }
        }
        return false;
      }
      const senderEmail = String(fromEmail || '').toLowerCase();
      // Machine-marked evidence. A feedback report is a complaint candidate; a delivery notice is a bounce candidate.
      // Both count against a sender only when they link to exactly one stored outbound message.
      const feedbackReport = structural && String(reportType || '').trim().toLowerCase() === 'feedback-report';
      const deliveryNotice = isDeliveryNoticeHere({ fromEmail: senderEmail, contentType, reportType });
      const machineEvidence = deliveryNotice || feedbackReport;
      let linkedMessage = null;
      let attributionReason = '';
      if (machineEvidence) {
        // An ARF report names the original in an embedded part, and a notice may name it the same way. Only a stored outbound
        // Message-ID counts, and exactly one distinct match links it. Zero or several matches leave the message unlinked.
        const attribution = attributeDeliveryNotice({
          isNotice: true,
          inReplyTo,
          references: Array.isArray(references) ? references : [],
          embeddedMessageIds: Array.isArray(embeddedMessageIds) ? embeddedMessageIds : [],
          outboundMessageIds: sentMessages.map(message => message.rfcMessageId).filter(Boolean)
        });
        if (attribution.status === 'LINKED') {
          const token = messageIdTokens(attribution.messageId)[0];
          linkedMessage = sentMessages.find(message => messageIdTokens(message.rfcMessageId)[0] === token) || null;
        } else {
          attributionReason = attribution.reasonCode;
        }
      } else {
        // Human and unmarked replies keep thread correlation through any matching reference.
        const replyTokens = new Set([
          ...messageIdTokens(inReplyTo),
          ...(Array.isArray(references) ? references : []).flatMap(messageIdTokens)
        ]);
        linkedMessage = sentMessages.find(message => {
          const token = messageIdTokens(message.rfcMessageId)[0];
          return Boolean(token) && replyTokens.has(token);
        }) || null;
      }
      // A feedback report is verified only when its linked message was sent from the address the report names as the
      // original sender. Without that match it is a claim, not evidence, and it charges nobody.
      const sentFrom = linkedMessage ? senderAddressFor(linkedMessage.inbox) : '';
      const feedbackVerified = feedbackReport && !deliveryNotice && Boolean(linkedMessage)
        && sentFrom !== '' && sentFrom === String(originalMailFrom || '').trim().toLowerCase();
      const unverifiedFeedback = feedbackReport && !deliveryNotice && !feedbackVerified;
      // A MIME label, system-sounding sender and Message-ID are all attacker-controlled claims.
      // Even a uniquely linked RFC 3464 report cannot charge a buyer unless its one
      // machine-readable recipient equals the outbound `to`, with permanent failure status.
      // Multiple recipients, missing fields, delays or 4.x status go to operator review.
      const deliveryVerified = deliveryNotice && Boolean(linkedMessage)
        && Array.isArray(deliveryFinalRecipients) && deliveryFinalRecipients.length === 1
        && deliveryFinalRecipients[0] === String(linkedMessage.to || '').trim().toLowerCase()
        && Array.isArray(deliveryActions) && deliveryActions.length === 1 && deliveryActions[0] === 'failed'
        && Array.isArray(deliveryStatuses) && deliveryStatuses.length === 1
        && /^5\.\d+\.\d+$/.test(deliveryStatuses[0]);
      const unverifiedDelivery = deliveryNotice && !deliveryVerified;
      const trustedLink = Boolean(linkedMessage) && !(unverifiedFeedback || unverifiedDelivery);
      let prospect = null;
      if (trustedLink) prospect = prospects.find(item => item.id === linkedMessage.prospectId) || null;
      else if (!machineEvidence) prospect = prospects.find(item => item.contact?.email && senderEmail && item.contact.email.toLowerCase() === senderEmail) || null;
      const correlation = !prospect ? 'none' : (trustedLink ? 'thread' : 'sender-address');
      // Why a machine-marked message was not linked. Owner review reads this; nothing is charged.
      let reviewReason = '';
      if (machineEvidence && !trustedLink) reviewReason = unverifiedFeedback && linkedMessage ? 'UNVERIFIED_FEEDBACK_REPORT'
        : unverifiedDelivery && linkedMessage ? 'UNVERIFIED_DELIVERY_RECIPIENT_OR_STATUS' : attributionReason;
      const unsubscribe = detectUnsubscribeIntent({
        listUnsubscribe: String(listUnsubscribe || ''), subject: String(subject || ''), body: String(body || '')
      });
      if (!prospect) {
        // An unlinked sender is not a known recipient, but an opt-out still blocks that address. Only a high-confidence intent suppresses.
        if (unsubscribe.intent && unsubscribe.confidence === 'high') {
          if (senderEmail) await propagateSuppression(this.store, { email: senderEmail, reason: 'optout', sourceId: externalId });
          await recordOperatorEscalation(this.store, buildOperatorEscalation({
            kind: 'unsubscribe', externalId, slot: accountSlot || '', correlation: 'none', label: 'unlinked', reasonCode: 'UNLINKED_SENDER', at: now()
          }));
        }
        if (feedbackReport) {
          // A feedback report that cannot be verified goes to the operator. It is never suppressed or charged automatically.
          // The precise cause (unverified, ambiguous, unlinked) is kept on the stored unlinked record.
          await recordOperatorEscalation(this.store, buildOperatorEscalation({
            kind: 'complaint', externalId, slot: accountSlot || '', correlation: 'none', label: 'unlinked',
            reasonCode: 'UNLINKED_FEEDBACK_REPORT', at: now()
          }));
        }
        // Unlinked IMAP replies are kept, not dropped. A bounded preview is stored, never the full third-party body.
        if (!persistUnlinked) return false;
        const record = {
          id: `unlinked:${externalId}`, externalId, accountSlot, from: String(from || '').slice(0, 320), fromEmail: senderEmail,
          subject: String(subject || '').slice(0, 300), bodyPreview: boundedPreview(body, UNLINKED_PREVIEW_CHARS),
          inReplyTo: inReplyTo || null,
          references: Array.isArray(references) ? references.slice(0, 20).map(item => String(item).slice(0, 500)) : [],
          reasonCode: reviewReason || null,
          reviewFlag: mimeQuarantine ? 'MIME_QUARANTINED' : null,
          receivedAt: now()
        };
        try {
          await this.store.add('unlinkedReplies', record);
        } catch (error) {
          if (error instanceof ConflictError) return 'unlinked';
          throw error;
        }
        return 'unlinked';
      }

      const deliverySignal = classifyDeliverySignal({ from, subject, body, threadId, id: externalId });
      const automaticLabel = label => label === 'automatic' || label === 'out_of_office';
      // A complaint needs a verified feedback report. A delivery notice keeps the existing rules.
      const machineComplaint = !deliveryNotice && feedbackVerified;
      let classification;
      if (machineComplaint) {
        classification = {
          label: 'complaint', confidence: 0.97, suppressionRecommended: true, reasonCode: 'MACHINE_FEEDBACK_REPORT',
          reason: 'Verified feedback report linked to an outbound thread'
        };
      } else if (deliverySignal && ['bounce', 'complaint'].includes(deliverySignal.label) && !deliveryNotice) {
        classification = { label: 'manual_review', confidence: 0.5, suppressionRecommended: false, reason: 'Bounce or complaint language without a verified delivery notice' };
      } else if (deliverySignal && (deliveryNotice || autoSubmitted || !automaticLabel(deliverySignal.label))) {
        classification = deliverySignal;
      } else {
        // Classify the reply's own words. Quoted original text (including our footer) is not the recipient speaking.
        classification = await classifyReply(this.cfg.ai, leadingReplyText(body) || body);
      }
      if (!deliveryNotice && !machineComplaint && ['bounce', 'complaint'].includes(classification.label)) {
        // Downgraded: no suppression, no terminal prospect status, no outbound event.
        classification = { ...classification, label: 'manual_review', suppressionRecommended: false, reason: 'Bounce or complaint language outside a delivery notice' };
      }
      if (!deliveryNotice && !autoSubmitted && automaticLabel(classification.label)) {
        // Automatic-reply wording from a person must not schedule an automatic follow-up. Only a machine-marked reply may.
        classification = { ...classification, label: 'manual_review', reason: 'Automatic-reply wording without an Auto-Submitted header' };
      }
      // A message whose body was withheld by a MIME cap is routed to review. Its label comes from no body text, and the
      // review flag is kept whatever a header or subject signal says below.
      let reviewFlag = null;
      if (mimeQuarantine) {
        classification = { label: 'manual_review', confidence: 0, suppressionRecommended: false, reasonCode: 'MIME_QUARANTINED', reason: 'MIME quarantined: body withheld for owner review' };
        reviewFlag = 'MIME_QUARANTINED';
      }
      // A clear unsubscribe from a person becomes an opt-out. A medium signal (header only, or subject only) counts only inside a linked thread.
      const unsubscribeFires = unsubscribe.intent
        && (unsubscribe.confidence === 'high' || (unsubscribe.confidence === 'medium' && correlation === 'thread'));
      if (unsubscribeFires && !autoSubmitted && !deliveryNotice && !['bounce', 'complaint', 'automatic', 'out_of_office'].includes(classification.label)) {
        classification = {
          label: 'optout', confidence: 0.99, suppressionRecommended: true, unsubscribeIntent: true,
          unsubscribeSource: unsubscribe.source, reason: `Unsubscribe intent (${unsubscribe.source})`
        };
      }
      let asyncCloseDecision = null;
      if (prospect?.offerDecision?.offer?.offerId) {
        const label = String(classification?.label || '').toLowerCase();
        const text = String(body || '').toLowerCase();
        let replyState = 'UNKNOWN';
        if (label === 'positive') replyState = 'YES';
        else if (label === 'wrong_person' || label === 'referral') replyState = 'WRONG_PERSON';
        else if (['negative','optout'].includes(label)) replyState = 'NO';
        else if (/\b(price|pricing|cost|how much)\b/.test(text)) replyState = 'PRICE';
        else if (/\b(call|zoom|meet|meeting)\b/.test(text)) replyState = 'CALL';
        else if (/\b(not now|later|next month|next quarter)\b/.test(text)) replyState = 'NOT_NOW';
        asyncCloseDecision = compileUberReplyAsyncCloseDecision({
          offerId: prospect.offerDecision.offer.offerId,
          replyState
        });
      }
      const sendingSlot = linkedMessage?.inbox || prospect.inbox || accountSlot || '';
      const row = {
        id: id('reply'), prospectId: prospect.id, gmailId: externalId, threadId,
        from, fromEmail: senderEmail, subject, body: boundedPreview(body, REPLY_BODY_STORE_CHARS), classification, asyncCloseDecision, receivedAt: now(),
        sendingSlot, sideEffectsDone: false, correlation, reviewFlag
      };
      try {
        await this.store.add('replies', row);
      } catch (error) {
        if (error instanceof ConflictError) return false;
        throw error;
      }
      await applySideEffects({
        prospect, classification, asyncCloseDecision, externalId, sendingSlot, markId: row.id, correlation, replyId: row.id, senderEmail
      });
      matched += 1;
      return true;
    };

    const gmailAccounts = allAccounts.filter(account => {
      const provider = String(account.provider || 'gmail-api').toLowerCase();
      return provider === 'gmail-api' || (!account.provider && account.tokens);
    });
    for (const account of gmailAccounts) {
      const after = Math.floor((account.lastReplyPoll || Date.now() - 86400000) / 1000);
      const list = await listMessages(this.cfg.google, account, this.cfg.encryptionKey, `in:inbox after:${after}`, 100);
      if (list.tokens) account.tokens = sealTokens(list.tokens, this.cfg.encryptionKey);
      for (const reference of list.data.messages || []) {
        const full = await getMessage(this.cfg.google, account, this.cfg.encryptionKey, reference.id);
        const parsed = parseGmailMessage(full.data);
        // The top-level Content-Type lets a Gmail delivery notice be recognised by the same structural rule as IMAP.
        const gmailContentType = (full.data?.payload?.headers || []).find(header => String(header?.name || '').toLowerCase() === 'content-type')?.value || '';
        await recordReply({
          externalId: parsed.id,
          threadId: parsed.threadId,
          from: parsed.from,
          fromEmail: String(parsed.from || '').match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i)?.[0] || '',
          subject: parsed.subject,
          body: parsed.body,
          accountSlot: account.slot,
          contentType: gmailContentType
        });
      }
      account.lastReplyPoll = Date.now();
      await this.store.upsert('accounts', account);
    }

    // Bounded retry, backoff and quarantine for IMAP forwarding accounts. Only the read is retried, and only for transient network
    // errors, with a fixed and small number of attempts. Retry delays can be overridden by hooks (tests use zero delays).
    const retryDelays = Array.isArray(this.hooks?.imapRetryDelaysMs)
      ? this.hooks.imapRetryDelaysMs.slice(0, IMAP_TRANSIENT_RETRY_LIMIT).map(ms => Math.max(0, Number(ms) || 0))
      : [250, 1000];
    const sleepMs = this.hooks?.imapSleep || (ms => new Promise(resolve => setTimeout(resolve, ms)));
    // Auth failures count toward quarantine. A failure under a different credential digest starts a new count, so a rotated
    // credential is never held against the old one. Transient failures earn a bounded backoff window instead.
    const failurePatchFor = (live, digest, failure) => {
      if (failure.kind === 'auth') {
        const count = (live.imapAuthFailureDigest === digest ? Number(live.imapAuthFailures || 0) : 0) + 1;
        const patch = { imapAuthFailures: count, imapAuthFailureDigest: digest };
        if (count >= IMAP_AUTH_FAILURE_LIMIT) {
          patch.imapQuarantine = { reasonCode: 'IMAP_AUTH_REPEATED', tokenDigest: digest, quarantinedAt: now() };
        }
        return patch;
      }
      if (failure.kind === 'transient') {
        const count = Number(live.imapTransientFailures || 0) + 1;
        return { imapTransientFailures: count, imapNextAttemptAt: new Date(Date.now() + imapBackoffMs(count)).toISOString() };
      }
      return {};
    };

    const forwardingAccounts = allAccounts.filter(account => String(account.provider || '').toLowerCase() === 'imap-forwarding');
    for (const account of forwardingAccounts) {
      // The account is re-read so a rotated credential, a quarantine or a backoff window written since the snapshot is honoured.
      const live = (await this.store.get('accounts', account.id)) || account;
      const digest = credentialDigest(live.tokens);
      if (live.imapQuarantine) {
        // A quarantined mailbox is not polled. Only a changed credential releases it. The checkpoint is left untouched.
        if (live.imapQuarantine.tokenDigest === digest) continue;
        await this.store.patch('accounts', account.id, {
          imapQuarantine: null, imapAuthFailures: 0, imapAuthFailureDigest: null, imapTransientFailures: 0, imapNextAttemptAt: null
        });
        await this.store.log('imap_credential_rotated', { accountId: account.id });
      }
      // A transient failure waits out its bounded backoff window instead of retrying on every cycle.
      if (live.imapNextAttemptAt && Date.parse(live.imapNextAttemptAt) > Date.now()) continue;
      // One account's failure never stops the others. The cursor moves only to the last UID recorded in ascending
      // order, and the store patch writes cursor fields only. A concurrent hold or disconnect is never overwritten.
      const initialCursor = Number(live.lastImapUid || 0);
      let cursor = initialCursor;
      let uidValidity = Number(live.lastImapUidValidity || 0);
      let phase = 'poll';
      try {
        let poll = null;
        let pollError = null;
        for (let attempt = 0; ; attempt += 1) {
          try {
            poll = await this.imapPollFn({ account: live, encryptionKey: this.cfg.encryptionKey, limit: 100 });
            pollError = null;
            break;
          } catch (error) {
            pollError = error;
            if (classifyImapPollFailure(error).kind !== 'transient' || attempt >= retryDelays.length) break;
            await sleepMs(retryDelays[attempt]);
          }
        }
        if (pollError) throw pollError;
        if (poll?.status === 'UBERIMAP_UIDVALIDITY_CHANGED') {
          // The mailbox reassigned its UIDs, so the stored cursor means nothing. Record nothing from this poll.
          // The poll boundary (lastReplyPoll) is deliberately not advanced: the next search starts from the last completed
          // poll, so replies received before the change are still searched. Re-scanned messages are deduplicated by
          // Message-ID or content digest, so a re-scan records nothing twice.
          const next = Number(poll.uidValidity || 0);
          await this.store.patch('accounts', account.id, { lastImapUid: 0, lastImapUidValidity: next, imapPoison: null });
          await this.store.log('imap_uidvalidity_changed', { accountId: account.id, previousUidValidity: uidValidity, uidValidity: next });
          continue;
        }
        if (!poll?.ok) {
          await this.store.log('imap_reply_poll_failed', { accountId: account.id, status: poll?.status || 'UNKNOWN', reasonCodes: poll?.reasonCodes || [] });
          const patch = failurePatchFor(live, digest, classifyImapPollFailure(poll || {}));
          if (Object.keys(patch).length) {
            await this.store.patch('accounts', account.id, patch);
            if (patch.imapQuarantine) {
              await this.store.log('imap_mailbox_quarantined', { accountId: account.id, reasonCode: patch.imapQuarantine.reasonCode, authFailures: patch.imapAuthFailures });
            }
          }
          continue;
        }
        uidValidity = Number(poll.uidValidity || uidValidity || 0);
        const messages = [...(poll.messages || [])].sort((a, b) => Number(a.uid) - Number(b.uid));
        phase = 'process';
        for (const parsed of messages) {
          const uid = Number(parsed.uid);
          if (!Number.isSafeInteger(uid) || uid <= 0) continue;
          await recordReply({
            externalId: imapMessageKey(parsed, account.slot, uidValidity, uid),
            threadId: '',
            from: parsed.from,
            fromEmail: parsed.fromEmail,
            subject: parsed.subject,
            body: parsed.body,
            inReplyTo: parsed.inReplyTo,
            references: parsed.references,
            accountSlot: account.slot,
            contentType: parsed.contentType,
            structural: true,
            autoSubmitted: parsed.autoSubmitted === true,
            listUnsubscribe: parsed.listUnsubscribe,
            reportType: parsed.reportType,
            embeddedMessageIds: parsed.embeddedMessageIds,
            originalMailFrom: parsed.originalMailFrom,
            deliveryFinalRecipients: parsed.deliveryFinalRecipients,
            deliveryActions: parsed.deliveryActions,
            deliveryStatuses: parsed.deliveryStatuses,
            mimeQuarantine: parsed.mimeQuarantine || null,
            persistUnlinked: true
          });
          cursor = Math.max(cursor, uid);
        }
        // A UID whose body cannot be read ends the batch. Retry it, and after repeated failures skip it deliberately
        // (quarantine) so one unreadable message cannot block the whole mailbox.
        let imapPoison = null;
        if (poll.failedUid) {
          const failedUid = Number(poll.failedUid);
          const previous = Number(live.imapPoison?.uid) === failedUid ? Number(live.imapPoison.count || 0) : 0;
          if (previous + 1 >= IMAP_POISON_LIMIT) {
            cursor = Math.max(cursor, failedUid);
            await this.store.log('imap_uid_quarantined', { accountId: account.id, uid: failedUid, attempts: previous + 1 });
          } else {
            imapPoison = { uid: failedUid, count: previous + 1 };
          }
        }
        // A successful read clears every failure counter. The cursor is written only after each message above was recorded.
        await this.store.patch('accounts', account.id, {
          lastImapUid: cursor, lastImapUidValidity: uidValidity, imapPoison, lastReplyPoll: Date.now(),
          imapAuthFailures: 0, imapAuthFailureDigest: null, imapTransientFailures: 0, imapNextAttemptAt: null
        });
      } catch (error) {
        // The batch stops here. Keep the cursor at the last recorded UID. Log a code-style class only.
        try {
          const failure = phase === 'poll' ? classifyImapPollFailure(error) : { kind: 'other', reasonCode: 'PROCESSING_ERROR' };
          const patch = {
            ...(cursor !== initialCursor ? { lastImapUid: cursor, lastImapUidValidity: uidValidity } : {}),
            ...failurePatchFor(live, digest, failure)
          };
          if (Object.keys(patch).length) await this.store.patch('accounts', account.id, patch);
          if (patch.imapQuarantine) {
            await this.store.log('imap_mailbox_quarantined', { accountId: account.id, reasonCode: patch.imapQuarantine.reasonCode, authFailures: patch.imapAuthFailures });
          }
          await this.store.log('imap_reply_poll_error', { accountId: account.id, errorClass: sanitizedErrorClass(error), reasonCode: failure.reasonCode });
        } catch {
          // A failing store must not stop the remaining accounts; there is nothing safer to write.
        }
      }
    }
    return matched;
  }
}
