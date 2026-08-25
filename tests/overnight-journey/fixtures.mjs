import { ZERO_EXTERNAL_EFFECTS } from '../../src/effect-ledgers.mjs';
import { JOURNEY_STEP_TYPES, observeSyntheticJourney } from '../../src/overnight/journey/observation.mjs';
import { diagnoseSyntheticJourney } from '../../src/overnight/journey/diagnosis.mjs';

export const TEST_DATE = '2026-08-25T02:00:00.000Z';

export function authorization(overrides = {}) {
  return {
    decision: 'ALLOW',
    operation: 'JOURNEY_SYNTHETIC_CHECK',
    capability: 'SYNTHETIC_JOURNEY_CHECK',
    effectClass: 'ZERO_EFFECT',
    intentId: 'intent_journey_test',
    nonce: 'nonce_journey_test',
    expiresAt: '2026-08-25T03:00:00.000Z',
    ...overrides
  };
}

export function receipt(overrides = {}) {
  return {
    receiptId: 'receipt_journey_test',
    operation: 'JOURNEY_SYNTHETIC_CHECK',
    checkId: 'check_journey_test',
    observedAt: TEST_DATE,
    externalEffectLedger: { ...ZERO_EXTERNAL_EFFECTS },
    ...overrides
  };
}

export function steps(statusByType = {}) {
  return JOURNEY_STEP_TYPES.map(stepType => ({
    stepId: `step_${stepType.toLowerCase()}`,
    stepType,
    status: statusByType[stepType] || 'PASS',
    observedAt: TEST_DATE,
    evidenceRef: `witness:${stepType.toLowerCase()}`
  }));
}

export function observation({ statusByType = {}, stepOverrides = [], authorizationOverrides = {}, receiptOverrides = {}, ...overrides } = {}) {
  return observeSyntheticJourney({
    checkId: 'check_journey_test',
    journeyId: 'journey_consultation_funnel',
    subjectRef: 'org_test_target',
    authorization: authorization(authorizationOverrides),
    receipt: receipt(receiptOverrides),
    steps: [...steps(statusByType), ...stepOverrides],
    date: TEST_DATE,
    ...overrides
  });
}

export function diagnostic({ statusByType = {}, reasoning = {}, ...overrides } = {}) {
  const observed = observation({ statusByType, ...overrides });
  return diagnoseSyntheticJourney({ observation: observed, reasoning, date: TEST_DATE });
}

