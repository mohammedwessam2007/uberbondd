import crypto from 'node:crypto';
import { id, now, normalizeDomain, isEmail } from './utils.mjs';
import {
  PaymentStateError,
  checkoutForOffer,
  createOfferRecord,
  normalizeLemonEvent,
  transitionOfferRecord,
  validateLemonPaymentEvent,
  verifyLemonSignature
} from './payments.mjs';
import {
  DeliveryError,
  createDeliveryRecord,
  deliverySummary,
  reconcileDeliveryPayment,
  updateDeliveryRecord
} from './delivery.mjs';
import { sendEmail, sealTokens } from './gmail.mjs';
import { encryptJson, decryptJson } from './crypto.mjs';
import { ConflictError } from './store.mjs';
import { parsePublicUrl, safeErrorDetails } from './security.mjs';

const DAY = 86400000;
const sha = value => crypto.createHash('sha256').update(String(value)).digest('hex');
const validKey = key => /^[a-f0-9]{64}$/i.test(key || '');

function protectToken(token, key) {
  return validKey(key) ? { encrypted: true, value: encryptJson({ token }, key) } : null;
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
    const websiteInput = cleanText(input.website, 500);
    const email = cleanText(input.email, 240).toLowerCase();
    if (!company || !websiteInput || !isEmail(email)) throw new Error('Company, website, and a valid email are required');
    const website = parsePublicUrl(websiteInput, {
      allowLocal: this.cfg.allowLocalFixtures === true && this.cfg.nodeEnv !== 'production'
    }).href;
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
      if (this.hooks.enqueueResearch) this.hooks.enqueueResearch({ limit: 1, reason: 'public-audit', leadId: lead.id }).catch(error => console.error('[revenue] research enqueue failed', safeErrorDetails(error)));
      else if (!this.pipeline.running && !this.pipeline.paused) this.pipeline.runBatch(1).catch(error => console.error('[revenue] background batch run failed', safeErrorDetails(error)));
    }, 50);
    return { leadId: lead.id, accessToken, statusUrl: `${this.cfg.baseUrl}/report.html#token=${encodeURIComponent(accessToken)}` };
  }

  async leadByToken(token) {
    return this.store.findOne('leads', { accessTokenHash: sha(token || '') });
  }

  tokenForLead(lead) { return revealToken(lead?.accessTokenSecret, this.cfg.encryptionKey); }

  async offersForProspect(prospectId) {
    return (await this.store.list('offers')).filter(offer => offer.prospectId === prospectId);
  }

  async createOffer(prospectId, input = {}) {
    const prospect = await this.store.get('prospects', prospectId);
    if (!prospect) throw new PaymentStateError('prospect-not-found');
    const campaign = await this.store.get('campaigns', prospect.campaignId);
    if (!campaign) throw new PaymentStateError('campaign-not-found');
    const record = createOfferRecord({
      id: id('offer'),
      campaignId: campaign.id,
      prospectId: prospect.id,
      leadId: prospect.leadId || null,
      type: input.type,
      name: input.name,
      scope: input.scope,
      exclusions: input.exclusions,
      amountCents: input.amountCents,
      currency: input.currency,
      provider: input.provider || 'test',
      providerMode: input.providerMode,
      checkoutKey: input.checkoutKey,
      issue: prospect.issue
    });
    await this.store.add('offers', record);
    await this.store.log('offer_created', { offerId: record.id, prospectId, type: record.type, provider: record.provider, providerMode: record.providerMode });
    return record;
  }

  async approveOffer(offerId) {
    const offer = await this.store.get('offers', offerId);
    if (!offer) throw new PaymentStateError('offer-not-found');
    const approved = transitionOfferRecord(offer, 'approved', { source: 'owner-approval', reference: offer.id });
    await this.store.upsert('offers', approved);
    await this.store.log('offer_approved', { offerId, prospectId: offer.prospectId, amountCents: offer.amountCents, currency: offer.currency });
    return approved;
  }

  async issueCheckout(offerId) {
    const offer = await this.store.get('offers', offerId);
    if (!offer) throw new PaymentStateError('offer-not-found');
    const checkout = checkoutForOffer(offer, this.cfg.revenue);
    if (offer.provider === 'lemonsqueezy' && !this.cfg.revenue.lemonWebhookSecret) throw new PaymentStateError('payment-webhook-not-configured');
    if (!checkout.configured) throw new PaymentStateError('checkout-provider-not-configured');
    const issuedAt = now();
    const issued = transitionOfferRecord(offer, 'checkout-sent', { source: 'owner-checkout', reference: offer.id, at: issuedAt });
    await this.store.upsert('offers', issued);
    const providerEventId = `owner-checkout:${offer.id}`;
    try {
      await this.store.add('orders', {
        id: id('order'), provider: offer.provider, providerEventId, eventName: 'checkout_sent',
        offerId: offer.id, leadId: offer.leadId || null, prospectId: offer.prospectId,
        product: offer.type, amountCents: offer.amountCents, currency: offer.currency,
        status: 'checkout-sent', paymentState: 'checkout-sent', testMode: offer.providerMode === 'test',
        verificationSource: 'owner-checkout', processingStatus: 'completed', occurredAt: issuedAt,
        createdAt: issuedAt, processedAt: issuedAt
      });
    } catch (error) {
      if (!(error instanceof ConflictError)) throw error;
    }
    await this.store.patch('prospects', offer.prospectId, { paymentStatus: 'checkout-sent', checkoutSentAt: issuedAt });
    if (offer.leadId) await this.store.patch('leads', offer.leadId, { paymentStatus: 'checkout-sent', checkoutSentAt: issuedAt });
    await this.store.log('checkout_issued', { offerId, prospectId: offer.prospectId, provider: offer.provider, providerMode: offer.providerMode });
    return { offer: issued, checkout };
  }

  async checkoutForLeadOffer(lead, offerId) {
    const offer = await this.store.get('offers', offerId);
    if (!offer || offer.leadId !== lead.id || offer.prospectId !== lead.prospectId) throw new PaymentStateError('offer-not-found');
    if (offer.paymentState !== 'checkout-sent') throw new PaymentStateError('checkout-not-issued');
    if (offer.provider === 'test' || offer.providerMode === 'test') throw new PaymentStateError('test-checkout-private');
    const checkout = checkoutForOffer(offer, this.cfg.revenue);
    if (!checkout.configured || !checkout.url) throw new PaymentStateError('checkout-provider-not-configured');
    return { offerId: offer.id, amountCents: offer.amountCents, currency: offer.currency, provider: checkout.provider, mode: checkout.mode, url: checkout.url };
  }

  async publicReport(token) {
    const lead = await this.leadByToken(token);
    if (!lead) return null;
    const prospect = await this.store.get('prospects', lead.prospectId);
    if (!prospect) return null;
    const storedOffers = await this.offersForProspect(prospect.id);
    const full = storedOffers.some(offer => offer.paymentState === 'paid') || (!storedOffers.length && lead.paymentStatus === 'paid');
    const audit = Array.isArray(prospect.audit) ? prospect.audit : [];
    const visible = full ? audit : audit.slice(0, Math.max(1, this.cfg.revenue.freeFindings));
    const screenshots = (prospect.dossier?.screenshots || []).slice(0, full ? 8 : 1);
    const offers = storedOffers
      .filter(offer => offer.ownerApproval?.status === 'approved' && offer.providerMode !== 'test' && offer.paymentState !== 'draft')
      .map(offer => {
        let checkoutAvailable = false;
        if (offer.paymentState === 'checkout-sent' && offer.provider === 'lemonsqueezy') {
          try { checkoutAvailable = Boolean(checkoutForOffer(offer, this.cfg.revenue).url); } catch { checkoutAvailable = false; }
        }
        return {
          id: offer.id, type: offer.type, name: offer.name, scope: offer.scope,
          exclusions: offer.exclusions, amountCents: offer.amountCents, currency: offer.currency,
          status: offer.paymentState, recurring: offer.recurring, checkoutAvailable,
          issueTitle: offer.issue?.title || ''
        };
      });
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
      offers
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
    const reportUrl = `${this.cfg.baseUrl}/report.html#token=${encodeURIComponent(token)}`;
    const body = `Hi,\n\nYour UberBond Digital Opportunity Snapshot for ${lead.company} is ready.\n\nScore: ${prospect.score?.total ?? 'ready'}\nView the report: ${reportUrl}\n\nThe free snapshot includes the primary evidence-backed opportunity. Any commercial offer appears only after the owner reviews and approves its exact scope and price.\n\nUberBond`;
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

  async deliveriesForProspect(prospectId) {
    return (await this.store.list('deliveries'))
      .filter(delivery => delivery.prospectId === prospectId)
      .sort((left, right) => (Date.parse(right.createdAt || '') || 0) - (Date.parse(left.createdAt || '') || 0));
  }

  async syncDeliverySummary(delivery) {
    const summary = deliverySummary(delivery);
    const lifecycle = delivery.status === 'delivered' ? 'delivered'
      : ['delivery-queued', 'awaiting-inputs', 'ready', 'in-progress', 'ready-for-review', 'on-hold'].includes(delivery.status) ? 'delivery-queued'
        : '';
    const patch = {
      delivery: summary,
      deliveryStatus: delivery.status,
      deliveryMode: delivery.testMode ? 'test' : 'owner',
      ...(lifecycle ? { acquisitionStatus: lifecycle } : {})
    };
    await this.store.patch('prospects', delivery.prospectId, patch);
    if (delivery.leadId) await this.store.patch('leads', delivery.leadId, patch);
    return delivery;
  }

  async ensureDeliveryTask(delivery, at = delivery.createdAt || now()) {
    const task = {
      id: `delivery-task:${delivery.id}`,
      type: 'delivery_task',
      leadId: delivery.leadId || null,
      prospectId: delivery.prospectId,
      offerId: delivery.offerId,
      deliveryId: delivery.id,
      title: delivery.ownerTask.title,
      status: 'unread',
      createdAt: at
    };
    try { await this.store.add('notifications', task); }
    catch (error) { if (!(error instanceof ConflictError)) throw error; }
  }

  async ensurePaidDelivery(offer, order, at = order.occurredAt || now()) {
    let delivery = await this.store.findOne('deliveries', { orderId: order.id });
    if (delivery) {
      await this.ensureDeliveryTask(delivery, at);
      return this.syncDeliverySummary(delivery);
    }
    const previous = (await this.deliveriesForProspect(offer.prospectId)).find(item =>
      item.offerId === offer.id
      && item.status === 'on-hold'
      && item.holdReason === 'payment-disputed'
      && item.payment?.providerReference === order.providerReference
    );
    if (previous) {
      delivery = reconcileDeliveryPayment(previous, 'paid', order, at);
      await this.store.upsert('deliveries', delivery);
      await this.ensureDeliveryTask(delivery, at);
      return this.syncDeliverySummary(delivery);
    }
    const prospect = await this.store.get('prospects', offer.prospectId);
    const lead = offer.leadId ? await this.store.get('leads', offer.leadId) : null;
    delivery = createDeliveryRecord({ offer, order, prospect, lead }, at);
    let created = false;
    try {
      delivery = await this.store.add('deliveries', delivery);
      created = true;
    } catch (error) {
      if (!(error instanceof ConflictError)) throw error;
      delivery = await this.store.findOne('deliveries', { orderId: order.id });
      if (!delivery) throw error;
    }
    await this.ensureDeliveryTask(delivery, at);
    await this.syncDeliverySummary(delivery);
    if (created) await this.store.log('delivery_created', { deliveryId: delivery.id, offerId: offer.id, orderId: order.id, testMode: delivery.testMode });
    return delivery;
  }

  async reconcileDeliveryForPayment(offer, order, state, at = order.occurredAt || now()) {
    if (state === 'paid') return this.ensurePaidDelivery(offer, order, at);
    const deliveries = (await this.deliveriesForProspect(offer.prospectId)).filter(item => item.offerId === offer.id);
    let delivery = deliveries.find(item => item.payment?.providerReference === order.providerReference && item.status !== 'cancelled');
    if (!delivery) delivery = deliveries.find(item => item.status !== 'cancelled') || deliveries[0] || null;
    if (!delivery) return null;
    delivery = reconcileDeliveryPayment(delivery, state, order, at);
    await this.store.upsert('deliveries', delivery);
    await this.syncDeliverySummary(delivery);
    await this.store.log('delivery_payment_reconciled', { deliveryId: delivery.id, offerId: offer.id, orderId: order.id, paymentState: state });
    return delivery;
  }

  async updateDelivery(deliveryId, input = {}) {
    const delivery = await this.store.get('deliveries', deliveryId);
    if (!delivery) throw new DeliveryError('delivery-not-found');
    const updated = updateDeliveryRecord(delivery, input, now());
    await this.store.upsert('deliveries', updated);
    await this.syncDeliverySummary(updated);
    if (updated.status === 'delivered' && ['requested', 'in-progress'].includes(updated.revision.status)) {
      await this.store.patch('notifications', `delivery-task:${updated.id}`, { status: 'unread', title: `Revision ${updated.revision.status}: ${updated.customer.name}` });
    } else if (updated.status === 'delivered') {
      await this.store.patch('notifications', `delivery-task:${updated.id}`, { status: 'read', completedAt: updated.proofOfDelivery.deliveredAt });
    }
    await this.store.log('delivery_updated', {
      deliveryId: updated.id,
      prospectId: updated.prospectId,
      status: updated.status,
      revisionStatus: updated.revision.status,
      proofCount: updated.proofOfDelivery.references.length
    });
    return updated;
  }

  async applyOfferPayment(offerId, payment = {}) {
    let offer = await this.store.get('offers', offerId);
    if (!offer) throw new PaymentStateError('offer-not-found');
    const provider = cleanText(payment.provider, 40).toLowerCase();
    const source = cleanText(payment.source, 60);
    if (provider !== offer.provider) throw new PaymentStateError('payment-provider-mismatch');
    const allowedSources = {
      test: new Set(['test-simulation']),
      manual: new Set(['manual-owner']),
      lemonsqueezy: new Set(['verified-webhook'])
    };
    if (!allowedSources[provider]?.has(source)) throw new PaymentStateError('payment-provider-source-mismatch');
    if (Boolean(payment.testMode) !== (offer.providerMode === 'test')) throw new PaymentStateError('payment-mode-mismatch');
    if (!['paid', 'refunded', 'disputed', 'cancelled'].includes(payment.state)) throw new PaymentStateError('payment-state-invalid');
    const providerEventId = cleanText(payment.providerEventId, 240);
    if (!providerEventId) throw new PaymentStateError('payment-event-id-required');
    const assertEventIdentity = existing => {
      if (!existing) return;
      if (existing.offerId !== offer.id || existing.provider !== provider || existing.paymentState !== payment.state || Boolean(existing.testMode) !== Boolean(payment.testMode)) {
        throw new PaymentStateError('payment-event-identity-conflict');
      }
    };
    let order = await this.store.findOne('orders', { providerEventId });
    assertEventIdentity(order);
    const occurredAt = payment.occurredAt || order?.occurredAt || now();
    if (order?.processingStatus === 'completed') {
      const delivery = offer.paymentState === payment.state ? await this.reconcileDeliveryForPayment(offer, order, payment.state, occurredAt) : null;
      return { duplicate: true, offer, order, delivery };
    }
    if (!order) {
      order = {
        id: id('order'), provider, providerEventId, eventName: payment.eventName,
        offerId: offer.id, leadId: offer.leadId || null, prospectId: offer.prospectId,
        product: offer.type, amountCents: offer.amountCents, currency: offer.currency,
        status: payment.state, paymentState: payment.state, testMode: payment.testMode === true,
        providerReference: cleanText(payment.providerReference, 240),
        verificationSource: payment.source, verified: true, processingStatus: 'processing',
        occurredAt, createdAt: now()
      };
      try { await this.store.add('orders', order); }
      catch (error) {
        if (!(error instanceof ConflictError)) throw error;
        order = await this.store.findOne('orders', { providerEventId });
        assertEventIdentity(order);
        if (order?.processingStatus === 'completed') {
          const delivery = offer.paymentState === payment.state ? await this.reconcileDeliveryForPayment(offer, order, payment.state, occurredAt) : null;
          return { duplicate: true, offer, order, delivery };
        }
      }
    }

    const transitioned = transitionOfferRecord(offer, payment.state, {
      source: payment.source, reference: payment.providerReference || providerEventId, at: occurredAt
    });
    await this.store.upsert('offers', transitioned);
    offer = transitioned;
    const hasPaidOffer = (await this.offersForProspect(offer.prospectId)).some(item => item.paymentState === 'paid');
    const aggregatePaymentStatus = hasPaidOffer ? 'paid' : payment.state;
    const terminalPatch = {
      paymentStatus: aggregatePaymentStatus,
      paymentOfferId: offer.id,
      paymentProvider: provider,
      nextFollowupAt: null,
      acquisitionStatus: aggregatePaymentStatus,
      ...(payment.state === 'paid' ? { paidAt: occurredAt } : {}),
      ...(payment.state === 'refunded' ? { refundedAt: occurredAt } : {}),
      ...(payment.state === 'disputed' ? { disputedAt: occurredAt } : {}),
      ...(payment.state === 'cancelled' ? { paymentCancelledAt: occurredAt } : {})
    };
    await this.store.patch('prospects', offer.prospectId, terminalPatch);
    const lead = offer.leadId ? await this.store.get('leads', offer.leadId) : null;
    if (lead) await this.store.patch('leads', lead.id, { ...terminalPatch, plan: offer.type });

    if (['paid', 'refunded'].includes(payment.state)) {
      const signedAmount = payment.state === 'paid' ? offer.amountCents : -offer.amountCents;
      try {
        await this.store.add('revenueEvents', {
          id: id('rev'), providerEventId: `revenue:${providerEventId}`, offerId: offer.id,
          leadId: offer.leadId || null, prospectId: offer.prospectId, product: offer.type,
          kind: payment.state === 'paid' ? (offer.recurring ? 'subscription' : 'sale') : 'refund',
          amountCents: signedAmount, currency: offer.currency, createdAt: occurredAt
        });
      } catch (error) {
        if (!(error instanceof ConflictError)) throw error;
      }
    }
    if (payment.state === 'paid' && offer.type === 'monitoring' && lead) {
      await this.activateSubscription(lead, {
        provider, providerId: payment.providerReference || providerEventId,
        amountCents: offer.amountCents, currency: offer.currency, status: 'active'
      });
    }
    if (['refunded', 'cancelled'].includes(payment.state) && offer.type === 'monitoring') {
      const subscription = (await this.store.list('subscriptions')).find(item => item.prospectId === offer.prospectId && item.status !== 'expired');
      if (subscription) await this.store.patch('subscriptions', subscription.id, { status: payment.state, nextRunAt: null });
    }
    const delivery = await this.reconcileDeliveryForPayment(offer, order, payment.state, occurredAt);
    const notifications = await this.store.list('notifications');
    if (!notifications.some(item => item.paymentEventId === providerEventId)) {
      await this.store.add('notifications', {
        id: id('note'), type: 'payment', leadId: offer.leadId || null, prospectId: offer.prospectId,
        offerId: offer.id, paymentEventId: providerEventId,
        title: `Payment ${payment.state}: ${lead?.company || 'Prospect'} · ${offer.type}`,
        status: 'unread', createdAt: occurredAt
      });
    }
    order = await this.store.patch('orders', order.id, { processingStatus: 'completed', processedAt: now() });
    return { duplicate: false, offer, order, delivery };
  }

  async confirmManualPayment(offerId, input = {}) {
    const offer = await this.store.get('offers', offerId);
    if (!offer || offer.provider !== 'manual') throw new PaymentStateError('manual-offer-required');
    if (offer.paymentState !== 'checkout-sent') throw new PaymentStateError('checkout-not-issued');
    const reference = cleanText(input.confirmationReference, 240);
    if (reference.length < 6) throw new PaymentStateError('manual-confirmation-reference-required');
    if (Number(input.amountCents) !== offer.amountCents || String(input.currency || '').toUpperCase() !== offer.currency) {
      throw new PaymentStateError('manual-payment-mismatch');
    }
    return this.applyOfferPayment(offer.id, {
      provider: 'manual', providerEventId: `manual:${offer.id}:${sha(reference)}`,
      providerReference: reference, eventName: 'owner_confirmed_manual_payment', state: 'paid',
      source: 'manual-owner', testMode: false, occurredAt: now()
    });
  }

  async simulateOfferPayment(offerId, eventId = id('test')) {
    if (!this.cfg.revenue.allowTestUnlock) throw new PaymentStateError('test-payment-disabled');
    const offer = await this.store.get('offers', offerId);
    if (!offer || offer.provider !== 'test' || offer.providerMode !== 'test') throw new PaymentStateError('test-offer-required');
    if (offer.paymentState !== 'checkout-sent') throw new PaymentStateError('checkout-not-issued');
    return this.applyOfferPayment(offer.id, {
      provider: 'test', providerEventId: `test:${eventId}`, providerReference: eventId,
      eventName: 'simulated_verified_payment', state: 'paid', source: 'test-simulation',
      testMode: true, occurredAt: now()
    });
  }

  async unlockLead(leadId, product = 'full', detail = {}) {
    if (!this.cfg.revenue.allowTestUnlock || detail.provider !== 'test') throw new PaymentStateError('test-payment-disabled');
    const lead = await this.store.get('leads', leadId);
    if (!lead) throw new PaymentStateError('lead-not-found');
    const prospect = await this.store.get('prospects', lead.prospectId);
    if (!prospect?.issue) throw new PaymentStateError('offer-evidence-required');
    const type = product === 'monitoring' ? 'monitoring' : 'diagnostic';
    let offer = (await this.offersForProspect(prospect.id)).find(item => item.type === type && item.provider === 'test');
    if (!offer) {
      offer = await this.createOffer(prospect.id, {
        type, name: product === 'strategy' ? 'Strategy diagnostic' : undefined,
        scope: `Provide the approved ${product} deliverable for: ${prospect.issue.title}`,
        exclusions: ['Third-party fees', 'Unapproved implementation work'],
        amountCents: Number(detail.amountCents || ({ full: this.cfg.revenue.fullAuditPrice, strategy: this.cfg.revenue.strategyAuditPrice, monitoring: this.cfg.revenue.monitoringPrice }[product] || 0) * 100),
        currency: detail.currency || 'USD', provider: 'test', checkoutKey: product
      });
    }
    if (offer.paymentState === 'draft') offer = await this.approveOffer(offer.id);
    if (offer.paymentState === 'approved') offer = (await this.issueCheckout(offer.id)).offer;
    await this.simulateOfferPayment(offer.id, detail.eventId || id('test'));
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
    if (!verifyLemonSignature(rawBody, signature, this.cfg.revenue.lemonWebhookSecret)) throw new PaymentStateError('invalid-webhook-signature');
    let payload;
    try { payload = JSON.parse(rawBody); }
    catch { throw new PaymentStateError('invalid-webhook-payload'); }
    const event = normalizeLemonEvent(payload);
    const offer = await this.store.get('offers', String(event.custom?.offer_id || ''));
    if (!offer) throw new PaymentStateError('offer-not-found');
    const validated = validateLemonPaymentEvent(event, offer);
    const applied = await this.applyOfferPayment(offer.id, {
      provider: 'lemonsqueezy', providerEventId: validated.providerEventId,
      providerReference: event.eventId, eventName: event.eventName, state: validated.state,
      source: 'verified-webhook', testMode: event.testMode, occurredAt: event.createdAt
    });
    return {
      ok: true,
      duplicate: applied.duplicate,
      event: { eventName: event.eventName, eventId: event.eventId, paymentState: validated.state, testMode: event.testMode }
    };
  }

  async reconcilePendingPayments(limit = 10) {
    const maximum = Math.max(1, Math.min(20, Number(limit || 10)));
    const pending = (await this.store.list('orders'))
      .filter(order => order.verified === true && order.processingStatus === 'processing')
      .slice(0, maximum);
    let recovered = 0;
    let failed = 0;
    for (const order of pending) {
      try {
        await this.applyOfferPayment(order.offerId, {
          provider: order.provider,
          providerEventId: order.providerEventId,
          providerReference: order.providerReference,
          eventName: order.eventName,
          state: order.paymentState || order.status,
          source: order.verificationSource,
          testMode: order.testMode === true,
          occurredAt: order.occurredAt
        });
        recovered += 1;
      } catch (error) {
        failed += 1;
        await this.store.log('payment_reconciliation_deferred', {
          orderId: order.id,
          code: String(error?.code || error?.name || 'payment-reconciliation-failed').slice(0, 80)
        });
      }
    }
    if (failed) {
      const error = new Error(`Payment reconciliation deferred ${failed} record${failed === 1 ? '' : 's'}`);
      error.code = 'PAYMENT_RECONCILIATION_DEFERRED';
      error.retryable = true;
      error.result = { considered: pending.length, recovered, failed };
      throw error;
    }
    return { considered: pending.length, recovered, failed: 0 };
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
      targetProgress: Math.max(0, Math.min(100, Math.round((todayCents / 100) / 200 * 100))),
      notifications: notifications.filter(notification => notification.status !== 'read').length
    };
  }
}
