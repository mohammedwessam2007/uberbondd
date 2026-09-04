// Provider-neutral founder-absence boundary.
//
// The mature blocker engine remains byte-preserved in
// founder-absence-blocker-doctor-core.mjs. This facade corrects the payment
// environment semantics without creating a second blocker classifier: a
// payment configuration is present only when one complete provider bundle is
// present. Sandbox configuration never becomes live-payment proof.

export * from './founder-absence-blocker-doctor-core.mjs';

import * as core from './founder-absence-blocker-doctor-core.mjs';

const present = (env, name) => Boolean(String(env?.[name] ?? '').trim());

const CHECKOUT_ENV = Object.freeze([
  'FULL_AUDIT_CHECKOUT_URL',
  'STRATEGY_AUDIT_CHECKOUT_URL',
  'MONITORING_CHECKOUT_URL'
]);

export const ENVIRONMENT_PRESENCE_GROUPS = Object.freeze({
  ...core.ENVIRONMENT_PRESENCE_GROUPS,
  paymentProvider: Object.freeze([
    'LEMONSQUEEZY_WEBHOOK_SECRET',
    'DATABASE_URL',
    ...CHECKOUT_ENV,
    'PAYPAL_SANDBOX_CLIENT_ID',
    'PAYPAL_SANDBOX_CLIENT_SECRET',
    'PAYPAL_SANDBOX_WEBHOOK_ID'
  ])
});

function providerPaymentPresence(env = {}) {
  const keys = ENVIRONMENT_PRESENCE_GROUPS.paymentProvider.map(name => ({
    name,
    present: present(env, name)
  }));
  const presentCount = keys.filter(entry => entry.present).length;
  const durableInboxPresent = present(env, 'DATABASE_URL');
  const lemonWebhookPresent = present(env, 'LEMONSQUEEZY_WEBHOOK_SECRET');
  const lemonCheckoutPresent = CHECKOUT_ENV.some(name => present(env, name));
  const lemonSqueezyComplete = lemonWebhookPresent && durableInboxPresent && lemonCheckoutPresent;

  const paypalSandboxClientIdPresent = present(env, 'PAYPAL_SANDBOX_CLIENT_ID');
  const paypalSandboxClientSecretPresent = present(env, 'PAYPAL_SANDBOX_CLIENT_SECRET');
  const paypalSandboxWebhookIdPresent = present(env, 'PAYPAL_SANDBOX_WEBHOOK_ID');
  const paypalSandboxComplete = paypalSandboxClientIdPresent
    && paypalSandboxClientSecretPresent
    && paypalSandboxWebhookIdPresent
    && durableInboxPresent;

  const anyProviderFragmentPresent = lemonWebhookPresent
    || lemonCheckoutPresent
    || paypalSandboxClientIdPresent
    || paypalSandboxClientSecretPresent
    || paypalSandboxWebhookIdPresent;

  return {
    // Preserve the mature generic presence-report shape for existing consumers.
    keys,
    anyPresent: anyProviderFragmentPresent,
    allPresent: lemonSqueezyComplete || paypalSandboxComplete,
    presentCount,

    // Add provider-specific completeness without leaking credential values.
    providers: {
      lemon_squeezy: {
        webhookSigningSecretPresent: lemonWebhookPresent,
        durableInboxPresent,
        checkoutPresent: lemonCheckoutPresent,
        completeBundle: lemonSqueezyComplete
      },
      paypal: {
        sandboxClientIdPresent: paypalSandboxClientIdPresent,
        sandboxClientSecretPresent: paypalSandboxClientSecretPresent,
        sandboxWebhookIdPresent: paypalSandboxWebhookIdPresent,
        durableInboxPresent,
        sandboxComplete: paypalSandboxComplete,
        livePaymentCapable: false
      }
    },
    lemonSqueezyComplete,
    paypalSandboxComplete,
    anyCompleteBundle: lemonSqueezyComplete || paypalSandboxComplete,
    livePaymentCapable: false
  };
}

export function deriveEnvironmentPresence(env = {}) {
  const base = core.deriveEnvironmentPresence(env);
  return {
    ...base,
    paymentProvider: providerPaymentPresence(env)
  };
}

const PAYMENT_BLOCKER_ID = 'zero-payment-provider-account';

export const RAGNAROK_BLOCKER_LEDGER = Object.freeze(core.RAGNAROK_BLOCKER_LEDGER.map(row => {
  if (row.id !== PAYMENT_BLOCKER_ID) return row;
  return Object.freeze({
    ...row,
    title: 'No complete payment-provider verification bundle is configured; provider configuration is separate from live/KYC/cleared-payment proof',
    removedBy: 'one complete provider bundle for verification, followed separately by live provider acceptance/KYC and provider-origin cleared-payment evidence',
    resolvedWhen: { environmentAnyOf: 'paymentProvider' },
    ownerAction: Object.freeze({
      action: 'Use the PayPal Sandbox verification path with its complete Sandbox Client ID + Secret + Webhook ID + durable database bundle; later, before live money, configure the provider Live/KYC path and require provider-origin reconciled payment evidence',
      screen: 'PayPal Developer -> Sandbox app for verification; later the PayPal Live app/KYC screens and UberBond protected environment variables',
      minutes: 15,
      cost: 'Sandbox verification is free; live provider fees and identity/KYC requirements apply only when activating real payments',
      evidenceOfCompletion: 'Founder-absence/payment doctors report paypalSandboxComplete true for verification; live payment remains unproven until separate Live/KYC/provider-origin evidence exists'
    })
  });
}));

export function evaluateFounderAbsenceBlockers(args = {}) {
  const env = args?.env && typeof args.env === 'object' ? args.env : {};
  const presence = deriveEnvironmentPresence(env);

  // The preserved core engine understands its historical paymentProvider group
  // as one presence boolean. Feed it a non-secret sentinel only when this
  // facade has already proved one complete provider bundle. Partial/mixed
  // credentials therefore cannot resolve the payment blocker.
  const compatibilityEnv = {
    ...env,
    LEMONSQUEEZY_WEBHOOK_SECRET: presence.paymentProvider.anyCompleteBundle
      ? '__complete_payment_provider_bundle_present__'
      : ''
  };

  const report = core.evaluateFounderAbsenceBlockers({
    ...args,
    blockers: Array.isArray(args?.blockers) ? args.blockers : RAGNAROK_BLOCKER_LEDGER,
    env: compatibilityEnv
  });

  return {
    ...report,
    environmentPresence: presence
  };
}
