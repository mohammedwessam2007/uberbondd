import crypto from 'node:crypto';
import { id, now, normalizeDomain, isEmail } from './utils.mjs';
import { checkoutUrl, normalizeLemonEvent, verifyLemonSignature } from './payments.mjs';
import { sendEmail, sealTokens } from './gmail.mjs';
import { encryptJson, decryptJson } from './crypto.mjs';
import { ConflictError } from './store.mjs';

const DAY = 86400000;
const sha = value => crypto.createHash('sha256').update(String(value)).digest('hex');
const validKey = key => /^[a-f0-9]{64}$/i.test(key || '');

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

export class RevenueEngine {
  constructor(store, cfg, pipeline, hooks = {}) {
    this.store = store;
    this.cfg = cfg;
    this.pipeline = pipeline;
    this.hooks = hooks;
    this.publicHits = new Map();
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
    if (ready && this.cfg.revenue.autoEmailReports && !lead.reportEmailSentAt) await this.sendReportEmail(lead, prospect);
  }

  async sendReportEmail(lead, prospect) {
    const account = await this.store.findOne('accounts', { slot: this.cfg.revenue.reportDeliveryInbox });
    if (!account?.connected) return false;
    const token = this.tokenForLead(lead);
    if (!token) return false;
    const reportUrl = `${this.cfg.baseUrl}/report.html?token=${encodeURIComponent(token)}`;
    const body = `Hi,\n\nYour UberBond Digital Opportunity Snapshot for ${lead.company} is ready.\n\nScore: ${prospect.score?.total ?? 'ready'}\nView the report: ${reportUrl}\n\nThe free snapshot includes the primary evidence-backed opportunity. The report page also contains options for a full audit, strategy review, and recurring monitoring.\n\nUberBond`;
    const result = await sendEmail(this.cfg.google, account, this.cfg.encryptionKey, {
      from: `${this.cfg.sender.name} <${account.email}>`, to: lead.email,
      subject: `${lead.company} digital opportunity report`, body
    });
    if (result.tokens) {
      account.tokens = sealTokens(result.tokens, this.cfg.encryptionKey);
      await this.store.upsert('accounts', account);
    }
    await this.store.patch('leads', lead.id, { reportEmailSentAt: now() });
    await this.store.add('messages', {
      id: id('msg'), kind: 'transactional-report', leadId: lead.id, prospectId: prospect.id,
      inbox: account.slot, to: lead.email, subject: `${lead.company} digital opportunity report`,
      gmailId: result.data.id, threadId: result.data.threadId, sentAt: now()
    });
    return true;
  }

  async unlockLead(leadId, product = 'full', detail = {}) {
    const lead = await this.store.get('leads', leadId);
    if (!lead) throw new Error('Lead not found');
    await this.store.patch('leads', lead.id, {
      paymentStatus: 'paid', plan: product, paidAt: now(), provider: detail.provider || 'manual'
    });
    const amount = Number(detail.amountCents || ({
      full: this.cfg.revenue.fullAuditPrice,
      strategy: this.cfg.revenue.strategyAuditPrice,
      monitoring: this.cfg.revenue.monitoringPrice
    }[product] || 0) * 100);
    const eventId = detail.eventId || id('rev');
    try {
      await this.store.add('revenueEvents', {
        id: id('rev'), providerEventId: eventId, leadId: lead.id, prospectId: lead.prospectId,
        product, kind: product === 'monitoring' ? 'subscription' : 'sale', amountCents: amount,
        currency: detail.currency || 'USD', createdAt: now()
      });
    } catch (error) {
      if (!(error instanceof ConflictError)) throw error;
    }
    if (product === 'monitoring') await this.activateSubscription(lead, detail);
    await this.store.add('notifications', {
      id: id('note'), type: 'payment', leadId: lead.id, prospectId: lead.prospectId,
      title: `Payment received: ${lead.company} · ${product}`, status: 'unread', createdAt: now()
    });
    return this.store.get('leads', lead.id);
  }

  async activateSubscription(lead, detail = {}) {
    const subscriptions = await this.store.list('subscriptions');
    let subscription = subscriptions.find(item =>
      item.leadId === lead.id && item.provider === (detail.provider || 'lemonsqueezy') && item.status !== 'expired'
    );
    const nextRunAt = new Date(Date.now() + this.cfg.revenue.monitoringIntervalDays * DAY).toISOString();
    if (subscription) {
      await this.store.patch('subscriptions', subscription.id, {
        providerId: String(detail.providerId || subscription.providerId || ''), status: detail.status || 'active',
        amountCents: Number(detail.amountCents || subscription.amountCents || this.cfg.revenue.monitoringPrice * 100),
        currency: detail.currency || subscription.currency || 'USD', nextRunAt
      });
      return this.store.get('subscriptions', subscription.id);
    }
    subscription = {
      id: id('sub'), leadId: lead.id, prospectId: lead.prospectId,
      provider: detail.provider || 'lemonsqueezy', providerId: String(detail.providerId || ''),
      status: detail.status || 'active', amountCents: Number(detail.amountCents || this.cfg.revenue.monitoringPrice * 100),
      currency: detail.currency || 'USD', intervalDays: this.cfg.revenue.monitoringIntervalDays,
      nextRunAt, createdAt: now()
    };
    await this.store.add('subscriptions', subscription);
    return subscription;
  }

  async handleLemonWebhook(rawBody, signature) {
    if (!verifyLemonSignature(rawBody, signature, this.cfg.revenue.lemonWebhookSecret)) throw new Error('Invalid webhook signature');
    const payload = JSON.parse(rawBody);
    const event = normalizeLemonEvent(payload);
    try {
      await this.store.add('orders', {
        id: id('order'), provider: 'lemonsqueezy', providerEventId: event.eventId,
        eventName: event.eventName, leadId: event.custom.lead_id || '', prospectId: event.custom.prospect_id || '',
        product: event.custom.product || '', amountCents: event.amountCents, currency: event.currency,
        status: event.status, testMode: event.testMode, createdAt: now(), raw: payload
      });
    } catch (error) {
      if (error instanceof ConflictError) return { duplicate: true, event };
      throw error;
    }

    const leadId = event.custom.lead_id;
    const product = event.custom.product || 'full';
    if (leadId && ['order_created', 'subscription_created', 'subscription_updated', 'subscription_resumed'].includes(event.eventName)) {
      await this.unlockLead(leadId, product, {
        provider: 'lemonsqueezy', providerId: event.eventId,
        eventId: `${event.eventName}:${event.eventId}`, amountCents: event.amountCents,
        currency: event.currency, status: event.status || 'active'
      });
    }
    if (leadId && ['subscription_cancelled', 'subscription_canceled', 'subscription_expired', 'subscription_paused'].includes(event.eventName)) {
      const subscription = (await this.store.list('subscriptions')).find(item => item.leadId === leadId);
      if (subscription) await this.store.patch('subscriptions', subscription.id, { status: event.eventName.replace('subscription_', ''), nextRunAt: null });
    }
    return { ok: true, event };
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
    const grossCents = events.reduce((sum, event) => sum + Number(event.amountCents || 0), 0);
    const mrrCents = subscriptions.reduce((sum, subscription) => sum + Number(subscription.amountCents || 0), 0);
    const today = new Date().toISOString().slice(0, 10);
    const todayCents = events.filter(event => event.createdAt?.startsWith(today)).reduce((sum, event) => sum + Number(event.amountCents || 0), 0);
    return {
      leads: leads.length,
      reportReady: leads.filter(lead => lead.status === 'report-ready').length,
      orders: orders.length,
      paidCustomers: leads.filter(lead => lead.paymentStatus === 'paid').length,
      activeSubscriptions: subscriptions.length,
      grossRevenue: grossCents / 100,
      mrr: mrrCents / 100,
      todayRevenue: todayCents / 100,
      dailyTarget: 200,
      targetProgress: Math.min(100, Math.round((todayCents / 100) / 200 * 100)),
      notifications: notifications.filter(notification => notification.status !== 'read').length
    };
  }
}
