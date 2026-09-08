import { attemptDelivery, compileFulfillmentDeliveryEvent, evaluateAcceptanceWindow } from '../src/delivery-transport-contract.mjs';

const fake = { name:'DOCTOR_FAKE', async send(){ return { confirmed:true, providerReceiptId:'doctor-receipt-1' }; } };
const attempt = await attemptDelivery({ tenantRef:'synthetic-tenant', orderRef:'synthetic-order', fulfillmentId:'synthetic-fulfill', artifactRefs:['synthetic-report'], providerAdapter:fake, attemptId:'doctor-attempt', idempotencyKey:'doctor:delivery:v1', date:new Date('2026-01-01T00:00:00.000Z') });
const delivery = compileFulfillmentDeliveryEvent(attempt.receipt, { eventId:'doctor-delivery' });
const silence = evaluateAcceptanceWindow({ deliveredAt:'2026-01-01T00:00:00.000Z', now:new Date('2026-01-10T00:00:00.000Z'), acceptanceWindowMs:86400000, followupCount:2, maxFollowups:2 });
const checks = {
  providerConfirmationHeld: attempt.status === 'PROVIDER_CONFIRMED_DELIVERY',
  deliveryIsNotAcceptance: delivery.ok === true && delivery.acceptanceTruth === 'NOT_INFERRED' && delivery.event?.type === 'DELIVERY_RECORDED',
  silenceIsNotAcceptance: silence.ok === true && silence.accepted === false && silence.status === 'WINDOW_ELAPSED_WITHOUT_ACCEPTANCE'
};
const ok = Object.values(checks).every(Boolean);
console.log(JSON.stringify({ ok, status: ok ? 'ALL_DELIVERY_TRUTH_BOUNDARIES_HELD' : 'BOUNDARY_LOST', checks, businessEffectAuthority:'NONE', externalEffects:{ providerCalls:0, customerMessages:0 }, note:'Synthetic doctor only; does not prove a real provider delivered anything or a customer accepted anything.' }, null, 2));
if (!ok) process.exitCode = 1;
