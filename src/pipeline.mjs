import { id, now, normalizeDomain } from './utils.mjs';
import { crawlSiteBrowser } from './browser-crawler.mjs';
import { deterministicAudit, scoreProspect, chooseIssue } from './audit-rules.mjs';
import { enhanceAudit, classifyReply } from './ai.mjs';
import { discoverContacts, verifyEmail } from './contacts.mjs';
import { buildMessage, buildSubject, routeInbox } from './copy.mjs';
import { buildDossier } from './dossier.mjs';
import { sendEmail, listMessages, getMessage, parseGmailMessage, sealTokens } from './gmail.mjs';
import { ConflictError } from './store.mjs';
import { persistCrawlArtifacts } from './artifacts.mjs';
import { evaluateSendEligibility, sendIdempotencyKey, classifyDeliverySignal } from './send-safety.mjs';
import { unsubscribeUrl, oneClickUnsubscribeUrl } from './unsubscribe.mjs';

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
  }

  async isSuppressed(prospect, email = '') {
    const domain = normalizeDomain(prospect.website);
    const normalizedEmail = String(email).toLowerCase();
    const suppressions = await this.store.list('suppressions');
    return suppressions.some(item => item.value === normalizedEmail || item.value === domain);
  }

  async campaignFor(prospect) {
    return this.store.get('campaigns', prospect.campaignId);
  }

  async processProspect(prospect) {
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
      htmlFetcher: this.cfg.allowLocalFixtures
        ? async url => {
            const response = await fetch(url, { headers: { 'user-agent': 'UberBondRevenueEngine/1.3' } });
            return { status: response.status, finalUrl: response.url, html: await response.text() };
          }
        : null
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

    const contacts = await discoverContacts(prospect, crawl, this.cfg.hunterKey);
    let contact = contacts.selected;
    if (contact?.email && this.cfg.hunterKey && contact.verified === 'unverified') {
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
    const researchQualified = Boolean(issue && score.total >= campaign.minScore);
    const suppressed = contact?.email ? await this.isSuppressed(prospect, contact.email) : false;
    const sendEligible = Boolean(
      researchQualified && contact?.email &&
      ['valid', 'accept_all', 'unverified', 'unknown'].includes(contact.verified || 'unverified') &&
      !suppressed
    );
    const optoutUrl = contact?.email ? unsubscribeUrl(this.cfg.baseUrl, prospect.id, this.cfg.unsubscribeSecret) : '';
    const oneClickOptoutUrl = contact?.email ? oneClickUnsubscribeUrl(this.cfg.baseUrl, prospect.id, this.cfg.unsubscribeSecret) : '';
    const draft = researchQualified ? buildMessage({ prospect, issue, contact, sender: this.cfg.sender, unsubscribeUrl: optoutUrl }) : '';
    const subject = researchQualified ? buildSubject(prospect, issue) : '';
    const status = researchQualified ? (sendEligible ? 'ready' : 'research-complete') : 'rejected';
    const dossier = buildDossier({ prospect, crawl, audit, contact, score, issue, inbox, subject, draft, aiMeta });
    const patch = { status, crawl, audit, contacts, contact, score, issue, inbox, draft, subject, unsubscribeUrl: optoutUrl, oneClickUnsubscribeUrl: oneClickOptoutUrl, dossier, completedAt: now() };

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
    const eligibility = evaluateSendEligibility({ prospect: candidate, campaign, cfg: this.cfg, date: this.clock(), followup });
    if (!eligibility.ok) return this.markSendSafety(prospect, { sent: false, ...eligibility });

    const account = await this.store.findOne('accounts', { slot: prospect.inbox });
    if (!account?.connected) return this.markSendSafety(prospect, { sent: false, reason: 'needs-gmail' });

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
    let result;
    try {
      result = await this.sendEmailFn(this.cfg.google, account, this.cfg.encryptionKey, {
        from: `${this.cfg.sender.name} <${account.email}>`, to: prospect.contact.email, subject, body,
        threadId: followup ? prospect.threadId : undefined,
        replyToId: followup ? prospect.rfcMessageId : undefined,
        listUnsubscribe: prospect.oneClickUnsubscribeUrl
      });
    } catch (error) {
      await this.store.markOutboundReservation(reservation.id, 'uncertain', { error: String(error.message || error).slice(0, 1000) });
      const health = await this.store.recordOutboundEvent({
        inbox: prospect.inbox, eventType: 'send_uncertain', prospectId: prospect.id,
        recipientEmail: prospect.contact.email, detail: { reservationId: reservation.id, error: error.message }
      }, this.outboundThresholds());
      await this.store.patch('prospects', prospect.id, {
        status: 'send-uncertain', nextFollowupAt: null,
        sendSafety: { sent: false, reason: 'provider-result-uncertain', reservationId: reservation.id, senderPaused: Boolean(health?.paused), checkedAt: now() }
      });
      await this.store.log('outbound_send_uncertain', { prospectId: prospect.id, reservationId: reservation.id, error: error.message });
      return { sent: false, uncertain: true, reservation, health };
    }

    if (result.tokens) {
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
      console.warn('[pipeline] could not fetch RFC message-id after send:', error?.message || error);
    }

    const sentAt = now();
    await this.store.markOutboundReservation(reservation.id, 'sent', {
      sentAt, gmailId: result.data.id, threadId: result.data.threadId, rfcMessageId
    });
    await this.store.recordOutboundEvent({
      inbox: prospect.inbox, eventType: 'sent', prospectId: prospect.id,
      recipientEmail: prospect.contact.email, detail: { reservationId: reservation.id, followup }
    }, this.outboundThresholds());

    const message = {
      id: `msg_${reservation.id}`, prospectId: prospect.id, campaignId: campaign.id, inbox: prospect.inbox,
      to: prospect.contact.email, subject, gmailId: result.data.id, threadId: result.data.threadId,
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

  async processOutboundQueue(limit = this.cfg.outbound?.processBatchSize || 10) {
    let attempted = 0;
    let sent = 0;
    const candidates = (await this.store.list('prospects'))
      .filter(prospect => ['ready', 'research-complete'].includes(prospect.status) && !prospect.repliedAt)
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
      const body = buildMessage({ prospect, issue: prospect.issue, contact: prospect.contact, sender: this.cfg.sender, followup, unsubscribeUrl: prospect.unsubscribeUrl });
      const subject = buildSubject(prospect, prospect.issue, followup);
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
