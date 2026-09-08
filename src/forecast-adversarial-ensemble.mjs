// What a room full of agreeing forecasters is actually worth.
//
// The failure this module exists to prevent is the most comfortable one in
// forecasting: ten models agree, so the answer feels ten times more certain.
// It is not. If those ten models read the same three papers, trained on the
// same corpus, or inherited the same analyst's spreadsheet, the room contains
// one opinion repeated ten times, and the agreement is a fact about the
// ancestry rather than about the world.
//
// So every forecaster here must declare where its evidence came from, and
// forecasters sharing an ancestor are collapsed toward a single effective
// vote. The raw count and the effective count are both reported, because the
// gap between them is the finding. Aggregation is weighted the same way: nine
// clones cannot outvote one genuinely independent forecaster nine to one.
//
// Two further rules follow from the same idea. A dominant forecast nobody has
// attacked is untested rather than strong, and is labelled that way instead of
// inheriting confidence from consensus. And a minority model is preserved in
// the output rather than deleted for disagreeing -- it does not win by being
// different, but being outnumbered is not a refutation either.
//
// This module composes src/forecast-stack.mjs rather than restating it. The
// strength profile, the method validation and the survived-attack extraction
// all come from there.
import {
  forecastMethod, buildForecast, strengthProfile, adversarialFutureSelves
} from './forecast-stack.mjs';

export const FORECAST_ADVERSARIAL_ENSEMBLE_VERSION = 'uberbond.forecast-adversarial-ensemble.v1';

/**
 * The epistemic immune system's attack surface, taken from canon.
 *
 * These are the ways a conclusion can feel supported while being unsupported.
 * The last two are the ones this module is built around.
 */
export const EPISTEMIC_BIASES = Object.freeze([
  'confirmation-bias', 'survivorship-bias', 'selection-bias', 'publication-bias',
  'motivated-reasoning', 'base-rate-neglect', 'correlated-sources', 'data-leakage',
  'hindsight-bias', 'narrative-fallacy', 'benchmark-gaming', 'model-collusion',
  'consensus-masquerading-as-independent-evidence'
]);

/** Stances kept alive side by side. Model ecology deletes none of them. */
export const MODEL_STANCES = Object.freeze([
  'MAINSTREAM', 'HETERODOX', 'MINORITY', 'ALIEN_ASSUMPTION'
]);

/** What a critic is allowed to attack with. A vague objection is not an attack. */
export const ATTACK_TYPES = Object.freeze([
  'COUNTEREXAMPLE', 'OMITTED_MECHANISM', 'HIDDEN_INCENTIVE', 'TAIL_RISK',
  'BASE_RATE_VIOLATION', 'REFLEXIVITY', 'DATA_LEAKAGE'
]);

/**
 * Credit a forecaster earns for private evidence its cluster-mates lack.
 *
 * Deliberately small. A forecaster that shares an ancestor with the others is
 * mostly that ancestor speaking again, and its own reading of one extra source
 * does not restore full independence. Partial independence stays partial.
 */
export const PARTIAL_INDEPENDENCE_CREDIT = 0.25;

/** Effective votes below this cannot be called convergence, however loud the agreement. */
export const CONVERGENCE_FLOOR = 3;

/** Agreement below this is disagreement, and disagreement is a finding, not a defect. */
export const AGREEMENT_FLOOR = 0.75;

const text = (value, max = 2000) => {
  const out = String(value ?? '').trim();
  return out && out.length <= max ? out : null;
};

const list = (value, max = 500) =>
  (Array.isArray(value) ? value : []).map(item => text(item, max)).filter(Boolean);

const round = value => Math.round(value * 100) / 100;

const fail = (status, reasonCodes, extra = {}) => ({
  ok: false, status, reasonCodes: [...new Set(reasonCodes.filter(Boolean))],
  businessEffectAuthority: 'NONE', ...extra
});

/**
 * A distribution over named outcomes, or a refusal.
 *
 * A single-outcome distribution is a certainty claim wearing a probability's
 * clothes, so it is refused here rather than allowed to enter the ensemble and
 * pull the aggregate toward false precision.
 */
const readDistribution = value => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return { error: 'distribution-required' };
  const entries = Object.entries(value)
    .map(([outcome, probability]) => [text(outcome, 200), Number(probability)])
    .filter(([outcome, probability]) => outcome && Number.isFinite(probability) && probability >= 0 && probability <= 1);
  if (entries.length === 0) return { error: 'distribution-required' };
  if (entries.length < 2) return { error: 'distribution-must-span-at-least-two-outcomes' };
  const total = entries.reduce((sum, [, probability]) => sum + probability, 0);
  if (Math.abs(total - 1) > 0.01) return { error: 'distribution-probabilities-must-sum-to-one' };
  return { distribution: Object.fromEntries(entries) };
};

const modalOutcomeOf = distribution =>
  Object.entries(distribution).reduce((top, row) => (row[1] > top[1] ? row : top))[0];

/**
 * One forecaster's submission, with the ancestry field that makes the rest possible.
 *
 * `evidenceAncestry` is load-bearing and therefore required. A forecaster that
 * will not say where its evidence came from cannot be checked for correlation
 * with the others, and an uncheckable submission silently becomes a free extra
 * vote for whatever it already believed.
 *
 * `disconfirmingEvidence` is recorded but not required, because demanding it
 * would only produce decorative entries. Its absence is flagged instead.
 */
export function forecasterSubmission(input = {}) {
  const forecasterId = text(input?.forecasterId, 200);
  const reasonCodes = [];
  if (!forecasterId) reasonCodes.push('forecaster-id-required');

  const read = readDistribution(input?.distribution);
  if (read.error) reasonCodes.push(read.error);

  const evidenceAncestry = list(input?.evidenceAncestry, 300);
  if (evidenceAncestry.length === 0) reasonCodes.push('evidence-ancestry-required');

  const updateTriggers = list(input?.updateTriggers, 500);
  if (updateTriggers.length === 0) reasonCodes.push('update-triggers-required');

  if (reasonCodes.length > 0) {
    return fail('SUBMISSION_INVALID', reasonCodes, {
      note: 'A submission that cannot be traced to its sources cannot be checked for correlation, and would enter the ensemble as a free extra vote.'
    });
  }

  const disconfirmingEvidence = list(input?.disconfirmingEvidence, 1000);
  return {
    ok: true,
    status: 'SUBMISSION_ACCEPTED',
    forecasterId,
    stance: MODEL_STANCES.includes(input?.stance) ? input.stance : 'MAINSTREAM',
    distribution: read.distribution,
    modalOutcome: modalOutcomeOf(read.distribution),
    assumptions: list(input?.assumptions, 500),
    causalModel: text(input?.causalModel, 2000) || null,
    evidence: list(input?.evidence, 1000),
    disconfirmingEvidence,
    // Recorded rather than enforced. A forecaster that looked for nothing
    // against itself is a confirmation-bias flag, not an invalid submission.
    soughtDisconfirmation: disconfirmingEvidence.length > 0,
    updateTriggers,
    evidenceAncestry: [...new Set(input.evidenceAncestry.map(source => text(source, 300)).filter(Boolean))],
    businessEffectAuthority: 'NONE'
  };
}

/**
 * How many genuinely independent opinions are in the room.
 *
 * Forecasters linked by any shared ancestry source are one cluster and one
 * effective vote, plus a small credit for members holding evidence nobody else
 * in the cluster holds. Ten forecasters reading one report are one voice; the
 * raw count is reported alongside so the gap stays visible rather than being
 * quietly resolved in favour of the larger, more flattering number.
 */
export function effectiveIndependence(submissions = []) {
  const rows = (Array.isArray(submissions) ? submissions : [])
    .filter(row => row?.ok === true && row?.forecasterId && Array.isArray(row?.evidenceAncestry) && row.evidenceAncestry.length > 0);
  if (rows.length === 0) return fail('INDEPENDENCE_INVALID', ['at-least-one-accepted-submission-required']);

  const parent = rows.map((_, index) => index);
  const find = index => (parent[index] === index ? index : (parent[index] = find(parent[index])));
  const owners = new Map();
  rows.forEach((row, index) => {
    for (const source of row.evidenceAncestry) {
      if (owners.has(source)) {
        const a = find(owners.get(source));
        const b = find(index);
        if (a !== b) parent[b] = a;
      } else {
        owners.set(source, index);
      }
    }
  });

  const grouped = new Map();
  rows.forEach((_, index) => {
    const root = find(index);
    if (!grouped.has(root)) grouped.set(root, []);
    grouped.get(root).push(index);
  });

  const clusters = [...grouped.values()].map(members => {
    const counts = new Map();
    for (const index of members) {
      for (const source of rows[index].evidenceAncestry) counts.set(source, (counts.get(source) || 0) + 1);
    }
    const shared = [...counts.entries()].filter(([, count]) => count > 1).map(([source]) => source);
    const partiallyIndependent = members.filter(index =>
      members.length > 1 && rows[index].evidenceAncestry.some(source => counts.get(source) === 1));
    return {
      forecasterIds: members.map(index => rows[index].forecasterId),
      sharedAncestry: shared,
      partiallyIndependent: partiallyIndependent.map(index => rows[index].forecasterId),
      // One vote per cluster, whatever its size. That is the whole mechanism.
      effectiveVotes: round(1 + partiallyIndependent.length * PARTIAL_INDEPENDENCE_CREDIT)
    };
  });

  const effectiveIndependentCount = round(clusters.reduce((sum, cluster) => sum + cluster.effectiveVotes, 0));
  const weights = new Map();
  for (const cluster of clusters) {
    for (const forecasterId of cluster.forecasterIds) weights.set(forecasterId, 1 / cluster.forecasterIds.length);
  }

  return {
    ok: true,
    status: 'INDEPENDENCE_ASSESSED',
    rawCount: rows.length,
    effectiveIndependentCount,
    independenceRatio: round(effectiveIndependentCount / rows.length),
    clusters,
    correlated: effectiveIndependentCount < rows.length,
    weights,
    law: 'APPARENT AGREEMENT IS DISCOUNTED WHEN THE SOURCES SHARE AN ANCESTOR. CONFIDENCE FOLLOWS EVIDENCE INDEPENDENCE, NOT VOTE COUNT.',
    businessEffectAuthority: 'NONE'
  };
}

/**
 * One critic's attempt to break the dominant forecast.
 *
 * `forecastSurvived` is the critic's verdict on the forecast, not on the
 * attack. Requiring a typed attack keeps this from degrading into recorded
 * disagreement, which is not the same thing as a falsification attempt.
 */
export function adversarialAttack(input = {}) {
  const critic = text(input?.critic, 200);
  const finding = text(input?.finding, 1000);
  const attackType = ATTACK_TYPES.includes(input?.attackType) ? input.attackType : null;
  const reasonCodes = [];
  if (!critic) reasonCodes.push('critic-required');
  if (!attackType) reasonCodes.push('valid-attack-type-required');
  if (!finding) reasonCodes.push('finding-required');
  if (reasonCodes.length > 0) return fail('ATTACK_INVALID', reasonCodes, { attackTypes: ATTACK_TYPES });

  return {
    ok: true,
    status: 'ATTACK_RECORDED',
    critic,
    attackType,
    finding,
    forecastSurvived: input?.forecastSurvived === true,
    businessEffectAuthority: 'NONE'
  };
}

/**
 * Names the ways this conclusion could feel supported without being supported.
 *
 * Flags are recorded, never resolved. A flagged conclusion is not thereby
 * false; an unflagged one is not thereby sound. The output is a list of things
 * to check, which is the only honest thing a bias review can produce.
 */
export function epistemicImmuneReview({ conclusion = null, flags = [] } = {}) {
  const claim = text(conclusion, 2000);
  if (!claim) return fail('IMMUNE_REVIEW_INVALID', ['conclusion-required']);

  const recognised = [...new Set((Array.isArray(flags) ? flags : []).filter(flag => EPISTEMIC_BIASES.includes(flag)))];
  const unrecognised = [...new Set((Array.isArray(flags) ? flags : []).filter(flag => !EPISTEMIC_BIASES.includes(flag)))];

  return {
    ok: true,
    status: recognised.length === 0 ? 'NO_BIAS_FLAGGED' : 'BIAS_FLAGGED',
    conclusion: claim,
    flags: recognised,
    unrecognisedFlags: unrecognised,
    // Stated because a bias review that clears a conclusion is doing the
    // opposite of its job.
    boundary: 'FLAGS ARE RAISED, NOT RESOLVED. AN UNFLAGGED CONCLUSION IS NOT THEREBY SOUND.',
    businessEffectAuthority: 'NONE'
  };
}

/**
 * Every model kept, with the disagreeing ones named rather than dropped.
 *
 * The deletion this prevents is quiet: an aggregation step that discards
 * outliers looks like noise reduction and is sometimes the removal of the only
 * forecaster that was right. A minority model does not win by being different;
 * it also does not lose by being outnumbered.
 */
export function modelEcology(submissions = [], ensembleModalOutcome = null) {
  const rows = (Array.isArray(submissions) ? submissions : []).filter(row => row?.ok === true && row?.forecasterId);
  if (rows.length === 0) return fail('ECOLOGY_INVALID', ['at-least-one-accepted-submission-required']);

  const preserved = rows.map(row => ({
    forecasterId: row.forecasterId,
    stance: row.stance,
    modalOutcome: row.modalOutcome,
    distribution: row.distribution,
    dissenting: ensembleModalOutcome !== null && row.modalOutcome !== ensembleModalOutcome
  }));

  return {
    ok: true,
    status: 'ECOLOGY_PRESERVED',
    preserved,
    minority: preserved.filter(row => row.dissenting || row.stance !== 'MAINSTREAM'),
    stancesPresent: [...new Set(preserved.map(row => row.stance))],
    dropped: [],
    law: 'A MINORITY MODEL DOES NOT WIN BY BEING DIFFERENT AND IS NOT ERASED FOR BEING OUTNUMBERED.',
    businessEffectAuthority: 'NONE'
  };
}

/**
 * The ensemble, aggregated by independence rather than by headcount.
 *
 * Each forecaster carries one over its cluster size, so a cluster of nine
 * clones and one independent forecaster meet as one to one rather than nine to
 * one. Agreement is then reported twice: raw headcount, and the same agreement
 * discounted by how independent the agreeing parties actually were. Only the
 * discounted figure reaches the strength profile, because agreement among
 * copies is not evidence and should not be able to raise a strength score.
 *
 * With no attacks recorded the ensemble is labelled adversarially untested. It
 * does not get to inherit confidence from consensus it was never asked to
 * defend.
 */
export function composeEnsemble({ question = null, submissions = [], attacks = [], methods = [] } = {}) {
  const asked = text(question, 2000);
  if (!asked) return fail('ENSEMBLE_INVALID', ['question-required']);

  const accepted = (Array.isArray(submissions) ? submissions : []).filter(row => row?.ok === true);
  const rejected = (Array.isArray(submissions) ? submissions : []).filter(row => row && row.ok === false);
  if (accepted.length === 0) return fail('ENSEMBLE_INVALID', ['at-least-one-accepted-submission-required'], { rejected: rejected.length });

  const independence = effectiveIndependence(accepted);
  if (!independence.ok) return independence;

  const aggregate = new Map();
  let totalWeight = 0;
  for (const row of accepted) {
    const weight = independence.weights.get(row.forecasterId) ?? 1;
    totalWeight += weight;
    for (const [outcome, probability] of Object.entries(row.distribution)) {
      aggregate.set(outcome, (aggregate.get(outcome) || 0) + probability * weight);
    }
  }
  const aggregated = Object.fromEntries([...aggregate.entries()].map(([outcome, mass]) => [outcome, round(mass / totalWeight)]));
  const ensembleModalOutcome = modalOutcomeOf(aggregated);

  const agreeing = accepted.filter(row => row.modalOutcome === ensembleModalOutcome);
  const rawAgreementRate = round(agreeing.length / accepted.length);
  // Agreement among sources sharing an ancestor is the ancestor speaking
  // repeatedly. Only this discounted figure is allowed near the strength score.
  const evidentialAgreement = round(rawAgreementRate * independence.independenceRatio);

  const attackRows = (Array.isArray(attacks) ? attacks : []).filter(row => row?.ok === true && row?.critic);
  const adversarialReview = adversarialFutureSelves({
    decision: asked,
    attacks: attackRows.map(row => ({ from: row.critic, attacks: row.finding, survived: row.forecastSurvived }))
  });
  const landed = attackRows.filter(row => row.forecastSurvived !== true);
  const adversarialStatus = attackRows.length === 0
    ? 'UNTESTED'
    : (landed.length > 0 ? 'ATTACK_LANDED' : 'SURVIVED_ATTACK');

  const flags = [];
  if (independence.correlated) flags.push('correlated-sources');
  if (independence.correlated && rawAgreementRate >= AGREEMENT_FLOOR) flags.push('consensus-masquerading-as-independent-evidence');
  if (independence.effectiveIndependentCount <= 1 && accepted.length > 1) flags.push('model-collusion');
  if (accepted.some(row => row.soughtDisconfirmation === false)) flags.push('confirmation-bias');
  if (adversarialStatus === 'UNTESTED') flags.push('motivated-reasoning');
  const immuneReview = epistemicImmuneReview({ conclusion: `${asked} -> ${ensembleModalOutcome}`, flags });

  const consensusClass = rawAgreementRate < AGREEMENT_FLOOR
    ? 'GENUINE_DISAGREEMENT'
    : (independence.effectiveIndependentCount >= CONVERGENCE_FLOOR
      ? 'INDEPENDENT_CONVERGENCE'
      : (independence.effectiveIndependentCount >= 2 ? 'WEAK_CONVERGENCE' : 'CORRELATED_AGREEMENT'));

  const declaredMethods = (Array.isArray(methods) ? methods : []).filter(row => row?.ok === true && row?.method);
  const stack = buildForecast({
    claim: asked,
    methods: declaredMethods.length > 0
      ? declaredMethods
      : [forecastMethod({ method: 'INDEPENDENT_ENSEMBLE' }), forecastMethod({ method: 'ADVERSARIAL' })],
    estimate: aggregated[ensembleModalOutcome]
  });

  return {
    ok: true,
    status: adversarialStatus === 'UNTESTED' ? 'ENSEMBLE_ADVERSARIALLY_UNTESTED' : 'ENSEMBLE_COMPOSED',
    question: asked,
    rawForecasterCount: independence.rawCount,
    effectiveIndependentCount: independence.effectiveIndependentCount,
    independenceRatio: independence.independenceRatio,
    clusters: independence.clusters,
    aggregatedDistribution: aggregated,
    ensembleModalOutcome,
    rawAgreementRate,
    evidentialAgreement,
    consensusClass,
    adversarialStatus,
    adversarialReview,
    // Never dropped, whatever the aggregate concluded.
    ecology: modelEcology(accepted, ensembleModalOutcome),
    immuneReview,
    rejectedSubmissions: rejected.length,
    // Only the discounted agreement reaches this. Correlated agreement cannot
    // raise a strength score the way genuine independence does.
    strength: strengthProfile({
      source_independence: independence.independenceRatio,
      model_agreement: evidentialAgreement
    }),
    stack,
    boundary: 'APPARENT AGREEMENT IS NOT INDEPENDENT EVIDENCE. TEN CORRELATED FORECASTERS ARE ONE OPINION REPEATED TEN TIMES.',
    businessEffectAuthority: 'NONE'
  };
}
