// How far a calibration claim actually reaches.
//
// The previous denominator marked N12 REALITY_CALIBRATED on two scored
// forecasts, both about this repository, both settled by running a command in
// this repository. That is a real result and it is the narrowest possible one:
// it says the forecaster is calibrated about its own tree on the kinds of
// question it chose. "REALITY_CALIBRATED" reads as something far larger.
//
// One state cannot carry that distinction, so this is a ladder, and each rung
// names what the evidence must actually cover to reach it.
export const NULLSTAR_OMEGA_CALIBRATION_LADDER_VERSION = 'uberbond.nullstar-omega-calibration-ladder.v1';

export const CALIBRATION_STATES = Object.freeze([
  'UNMEASURED',
  'INTERNAL_SIMULATED',
  'REPOSITORY_LOCAL_CALIBRATED',
  'DOMAIN_CALIBRATED',
  'MULTI_DOMAIN_CALIBRATED',
  'EXTERNALLY_CALIBRATED',
  'LONGITUDINALLY_CALIBRATED'
]);

export const STATE_REQUIREMENTS = Object.freeze({
  UNMEASURED: 'No scored forecast.',
  INTERNAL_SIMULATED: 'Forecasts scored against simulated or self-authored outcomes. Measures consistency, not calibration.',
  REPOSITORY_LOCAL_CALIBRATED: 'At least 2 forecasts settled by running something in this repository, across at least 2 task families.',
  DOMAIN_CALIBRATED: 'At least 20 forecasts across at least 5 task families within one domain.',
  MULTI_DOMAIN_CALIBRATED: 'At least 40 forecasts across at least 2 domains, each domain itself meeting the domain bar.',
  EXTERNALLY_CALIBRATED: 'At least 20 forecasts whose outcomes were settled outside this system entirely -- a provider, a counterparty, the physical world.',
  LONGITUDINALLY_CALIBRATED: 'External calibration sustained across at least 3 separated time horizons, so it is not one lucky window.'
});

// Deliberately steep. A ladder whose rungs are easy to climb measures nothing.
const THRESHOLDS = Object.freeze({
  REPOSITORY_LOCAL_CALIBRATED: { n: 2, families: 2, domains: 1, horizons: 1, external: 0 },
  DOMAIN_CALIBRATED: { n: 20, families: 5, domains: 1, horizons: 1, external: 0 },
  MULTI_DOMAIN_CALIBRATED: { n: 40, families: 5, domains: 2, horizons: 1, external: 0 },
  EXTERNALLY_CALIBRATED: { n: 20, families: 5, domains: 1, horizons: 1, external: 20 },
  LONGITUDINALLY_CALIBRATED: { n: 20, families: 5, domains: 1, horizons: 3, external: 20 }
});

const fail = (status, reasonCodes, extra = {}) => ({
  ok: false,
  status,
  reasonCodes: [...new Set(reasonCodes.filter(Boolean))],
  businessEffectAuthority: 'NONE',
  ...extra
});

const count = value => (Number.isInteger(value) && value >= 0 ? value : null);

/**
 * Place a calibration claim on the ladder.
 *
 * Every number must be supplied. An omitted count is not zero and not assumed
 * generous -- it is a refusal, because the previous overclaim happened by
 * never asking how far the sample reached.
 */
export function placeCalibration({
  scoredForecasts = null,
  taskFamilyCount = null,
  domainCount = null,
  timeHorizonCount = null,
  externallySettledForecasts = null,
  meanBrier = null,
  voidedForecasts = 0
} = {}) {
  const reasonCodes = [];
  const n = count(scoredForecasts);
  const families = count(taskFamilyCount);
  const domains = count(domainCount);
  const horizons = count(timeHorizonCount);
  const external = count(externallySettledForecasts);

  if (n === null) reasonCodes.push('scored-forecast-count-required');
  if (families === null) reasonCodes.push('task-family-count-required');
  if (domains === null) reasonCodes.push('domain-count-required');
  if (horizons === null) reasonCodes.push('time-horizon-count-required');
  if (external === null) reasonCodes.push('externally-settled-count-required');
  if (external !== null && n !== null && external > n) reasonCodes.push('externally-settled-cannot-exceed-scored');
  if (reasonCodes.length) return fail('CALIBRATION_PLACEMENT_INVALID', reasonCodes);

  if (n === 0) {
    return {
      ok: true,
      status: 'UNMEASURED',
      version: NULLSTAR_OMEGA_CALIBRATION_LADDER_VERSION,
      requirement: STATE_REQUIREMENTS.UNMEASURED,
      sample: { scoredForecasts: 0, taskFamilyCount: families, domainCount: domains, timeHorizonCount: horizons, externallySettledForecasts: external, voidedForecasts },
      businessEffectAuthority: 'NONE'
    };
  }

  const meets = state => {
    const t = THRESHOLDS[state];
    return n >= t.n && families >= t.families && domains >= t.domains && horizons >= t.horizons && external >= t.external;
  };

  // Walk from the top so the reported state is the highest genuinely earned.
  let earned = 'INTERNAL_SIMULATED';
  for (const state of ['LONGITUDINALLY_CALIBRATED', 'EXTERNALLY_CALIBRATED', 'MULTI_DOMAIN_CALIBRATED', 'DOMAIN_CALIBRATED', 'REPOSITORY_LOCAL_CALIBRATED']) {
    if (meets(state)) { earned = state; break; }
  }

  // What is missing from the next rung, so the gap is a fact rather than a mood.
  const index = CALIBRATION_STATES.indexOf(earned);
  const next = CALIBRATION_STATES[index + 1] ?? null;
  const shortfall = [];
  if (next && THRESHOLDS[next]) {
    const t = THRESHOLDS[next];
    if (n < t.n) shortfall.push(`needs ${t.n} scored forecasts, has ${n}`);
    if (families < t.families) shortfall.push(`needs ${t.families} task families, has ${families}`);
    if (domains < t.domains) shortfall.push(`needs ${t.domains} domains, has ${domains}`);
    if (horizons < t.horizons) shortfall.push(`needs ${t.horizons} time horizons, has ${horizons}`);
    if (external < t.external) shortfall.push(`needs ${t.external} externally settled, has ${external}`);
  }

  // A sample this small cannot support an interval worth printing, and saying
  // so is more useful than printing one.
  const smallSample = n < 20;

  return {
    ok: true,
    status: earned,
    version: NULLSTAR_OMEGA_CALIBRATION_LADDER_VERSION,
    requirement: STATE_REQUIREMENTS[earned],
    sample: {
      scoredForecasts: n,
      taskFamilyCount: families,
      domainCount: domains,
      timeHorizonCount: horizons,
      externallySettledForecasts: external,
      voidedForecasts,
      meanBrier: Number.isFinite(meanBrier) ? meanBrier : null
    },
    smallSample,
    confidenceInterval: smallSample ? null : 'COMPUTE_FROM_SCORED_ROWS',
    smallSampleWarning: smallSample
      ? `A mean over ${n} forecast(s) is not a calibration curve. No interval is reported because none would be honest at this sample size.`
      : null,
    nextState: next,
    shortfallToNextState: shortfall,
    truthBoundary: 'CALIBRATION REACHES ONLY AS FAR AS THE QUESTIONS IT WAS SCORED ON. A HIGHER RUNG IS NOT IMPLIED BY A GOOD MEAN ON A LOWER ONE.',
    businessEffectAuthority: 'NONE'
  };
}
