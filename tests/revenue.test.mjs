import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import {Store} from '../src/store.mjs';
import {RevenueEngine} from '../src/revenue.mjs';
import {
  checkoutForOffer,
  checkoutUrl,
  createOfferRecord,
  transitionOfferRecord,
  verifyLemonSignature
} from '../src/payments.mjs';
import {
  createDeliveryRecord,
  reconcileDeliveryPayment,
  updateDeliveryRecord
} from '../src/delivery.mjs';

const cfg=dir=>({
  baseUrl:'https://audit.test',dataDir:dir,encryptionKey:'a'.repeat(64),
  revenue:{publicIntake:true,publicRateLimitPerHour:4,freeFindings:1,fullAuditPrice:49,strategyAuditPrice:299,monitoringPrice:99,implementationFrom:1000,bookingUrl:'',reportDeliveryInbox:'B',autoEmailReports:false,paymentProvider:'links',fullAuditCheckoutUrl:'https://shop.test/buy/full',strategyAuditCheckoutUrl:'https://shop.test/buy/strategy',monitoringCheckoutUrl:'https://shop.test/buy/watch',lemonWebhookSecret:'secret',allowTestUnlock:true,monitoringIntervalDays:30,monitoringBatchSize:10},
  google:{},sender:{name:'Mohamed'},
});

test('checkout custom data is encoded into hosted link',()=>{const u=new URL(checkoutUrl('https://shop.test/buy/abc',{lead_id:'lead 1',product:'full'}));assert.equal(u.searchParams.get('checkout[custom][lead_id]'),'lead 1');assert.equal(u.searchParams.get('checkout[custom][product]'),'full')});

test('Lemon Squeezy signature verification uses raw body HMAC',()=>{const raw='{"hello":"world"}',secret='secret';const sig=crypto.createHmac('sha256',secret).update(raw).digest('hex');assert.equal(verifyLemonSignature(raw,sig,secret),true);assert.equal(verifyLemonSignature(raw,'bad',secret),false)});

const finding = {
  title: 'Booking action is difficult to find', severity: 4, confidence: .9,
  evidenceUrl: 'https://example.com/appointments', evidenceExcerpt: 'Appointments are available by telephone.',
  implication: 'Visitors may abandon the booking path.', service: 'Conversion design'
};

async function auditedLead() {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'payment-state-'));
  const store = new Store(dir);
  await store.init();
  const engine = new RevenueEngine(store, cfg(dir), { running: true, paused: false, runBatch: async () => {} });
  const created = await engine.createLead({ company: 'Acme', website: 'https://example.com', email: 'owner@example.com', industry: 'SaaS', consent: true }, '1.2.3.4');
  const lead = await store.get('leads', created.leadId);
  await store.patch('prospects', lead.prospectId, {
    status: 'research-complete', score: { total: 72, tier: 'B' }, issue: finding,
    audit: [finding, { ...finding, title: 'Second issue', evidenceUrl: 'https://example.com/about' }],
    dossier: { screenshots: [], riskFlags: [] }, completedAt: new Date().toISOString()
  });
  await engine.onProspectComplete(await store.get('prospects', lead.prospectId));
  return { dir, store, engine, created, lead: await store.get('leads', lead.id), prospect: await store.get('prospects', lead.prospectId) };
}

test('offer records require campaign, evidence, bounded price, currency, scope, and explicit state transitions', () => {
  const offerInput = {
    id: 'offer-1', campaignId: 'campaign-1', prospectId: 'prospect-1', leadId: 'lead-1',
    type: 'diagnostic', scope: 'Deliver a complete evidence-backed diagnostic.', exclusions: ['Third-party fees'],
    amountCents: 4900, currency: 'USD', provider: 'test', checkoutKey: 'full', issue: finding
  };
  const offer = createOfferRecord(offerInput, '2026-07-18T10:00:00.000Z');
  assert.equal(offer.paymentState, 'draft');
  assert.match(offer.issueRef, /^[a-f0-9]{64}$/);
  assert.equal(offer.ownerApproval.status, 'pending');
  assert.throws(() => createOfferRecord({ ...offerInput, id: 'bad', amountCents: 0 }), /offer-amount-invalid/);
  assert.throws(() => createOfferRecord({ ...offerInput, id: 'bad', issue: {} }), /offer-evidence-required/);
  assert.throws(() => createOfferRecord({ ...offerInput, id: 'bad', currency: 'BTC' }), /offer-currency-invalid/);
  assert.throws(() => createOfferRecord({ ...offerInput, id: 'bad', discount: 50 }), /offer-unknown-field|offer-forbidden-field/);
  assert.throws(() => transitionOfferRecord(offer, 'paid', { source: 'frontend-redirect' }), /verified-payment-source-required/);
  const approved = transitionOfferRecord(offer, 'approved', { source: 'owner-approval', reference: 'owner' });
  assert.equal(approved.ownerApproval.status, 'approved');
  assert.equal(checkoutForOffer(approved, {}).mode, 'test');
  const issued = transitionOfferRecord(approved, 'checkout-sent', { source: 'owner-checkout', reference: 'owner' });
  assert.throws(() => transitionOfferRecord(issued, 'paid', { source: 'frontend-redirect' }), /verified-payment-source-required/);
  const paid = transitionOfferRecord(issued, 'paid', { source: 'test-simulation', reference: 'test-event' });
  assert.equal(paid.paymentState, 'paid');
  assert.equal(transitionOfferRecord(paid, 'refunded', { source: 'verified-webhook', reference: 'refund' }).paymentState, 'refunded');
  assert.throws(() => transitionOfferRecord(paid, 'paid', { source: 'frontend-redirect' }), /verified-payment-source-required/);

  const monitoring = createOfferRecord({
    ...offerInput, id: 'offer-monitoring', type: 'monitoring', checkoutKey: 'monitoring',
    provider: 'lemonsqueezy', providerMode: 'test'
  });
  assert.equal(monitoring.recurring, true);
  const monitoringApproved = transitionOfferRecord(monitoring, 'approved', { source: 'owner-approval' });
  const monitoringIssued = transitionOfferRecord(monitoringApproved, 'checkout-sent', { source: 'owner-checkout' });
  const monitoringPaid = transitionOfferRecord(monitoringIssued, 'paid', { source: 'verified-webhook' });
  const disputed = transitionOfferRecord(monitoringPaid, 'disputed', { source: 'verified-webhook' });
  assert.equal(disputed.paymentState, 'disputed');
  const recovered = transitionOfferRecord(disputed, 'paid', { source: 'verified-webhook' });
  assert.equal(transitionOfferRecord(recovered, 'cancelled', { source: 'verified-webhook' }).paymentState, 'cancelled');
});

function paidDeliveryFixture(type = 'implementation-sprint') {
  const offerInput = {
    id: `offer-${type}`, campaignId: 'campaign-1', prospectId: 'prospect-1', leadId: 'lead-1',
    type, scope: 'Deliver only the exact approved evidence-backed correction.', exclusions: ['Third-party fees'],
    amountCents: 125000, currency: 'USD', provider: 'test', issue: finding
  };
  let offer = createOfferRecord(offerInput, '2026-07-18T10:00:00.000Z');
  offer = transitionOfferRecord(offer, 'approved', { source: 'owner-approval' });
  offer = transitionOfferRecord(offer, 'checkout-sent', { source: 'owner-checkout' });
  offer = transitionOfferRecord(offer, 'paid', { source: 'test-simulation' });
  const order = {
    id: `order-${type}`, offerId: offer.id, provider: 'test', providerEventId: `test:${type}`,
    providerReference: `reference-${type}`, verificationSource: 'test-simulation', verified: true,
    paymentState: 'paid', amountCents: offer.amountCents, currency: offer.currency, testMode: true,
    occurredAt: '2026-07-18T11:00:00.000Z'
  };
  const prospect = {
    id: offer.prospectId, campaignId: offer.campaignId, company: 'Acme', website: 'https://example.com',
    issue: { ...finding, screenshotReference: 'artifact_capture' }
  };
  return { offer, order, prospect, delivery: createDeliveryRecord({ offer, order, prospect, lead: { id: 'lead-1', company: 'Acme' } }) };
}

test('delivery records require verified payment and enforce proof, input, revision, and no-automation gates', () => {
  const fixture = paidDeliveryFixture();
  const delivery = fixture.delivery;
  assert.equal(delivery.status, 'delivery-queued');
  assert.equal(delivery.customer.name, 'Acme');
  assert.equal(delivery.website, 'https://example.com');
  assert.equal(delivery.payment.providerReference, 'reference-implementation-sprint');
  assert.equal(delivery.amountPaid.amountCents, 125000);
  assert.equal(delivery.selectedIssue.title, finding.title);
  assert.equal(delivery.evidence.excerpt, finding.evidenceExcerpt);
  assert.equal(delivery.siteChangeAuthorization.automaticModificationAllowed, false);
  assert.equal(delivery.implementationBrief.automaticCustomerSiteModification, false);
  assert(delivery.requiredCustomerInputs.some(item => item.id === 'written-authorization'));
  assert(delivery.requiredCustomerInputs.some(item => item.id === 'access-provisioned'));
  assert.throws(() => createDeliveryRecord({ ...fixture, order: { ...fixture.order, verified: false } }), /delivery-verified-order-required/);
  assert.throws(() => createDeliveryRecord({ ...fixture, order: { ...fixture.order, verificationSource: 'frontend-redirect' } }), /delivery-payment-source-invalid/);
  assert.throws(() => createDeliveryRecord({ ...fixture, prospect: { ...fixture.prospect, website: 'https://other.example' } }), /delivery-evidence-domain-mismatch/);
  assert.throws(() => updateDeliveryRecord(delivery, { status: 'ready' }), /delivery-required-inputs-pending/);
  assert.throws(() => updateDeliveryRecord(delivery, { checklistUpdates: [{ id: 'implement-scope', status: 'completed' }] }), /delivery-site-authorization-required/);

  const checklistUpdates = delivery.implementationChecklist.map(item => ({ id: item.id, status: 'completed' }));
  const requiredInputUpdates = delivery.requiredCustomerInputs.map(item => ({ id: item.id, status: 'received' }));
  let updated = updateDeliveryRecord(delivery, { checklistUpdates, requiredInputUpdates });
  assert.equal(updated.siteChangeAuthorization.writtenAuthorizationConfirmed, true);
  assert.equal(updated.siteChangeAuthorization.accessConfirmed, true);
  assert.equal(updated.siteChangeAuthorization.automaticModificationAllowed, false);
  updated = updateDeliveryRecord(updated, { status: 'ready' });
  updated = updateDeliveryRecord(updated, { status: 'in-progress' });
  updated = updateDeliveryRecord(updated, { status: 'ready-for-review' });
  assert.throws(() => updateDeliveryRecord(updated, { status: 'delivered' }), /delivery-proof-required/);
  updated = updateDeliveryRecord(updated, { proofReferences: [{ kind: 'url', label: 'Delivery', value: 'https://proof.example/result?token=secret#private' }] });
  assert.equal(updated.proofOfDelivery.references[0].value, 'https://proof.example/result');
  updated = updateDeliveryRecord(updated, { status: 'delivered' });
  assert.equal(updated.proofOfDelivery.status, 'delivered');
  assert.throws(() => updateDeliveryRecord(updated, { checklistUpdates: [{ id: 'implement-scope', status: 'pending' }] }), /delivery-terminal-state/);
  updated = updateDeliveryRecord(updated, { revisionStatus: 'requested', revisionNote: 'Adjust the approved mobile spacing.' });
  assert.equal(updated.revision.count, 1);
  updated = updateDeliveryRecord(updated, { revisionStatus: 'in-progress' });
  updated = updateDeliveryRecord(updated, { revisionStatus: 'completed' });
  assert.equal(updated.revision.status, 'completed');
  assert.throws(() => updateDeliveryRecord(updated, { credentials: 'secret' }), /delivery-update-unknown-field/);

  const disputed = reconcileDeliveryPayment(delivery, 'disputed', { providerEventId: 'dispute:1' });
  assert.equal(disputed.status, 'on-hold');
  assert.throws(() => updateDeliveryRecord(disputed, { status: 'ready' }), /delivery-payment-hold-active/);
  assert.equal(reconcileDeliveryPayment(disputed, 'paid', { providerEventId: 'resolved:1' }).status, 'delivery-queued');
  assert.equal(reconcileDeliveryPayment(delivery, 'refunded', { providerEventId: 'refund:1' }).status, 'cancelled');
  assert.equal(reconcileDeliveryPayment(updated, 'refunded', { providerEventId: 'refund:delivered' }).status, 'delivered');
});

test('public report shows one free finding then unlocks full report',async()=>{
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'revenue-store-'));const store=new Store(dir);await store.init();
  const pipeline={running:true,paused:false,runBatch:async()=>{}};const engine=new RevenueEngine(store,cfg(dir),pipeline);
  const created=await engine.createLead({company:'Acme',website:'https://example.com',email:'owner@example.com',industry:'SaaS',consent:true},'1.2.3.4');
  const lead=await store.get('leads',created.leadId);const p=await store.get('prospects',lead.prospectId);
  const findings=[{title:'A',severity:4,confidence:.9,evidenceUrl:'https://example.com',evidenceExcerpt:'x',implication:'i',service:'s'},{title:'B',severity:3,confidence:.8,evidenceUrl:'https://example.com/about',evidenceExcerpt:'y',implication:'j',service:'t'}];
  await store.patch('prospects',p.id,{status:'research-complete',score:{total:72,tier:'B'},issue:findings[0],audit:findings,dossier:{screenshots:[],riskFlags:[]},completedAt:new Date().toISOString()});
  await engine.onProspectComplete(await store.get('prospects',p.id));
  const free=await engine.publicReport(created.accessToken);assert.equal(free.report.observations.length,1);assert.equal(free.report.hiddenFindings,1);assert.equal(free.report.fullAccess,false);
  await engine.unlockLead(lead.id,'full',{provider:'test',eventId:'evt_1',amountCents:4900});
  const paid=await engine.publicReport(created.accessToken);assert.equal(paid.report.observations.length,2);assert.equal(paid.report.hiddenFindings,0);assert.equal(paid.report.fullAccess,true);assert.equal((await engine.summary()).grossRevenue,49);
});

test('test and manual providers require separate owner approval, checkout issue, and verified confirmation', async () => {
  const first = await auditedLead();
  assert.deepEqual((await first.engine.publicReport(first.created.accessToken)).offers, []);
  let offer = await first.engine.createOffer(first.prospect.id, {
    type: 'diagnostic', scope: 'Deliver the complete evidence-backed diagnostic.', exclusions: ['Implementation'],
    amountCents: 4900, currency: 'USD', provider: 'test', checkoutKey: 'full'
  });
  await assert.rejects(first.engine.simulateOfferPayment(offer.id, 'too-early'), /checkout-not-issued/);
  offer = await first.engine.approveOffer(offer.id);
  assert.equal(offer.paymentState, 'approved');
  offer = (await first.engine.issueCheckout(offer.id)).offer;
  assert.equal(offer.paymentState, 'checkout-sent');
  await assert.rejects(first.engine.checkoutForLeadOffer(first.lead, offer.id), /test-checkout-private/);
  const paid = await first.engine.simulateOfferPayment(offer.id, 'simulation-1');
  assert.equal(paid.offer.paymentState, 'paid');
  assert.equal(paid.delivery.status, 'delivery-queued');
  assert.equal(paid.delivery.testMode, true);
  assert.equal((await first.store.get('leads', first.lead.id)).paymentStatus, 'paid');
  assert.equal((await first.engine.publicReport(first.created.accessToken)).report.fullAccess, true);
  assert.equal((await first.engine.publicReport(first.created.accessToken)).offers.length, 0);
  const duplicate = await first.engine.applyOfferPayment(offer.id, {
    provider: 'test', providerEventId: 'test:simulation-1', providerReference: 'simulation-1',
    eventName: 'simulated_verified_payment', state: 'paid', source: 'test-simulation', testMode: true
  });
  assert.equal(duplicate.duplicate, true);
  assert.equal(duplicate.delivery.id, paid.delivery.id);
  assert.equal((await first.store.list('deliveries')).length, 1);
  assert.equal((await first.store.get('notifications', `delivery-task:${paid.delivery.id}`)).type, 'delivery_task');
  assert.equal((await first.store.get('prospects', first.prospect.id)).delivery.workflowStatus, 'delivery-queued');
  const deliveryChecklist = paid.delivery.implementationChecklist.map(item => ({ id: item.id, status: 'completed' }));
  const deliveryInputs = paid.delivery.requiredCustomerInputs.map(item => ({ id: item.id, status: 'received' }));
  await first.engine.updateDelivery(paid.delivery.id, { checklistUpdates: deliveryChecklist, requiredInputUpdates: deliveryInputs });
  await first.engine.updateDelivery(paid.delivery.id, { status: 'ready' });
  await first.engine.updateDelivery(paid.delivery.id, { status: 'in-progress' });
  await first.engine.updateDelivery(paid.delivery.id, { status: 'ready-for-review' });
  await first.engine.updateDelivery(paid.delivery.id, { proofReferences: [{ kind: 'url', value: 'https://proof.example/delivery' }] });
  await first.engine.updateDelivery(paid.delivery.id, { status: 'delivered' });
  assert.equal((await first.store.get('prospects', first.prospect.id)).delivery.status, 'delivered');
  assert.equal((await first.store.get('notifications', `delivery-task:${paid.delivery.id}`)).status, 'read');
  await first.engine.updateDelivery(paid.delivery.id, { revisionStatus: 'requested', revisionNote: 'Customer requested a bounded revision.' });
  assert.equal((await first.store.get('notifications', `delivery-task:${paid.delivery.id}`)).status, 'unread');
  await first.engine.updateDelivery(paid.delivery.id, { revisionStatus: 'in-progress' });
  await first.engine.updateDelivery(paid.delivery.id, { revisionStatus: 'completed' });
  assert.equal((await first.store.get('notifications', `delivery-task:${paid.delivery.id}`)).status, 'read');
  let collisionOffer = await first.engine.createOffer(first.prospect.id, {
    type: 'monitoring', scope: 'Monitor the approved booking-path evidence once per month.',
    exclusions: ['Implementation'], amountCents: 9900, currency: 'USD', provider: 'test'
  });
  collisionOffer = await first.engine.approveOffer(collisionOffer.id);
  collisionOffer = (await first.engine.issueCheckout(collisionOffer.id)).offer;
  await assert.rejects(first.engine.applyOfferPayment(collisionOffer.id, {
    provider: 'test', providerEventId: 'test:simulation-1', providerReference: 'different-offer',
    eventName: 'simulated_verified_payment', state: 'paid', source: 'test-simulation', testMode: true
  }), /payment-event-identity-conflict/);
  const monitored = await first.engine.applyOfferPayment(collisionOffer.id, {
    provider: 'test', providerEventId: 'test:monitoring-1', providerReference: 'monitoring-1',
    eventName: 'simulated_verified_payment', state: 'paid', source: 'test-simulation', testMode: true
  });
  assert.equal(monitored.delivery.selectedIssue.title, finding.title);
  assert.equal(monitored.delivery.implementationBrief.steps.some(step => /without changing/i.test(step)), true);
  const recurring = await first.engine.applyOfferPayment(collisionOffer.id, {
    provider: 'test', providerEventId: 'test:monitoring-2', providerReference: 'monitoring-2',
    eventName: 'simulated_verified_payment', state: 'paid', source: 'test-simulation', testMode: true
  });
  assert.notEqual(recurring.delivery.id, monitored.delivery.id);
  assert.equal((await first.engine.deliveriesForProspect(first.prospect.id)).filter(item => item.offerId === collisionOffer.id).length, 2);

  const second = await auditedLead();
  let manual = await second.engine.createOffer(second.prospect.id, {
    type: 'implementation-sprint', scope: 'Implement only the approved booking-path correction.',
    exclusions: ['Hosting', 'Third-party fees'], amountCents: 125000, currency: 'USD', provider: 'manual'
  });
  manual = await second.engine.approveOffer(manual.id);
  manual = (await second.engine.issueCheckout(manual.id)).offer;
  await assert.rejects(second.engine.confirmManualPayment(manual.id, { confirmationReference: 'bank-12345', amountCents: 100, currency: 'USD' }), /manual-payment-mismatch/);
  const confirmed = await second.engine.confirmManualPayment(manual.id, { confirmationReference: 'bank-12345', amountCents: 125000, currency: 'USD' });
  assert.equal(confirmed.offer.paymentState, 'paid');
  assert.equal(confirmed.order.verificationSource, 'manual-owner');
  assert.equal(confirmed.delivery.payment.providerReference, 'bank-12345');
  assert(confirmed.delivery.requiredCustomerInputs.some(item => item.id === 'written-authorization'));
  assert.equal(Object.hasOwn(confirmed.order, 'raw'), false);
});

test('signed Lemon Squeezy events must match an owner-issued offer, amount, currency, and live/test mode', async () => {
  const context = await auditedLead();
  let offer = await context.engine.createOffer(context.prospect.id, {
    type: 'diagnostic', scope: 'Deliver the owner-approved strategy diagnostic.', exclusions: ['Implementation'],
    amountCents: 29900, currency: 'USD', provider: 'lemonsqueezy', providerMode: 'live', checkoutKey: 'strategy'
  });
  offer = await context.engine.approveOffer(offer.id);
  await assert.rejects(context.engine.checkoutForLeadOffer(context.lead, offer.id), /checkout-not-issued/);
  offer = (await context.engine.issueCheckout(offer.id)).offer;
  const checkout = await context.engine.checkoutForLeadOffer(context.lead, offer.id);
  assert.match(checkout.url, /checkout%5Bcustom%5D%5Boffer_id%5D|checkout\[custom\]\[offer_id\]/);
  assert.equal((await context.store.get('leads', context.lead.id)).paymentStatus, 'checkout-sent');
  assert.equal((await context.engine.publicReport(context.created.accessToken)).report.fullAccess, false);
  assert.equal((await context.engine.publicReport(context.created.accessToken)).offers[0].checkoutAvailable, true);

  const payload = (eventName, eventId, total = 29900, extra = {}) => ({
    meta: { event_name: eventName, test_mode: false, custom_data: { offer_id: offer.id, lead_id: context.lead.id, prospect_id: context.prospect.id } },
    data: { id: eventId, type: 'orders', attributes: { total, currency: 'USD', status: 'paid', created_at: '2026-07-18T11:00:00.000Z', user_email: 'must-not-be-stored@example.com', ...extra } }
  });
  const signed = async body => context.engine.handleLemonWebhook(body, crypto.createHmac('sha256', 'secret').update(body).digest('hex'));
  const wrongAmount = JSON.stringify(payload('order_created', 'wrong-amount', 100));
  await assert.rejects(signed(wrongAmount), /payment-amount-mismatch/);
  assert.equal((await context.store.get('leads', context.lead.id)).paymentStatus, 'checkout-sent');
  const paidBody = JSON.stringify(payload('order_created', 'order-1'));
  await assert.rejects(context.engine.handleLemonWebhook(paidBody, 'forged'), /invalid-webhook-signature/);
  const paid = await signed(paidBody);
  assert.equal(paid.event.paymentState, 'paid');
  assert.equal((await signed(paidBody)).duplicate, true);
  assert.equal((await context.store.get('leads', context.lead.id)).paymentStatus, 'paid');
  const storedOrders = await context.store.list('orders');
  assert.equal((await context.store.list('deliveries')).length, 1);
  assert.equal(JSON.stringify(storedOrders).includes('must-not-be-stored@example.com'), false);
  assert.equal(storedOrders.every(order => !Object.hasOwn(order, 'raw')), true);

  const refundBody = JSON.stringify(payload('order_refunded', 'order-1'));
  const refunded = await signed(refundBody);
  assert.equal(refunded.event.paymentState, 'refunded');
  assert.equal((await context.store.list('deliveries'))[0].status, 'cancelled');
  assert.equal((await context.store.get('leads', context.lead.id)).paymentStatus, 'refunded');
  assert.equal((await context.engine.publicReport(context.created.accessToken)).report.fullAccess, false);
  assert.equal((await context.engine.summary()).grossRevenue, 0);
  assert.equal((await signed(refundBody)).duplicate, true);
  assert.equal((await signed(paidBody)).duplicate, true);
  assert.equal((await context.store.get('leads', context.lead.id)).paymentStatus, 'refunded');
  assert.equal((await context.store.list('deliveries'))[0].payment.state, 'refunded');
});
