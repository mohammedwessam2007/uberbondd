// A life decision described on every dimension it touches, and never collapsed.
//
// The canon rule this exists to hold is one sentence: no single metric defines a
// good life. That is easy to agree with and almost impossible to keep, because
// every comparison wants a number, and the moment dimensions become
// commensurable something has decided the exchange rate between meaning and
// money. The exchange rate is the value judgment. It is not the system's.
//
// So this module refuses the one operation everything downstream will ask for:
// it will not produce a total. It reports where options dominate, where they
// trade off, and which trades are the founder's to make -- which is more useful
// than a score and considerably harder to hide behind.
export const LIFE_DECISION_DIMENSIONS_VERSION = 'uberbond.life-decision-dimensions.v1';

/**
 * The dimensions a life decision may touch.
 *
 * Taken from canon rather than invented, and unweighted on purpose. A default
 * weight vector shipped here would be an imposed worldview wearing the clothes
 * of a default.
 */
export const LIFE_DIMENSIONS = Object.freeze([
  'agency', 'optionality', 'reversibility', 'learning', 'capability_gain',
  'meaning', 'joy', 'relationships_and_community', 'creativity',
  'health_supporting_impact', 'time_cost', 'financial_cost', 'risk',
  'downside_severity', 'long_term_compounding', 'uniqueness_and_memory_value',
  'geographic_freedom', 'future_opportunity_creation',
  'founder_preferences_and_values', 'uncertainty_and_evidence_quality'
]);

/** Dimensions where more is worse, so a naive comparison inverts them. */
export const COST_DIMENSIONS = Object.freeze([
  'time_cost', 'financial_cost', 'risk', 'downside_severity'
]);

const text = (value, max = 2000) => {
  const out = String(value ?? '').trim();
  return out && out.length <= max ? out : null;
};

const fail = (status, reasonCodes, extra = {}) => ({
  ok: false, status, reasonCodes: [...new Set(reasonCodes.filter(Boolean))],
  businessEffectAuthority: 'NONE', ...extra
});

const better = (dimension, a, b) => (COST_DIMENSIONS.includes(dimension) ? a < b : a > b);

/** Normalizes one option's scores, keeping unscored dimensions unscored. */
export function scoreOption(input = {}) {
  const name = text(input?.name, 240);
  if (!name) return fail('LIFE_OPTION_INVALID', ['option-name-required']);

  const scores = {};
  for (const [dimension, value] of Object.entries(input?.scores || {})) {
    if (!LIFE_DIMENSIONS.includes(dimension)) continue;
    const magnitude = Number(value);
    if (Number.isFinite(magnitude) && magnitude >= 0 && magnitude <= 1) scores[dimension] = magnitude;
  }

  return {
    ok: true,
    status: 'LIFE_OPTION_SCORED',
    option: {
      name,
      scores,
      // Kept apart from a zero. An unscored dimension is one nobody assessed;
      // a zero is an assessment. Collapsing them lets silence read as a finding.
      scored: Object.keys(scores).sort(),
      unscored: LIFE_DIMENSIONS.filter(dimension => !Object.hasOwn(scores, dimension))
    },
    businessEffectAuthority: 'NONE'
  };
}

/**
 * Compares options without producing a total.
 *
 * Dominance is the only comparison that needs no exchange rate: A dominates B
 * when it is at least as good everywhere both were scored and better somewhere.
 * Everything else is a tradeoff, and a tradeoff is reported as one rather than
 * resolved.
 */
export function compareLifeOptions(options = []) {
  const rows = [];
  for (const input of (Array.isArray(options) ? options : [])) {
    const scored = scoreOption(input);
    if (scored.ok) rows.push(scored.option);
  }
  if (rows.length < 2) return fail('LIFE_COMPARISON_INVALID', ['at-least-two-options-required']);

  const dominations = [];
  const tradeoffs = [];

  for (const a of rows) {
    for (const b of rows) {
      if (a === b) continue;
      // With no shared dimension there is nothing to compare -- reporting
      // dominance would mean "better on the things nobody measured". No early
      // return is needed for that: an empty `shared` yields an empty `wins`,
      // and both branches below require a win. An explicit guard here survived
      // its mutation because it could not change any output, which is the
      // signature of a redundant guard rather than an untested one.
      const shared = a.scored.filter(dimension => b.scored.includes(dimension));
      const wins = shared.filter(dimension => better(dimension, a.scores[dimension], b.scores[dimension]));
      const losses = shared.filter(dimension => better(dimension, b.scores[dimension], a.scores[dimension]));

      if (wins.length && losses.length === 0) {
        dominations.push({ better: a.name, worse: b.name, on: wins, comparedOn: shared });
      } else if (wins.length && losses.length) {
        // Recorded once per unordered pair; the mirror carries no new fact.
        if (a.name < b.name) tradeoffs.push({ between: [a.name, b.name], gains: wins, costs: losses });
      }
    }
  }

  return {
    ok: true,
    status: 'LIFE_OPTIONS_COMPARED',
    options: rows.map(row => ({ name: row.name, scored: row.scored, unscored: row.unscored })),
    dominations,
    tradeoffs,
    // The line that makes this module worth having. Stated on the object so a
    // caller cannot mistake the absence of a total for an omission.
    noTotal: 'THESE DIMENSIONS ARE NOT COMMENSURABLE. NO WEIGHTED TOTAL IS PRODUCED, BECAUSE THE WEIGHTS WOULD BE THE VALUE JUDGMENT.',
    founderDecides: tradeoffs.length > 0,
    businessEffectAuthority: 'NONE'
  };
}

/**
 * Asks how optimizing a proxy could destroy the thing it stands for.
 *
 * Applied to the system's own preferred measures too, which is the only version
 * that helps -- a Goodhart check that exempts the metrics you like is a way of
 * feeling careful.
 */
export function goodhartRisk({ metric = null, standsFor = null, optimizedBy = [] } = {}) {
  const name = text(metric, 240);
  const represents = text(standsFor, 500);
  if (!name || !represents) return fail('GOODHART_CHECK_INVALID', ['metric-and-what-it-stands-for-required']);

  const routes = (Array.isArray(optimizedBy) ? optimizedBy : []).map(route => text(route, 500)).filter(Boolean);
  return {
    ok: true,
    status: routes.length ? 'PROXY_DIVERGENCE_POSSIBLE' : 'NO_DIVERGENCE_ROUTE_IDENTIFIED',
    metric: name,
    standsFor: represents,
    divergenceRoutes: routes,
    truthBoundary: routes.length
      ? 'A ROUTE FROM MAXIMIZING THIS PROXY TO LOSING WHAT IT REPRESENTS HAS BEEN IDENTIFIED.'
      : 'NO ROUTE WAS IDENTIFIED, WHICH IS NOT THE SAME AS NONE EXISTING.',
    businessEffectAuthority: 'NONE'
  };
}
