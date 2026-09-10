import crypto from 'node:crypto';

export const SOVEREIGN_EXPANSION_KERNEL_VERSION = 'uberbond.sovereign-expansion-kernel-1.0.0';

const ZERO_EXTERNAL_EFFECTS = Object.freeze({
  providerCalls: 0,
  messages: 0,
  purchases: 0,
  deployments: 0,
  credentialChanges: 0,
  dnsChanges: 0,
  productionMutations: 0,
  spendCents: 0
});

const lens = (id, name, purpose, questions) => Object.freeze({ id, name, purpose, questions: Object.freeze(questions) });

export const SOVEREIGN_EXPANSION_LENSES = Object.freeze([
  lens('missing-uberbond', 'The Missing UberBond', 'Maintain a negative image of capabilities, senses, models, evidence and interfaces absent from the current organism.', ['WHAT_IS_MISSING_FROM_UBERBOND_RIGHT_NOW', 'WHICH_MISSING_ORGAN_UNLOCKS_THE_MOST_DOWNSTREAM_CAPABILITY', 'WHAT_DO_WE_NOT_YET_KNOW_IS_MISSING']),
  lens('ontology-stress', 'Ontology Stress Test', 'Detect reality that current categories cannot represent without distortion and route it toward Ontogenesis.', ['WHICH_OBSERVATION_DOES_NOT_FIT_CURRENT_CATEGORIES', 'WHAT_NEW_CATEGORY_WOULD_REDUCE_DISTORTION', 'WHAT_EXISTING_CATEGORIES_WOULD_NEED_REBUILDING']),
  lens('theory-ecology', 'Theory Ecology', 'Preserve competing explanations and let predictions, falsifiers and reality evidence select among them.', ['WHAT_ARE_THE_STRONGEST_COMPETING_EXPLANATIONS', 'WHAT_DO_THEY_PREDICT_DIFFERENTLY', 'WHAT_OBSERVATION_WOULD_MOST_CHEAPLY_DISCRIMINATE_THEM']),
  lens('perspective-multiplication', 'Perspective Multiplication', 'Re-view a problem through genuinely different cognitive and disciplinary frames.', ['WHO_OR_WHAT_WOULD_MODEL_THIS_PROBLEM_DIFFERENTLY', 'WHICH_PERSPECTIVE_SEES_AN_AFFORDANCE_THE_DEFAULT_FRAME_MISSES', 'WHICH_PERSPECTIVES_ARE_CORRELATED_AND_SHOULD_NOT_COUNT_AS_INDEPENDENT']),
  lens('possibility-derivative', 'Possibility Derivative', 'Estimate how much future option-space an action or capability may unlock rather than scoring only immediate reward.', ['WHICH_ACTION_CREATES_THE_MOST_NEW_REACHABLE_OPTIONS', 'WHICH_UNLOCKED_OPTIONS_COMPOUND_FURTHER', 'WHICH_OPTION_LOOKS_SMALL_NOW_BUT_HAS_A_LARGE_SECOND_DERIVATIVE']),
  lens('counterfactual-branching', 'Counterfactual Branching', 'Maintain materially distinct alternate trajectories rather than one predicted future.', ['WHAT_FUTURES_OPEN_IF_THIS_PRIMITIVE_IS_REAL', 'WHAT_FUTURES_CLOSE', 'WHICH_ACTIONS_REMAIN_GOOD_ACROSS_MANY_PLAUSIBLE_BRANCHES']),
  lens('bottleneck-gradient', 'Bottleneck Gradient', 'Find the constraint blocking the largest amount of downstream progress.', ['WHAT_SINGLE_CONSTRAINT_BLOCKS_THE_MOST_VALUABLE_DESCENDANTS', 'IS_THE_BOTTLENECK_INFORMATION_CAPITAL_TIME_ENERGY_HARDWARE_PEOPLE_OR_SCIENCE', 'WHAT_ROUTE_AROUND_THE_BOTTLENECK_EXISTS']),
  lens('problem-compression', 'Problem Compression', 'Search for common causal roots that can collapse many surface problems at once.', ['WHICH_APPARENTLY_SEPARATE_PROBLEMS_SHARE_ONE_CAUSE', 'WHAT_ROOT_REMOVAL_WOULD_DELETE_THE_LARGEST_PROBLEM_CLUSTER', 'ARE_WE_TREATING_SYMPTOMS_AS_INDEPENDENT_PROBLEMS']),
  lens('unknown-unknown-probes', 'Unknown-Unknown Probes', 'Design probes specifically to expose surprises, anomalies and missing variables.', ['WHAT_WOULD_WE_NOTICE_IF_OUR_MODEL_WERE_WRONG', 'WHAT_ARE_WE_NOT_MEASURING', 'WHAT_SURPRISE_COULD_INVALIDATE_THE_WHOLE_FRAME']),
  lens('cognitive-dark-matter', 'Cognitive Dark Matter Telescope', 'Search for forms of intelligence and reasoning the current organism lacks.', ['WHAT_KIND_OF_REASONING_IS_MISSING', 'WHICH_HUMAN_MACHINE_OR_COLLECTIVE_CAN_DO_SOMETHING_UBERBOND_CANNOT', 'HOW_COULD_THAT_COGNITIVE_PRIMITIVE_BE_TESTED_AND_ASSIMILATED']),
  lens('scientific-negative-space', 'Scientific Negative Space', 'Search where research, experiments and cross-field connections are sparse rather than following attention density.', ['WHAT_IMPORTANT_EXPERIMENT_HAS_NOT_BEEN_RUN', 'WHICH_FIELDS_SHOULD_CITE_EACH_OTHER_BUT_RARELY_DO', 'WHICH_OLD_HYPOTHESIS_BECAME_TESTABLE_BECAUSE_TOOLS_CHANGED']),
  lens('instrument-invention', 'Instrument Invention', 'Treat inability to observe a variable as a prompt to invent a measurement pathway.', ['WHAT_CANNOT_BE_KNOWN_WITH_CURRENT_INSTRUMENTS', 'WHAT_INDIRECT_MEASUREMENT_COULD_ESTIMATE_IT', 'WHAT_NEW_SENSOR_WOULD_COLLAPSE_UNCERTAINTY']),
  lens('reality-affordance-field', 'Reality Affordance Field', 'Represent objects and environments by transformations they can support rather than their conventional labels.', ['WHAT_ELSE_CAN_THE_AVAILABLE_MATTER_DEVICE_SPACE_OR_NETWORK_DO', 'WHICH_HIDDEN_FUNCTIONS_EXIST_IN_EXISTING_COMPONENTS', 'WHAT_FUNCTION_APPEARS_IF_MULTIPLE_ORDINARY_OBJECTS_ARE_COMPOSED']),
  lens('substrate-liberation', 'Substrate Liberation', 'Describe required computation and interaction independently of current chips, vendors and device categories.', ['WHAT_FUNCTION_IS_BEING_CONFUSED_WITH_ITS_CURRENT_HARDWARE', 'WHAT_OTHER_PHYSICAL_SUBSTRATE_CAN_PERFORM_THE_TRANSFORMATION', 'WHICH_DEPENDENCY_PREVENTS_MIGRATION']),
  lens('energy-intelligence', 'Energy Intelligence', 'Model energy as a routed resource and search for lower-joule ways to sense, compute and act.', ['WHERE_IS_ENERGY_THE_REAL_BOTTLENECK', 'WHAT_SPECIALIZATION_REDUCES_JOULES_PER_USEFUL_RESULT', 'WHAT_AMBIENT_GRADIENTS_OR_WASTE_STREAMS_COULD_BECOME_INPUTS']),
  lens('environment-compiler', 'Environment Compiler', 'Treat rooms, devices and surroundings as configurable cognitive and physical infrastructure.', ['HOW_SHOULD_THE_ENVIRONMENT_CHANGE_FOR_THE_CURRENT_MODE', 'WHAT_CAN_BE_PREPARED_BEFORE_THE_FOUNDER_NOTICES_THE_NEED', 'WHAT_PART_OF_THE_INTERFACE_CAN_MOVE_INTO_THE_ENVIRONMENT']),
  lens('new-sense', 'New Sense Generator', 'Translate hidden variables into intuitive sensory channels rather than dashboards.', ['WHAT_VARIABLE_SHOULD_THE_FOUNDER_BE_ABLE_TO_FEEL', 'WHAT_EXISTING_SENSORY_CHANNEL_CAN_CARRY_IT_WITH_LOW_ATTENTION_COST', 'WHAT_TRAINING_WOULD_TURN_A_SIGNAL_INTO_AN_INTUITIVE_SENSE']),
  lens('new-actuator', 'New Actuator Generator', 'Search for new lawful ways to change reality beyond text responses.', ['WHAT_REALITY_CHANGE_IS_CURRENTLY_MANUAL', 'WHAT_SOFTWARE_DEVICE_ROBOT_ENVIRONMENT_OR_HUMAN_SKILL_COULD_ACTUATE_IT', 'WHAT_IS_THE_LOWEST_CONSEQUENCE_REVERSIBLE_PROTOTYPE']),
  lens('experience-scientist', 'Experience Scientist', 'Use lived experience as an information-gathering instrument when direct experience is uniquely informative.', ['WHAT_EXPERIENCE_WOULD_GENERATE_INFORMATION_NO_DATABASE_CAN', 'WHAT_SHOULD_BE_OBSERVED_WITHOUT_DESTROYING_THE_EXPERIENCE', 'HOW_DO_WE_SEPARATE_DISCOVERY_FROM_OPTIMIZATION']),
  lens('identity-polymorphism', 'Identity Polymorphism', 'Preserve multiple authentic founder modes rather than compressing a person into one optimized identity.', ['WHICH_AUTHENTIC_FOUNDER_MODE_IS_RELEVANT_HERE', 'WHICH_MODE_IS_BEING_STARVED_BY_CURRENT_ENVIRONMENT', 'HOW_CAN_MULTIPLE_IDENTITIES_COMPOUND_WITHOUT_BECOMING_A_PRISON']),
  lens('desire-horizon', 'Desire Horizon', 'Search for valuable possibilities the founder may not yet know enough to want.', ['WHAT_WORTHWHILE_POSSIBILITY_IS_OUTSIDE_CURRENT_EXPERIENCE', 'WHAT_EXPOSURE_COULD_REVEAL_A_NEW_PREFERENCE_WITHOUT_MANUFACTURING_IT', 'WHICH_DESIRES_SHOULD_REMAIN_UNTOUCHED']),
  lens('future-self-parliament', 'Future-Self Parliament', 'Represent consequences for materially different future versions of the founder.', ['WHICH_FUTURE_SELF_BENEFITS_OR_PAYS_FOR_THIS_CHOICE', 'WHICH_BRANCH_WOULD_REGRET_IRREVERSIBILITY', 'WHAT_OPTION_PRESERVES_DIALOGUE_WITH_MORE_FUTURE_SELVES']),
  lens('intertemporal-bridge', 'Intertemporal Bridge', 'Connect past evidence, current will and future possibility without giving historical selves authority over the present.', ['WHAT_DID_THE_FOUNDER_KNOW_THEN_THAT_IS_EASY_TO_FORGET_NOW', 'WHAT_CAN_THE_FOUNDER_LEAVE_FOR_A_FUTURE_SELF', 'WHICH_LONGITUDINAL_PATTERN_IS_ONLY_VISIBLE_ACROSS_YEARS']),
  lens('salience-sovereignty', 'Salience Sovereignty', 'Treat interruption, ordering, omission and emphasis as consequential cognitive actions.', ['DOES_THIS_DESERVE_INTERRUPTION_PREPARATION_DELAY_OR_SILENCE', 'WHAT_WAS_OMITTED_FROM_THE_PRESENTATION', 'WOULD_A_DIFFERENT_ORDER_CHANGE_THE_DECISION']),
  lens('mystery-preservation', 'Mystery Preservation', 'Protect experiences whose value can be damaged by prediction, spoilers, measurement or premature explanation.', ['WOULD_KNOWING_MORE_REDUCE_THE_VALUE_OF_LIVING_THIS', 'WHAT_SHOULD_UBERBOND_KNOW_BUT_NOT_SURFACE', 'WHICH_PART_SHOULD_REMAIN_DIRECTLY_EXPERIENCED']),
  lens('strategic-silence', 'Strategic Silence', 'Make non-intervention an explicit intelligent action when assistance would cost more than it helps.', ['WHAT_HAPPENS_IF_UBERBOND_SAYS_NOTHING', 'IS_THE_EXPECTED_VALUE_OF_INTERRUPTION_NEGATIVE', 'CAN_PREPARATION_HAPPEN_SILENTLY_UNTIL_NEEDED']),
  lens('memory-worlds', 'Memory Worlds', 'Reconstruct historically grounded past cognitive contexts rather than returning isolated records.', ['WHAT_DID_THE_WORLD_AND_FOUNDER_CONTEXT_LOOK_LIKE_AT_THAT_TIME', 'WHAT_WAS_UNKNOWN_THEN_THAT_IS_OBVIOUS_NOW', 'WHICH_LATER_NARRATIVE_IS_CONTAMINATING_THE_RECONSTRUCTION']),
  lens('capability-debt', 'Capability Debt', 'Track missing human or machine capabilities by downstream futures blocked.', ['WHICH_MISSING_CAPABILITY_BLOCKS_THE_MOST_FUTURES', 'SHOULD_IT_BE_LEARNED_ACQUIRED_AUTOMATED_OR_ROUTED_AROUND', 'WHAT_IS_THE_MINIMUM_TEST_OF_CAPABILITY_GAIN']),
  lens('human-capability-graph', 'Human Capability Graph', 'Model people, communities and institutions as sources of complementary expertise and perspective using lawful/consensual evidence.', ['WHO_OR_WHICH_COMMUNITY_HAS_THE_MISSING_CAPABILITY', 'WHAT_COMPLEMENTARITY_MATTERS_MORE_THAN_SIMILARITY', 'WHAT_CAN_BE_LEARNED_WITHOUT_CREATING_DEPENDENCE']),
  lens('civilization-of-minds', 'Civilization of Minds', 'Use diverse internal specialists, critics and forecasters as an ecology rather than one monolithic cognition.', ['WHICH_COGNITIVE_ROLES_SHOULD_DISAGREE_HERE', 'WHAT_INTERNAL_MARKET_OR_COURT_BEST_AGGREGATES_THEM', 'WHAT_FAILURE_MODE_COULD_CAPTURE_THE_WHOLE_ECOLOGY']),
  lens('self-transcending-search', 'Self-Transcending Search', 'Make each search method identify classes of answers it systematically cannot discover.', ['WHAT_CAN_THIS_SEARCH_METHOD_NEVER_FIND', 'WHAT_ASSUMPTION_MAKES_THE_GENERATOR_BLIND', 'WHAT_GENERATOR_SHOULD_REPLACE_OR_PREDATE_IT']),
  lens('anti-uberbond', 'Anti-UberBond', 'Continuously invent architectures and external changes that could make current UberBond obsolete.', ['WHAT_WOULD_MAKE_CURRENT_UBERBOND_IRRELEVANT', 'WHAT_COMPETITOR_OR_PARADIGM_WOULD_DESTROY_ITS_ADVANTAGE', 'WHAT_SHOULD_BE_CANNIBALIZED_BEFORE_SOMEONE_ELSE_DOES']),
  lens('semantic-compression-language', 'Semantic Compression Language', 'Develop private high-bandwidth representations that compress shared context without hiding uncertainty.', ['WHICH_REPEATED_CONCEPTUAL_STRUCTURE_DESERVES_A_SHORT_SYMBOL', 'WHAT_INFORMATION_MUST_NEVER_BE_LOST_IN_COMPRESSION', 'HOW_CAN_A_CONCEPT_PACKET_REMAIN_INSPECTABLE']),
  lens('reality-contact', 'Reality Contact Guarantee', 'Force internal sophistication back toward observations, experiments and consequences.', ['WHICH_CLAIM_IS_CURRENTLY_ONLY_MODEL_PROSE', 'WHAT_REALITY_CONTACT_WOULD_TEST_IT', 'WHAT_RESULT_WOULD_MAKE_UBERBOND_ABANDON_THE_IDEA']),
  lens('self-completion-attractor', 'Self-Completion Attractor', 'Maintain an executable difference between current UberBond and more capable reachable descendants.', ['WHAT_WOULD_A_STRONGER_UBERBOND_CONTAIN_THAT_THIS_ONE_LACKS', 'WHICH_GAP_CAN_CURRENT_UBERBOND_CLOSE_ITSELF', 'WHAT_NEW_GAP_BECOMES_VISIBLE_AFTER_THAT_CLOSURE']),
  lens('option-ecology', 'Option Ecology', 'Model options as interacting populations that can unlock, crowd out, preserve or destroy other options.', ['WHICH_OPTIONS_ARE_COMPLEMENTS', 'WHICH_OPTION_DESTROYS_TOO_MANY_FUTURE_BRANCHES', 'WHAT_SMALL_ACTION_CREATES_A_NEW_CLUSTER_OF_OPTIONS']),
  lens('uncopyable-coevolution', 'Uncopyable Coevolution', 'Seek value from longitudinal founder-specific adaptation rather than secrecy or static software alone.', ['WHAT_IMPROVEMENT_REQUIRES_YEARS_OF_PERSONAL_EVIDENCE', 'WHAT_CAN_A_COMPETITOR_COPY_TOMORROW', 'WHAT_COMPOUNDS_ONLY_THROUGH_FOUNDER_UBERBOND_COEVOLUTION']),
  lens('reversibility-geometry', 'Reversibility Geometry', 'Map which transitions can be undone, forked, delayed, staged or recovered.', ['WHERE_DOES_THIS_PATH_BECOME_HARD_TO_REVERSE', 'WHAT_CHECKPOINT_PRESERVES_EXIT', 'CAN_THE_SAME_INFORMATION_BE_GAINED_WITH_A_MORE_REVERSIBLE_MOVE']),
  lens('wonder-reserve', 'Wonder Reserve', 'Reserve capacity for curiosity and beauty that does not need immediate economic or productivity justification.', ['WHAT_IS_INTERESTING_EVEN_IF_IT_NEVER_PAYS', 'WHAT_EXPERIENCE_OR_QUESTION_DESERVES_A_CURIOSITY_BUDGET', 'WHAT_WOULD_BE_LOST_IF_EVERYTHING_HAD_TO_JUSTIFY_ITSELF']),
  lens('civilization-seed', 'Civilization Seed', 'Ask whether essential knowledge and capability can be reconstructed after substrate or provider loss.', ['WHAT_MUST_SURVIVE_FOR_THIS_CAPABILITY_TO_BE_REBUILT', 'WHAT_KNOWLEDGE_IS_CURRENTLY_TRAPPED_IN_A_VENDOR_OR_PERSON', 'WHAT_IS_THE_MINIMUM_SEED_THAT_CAN_REGENERATE_THE_LARGER_SYSTEM'])
]);

const envelope = extra => ({
  businessEffectAuthority: 'NONE',
  externalEffectAuthority: 'NONE',
  externalEffectLedger: structuredClone(ZERO_EXTERNAL_EFFECTS),
  ...extra
});

const cleanText = (value, max = 4000) => {
  const out = String(value ?? '').trim();
  return out && out.length <= max ? out : null;
};

const cleanList = (value, max = 512, itemMax = 1000) => {
  if (!Array.isArray(value) || value.length > max) return null;
  const out = [];
  const seen = new Set();
  for (const raw of value) {
    const item = cleanText(raw, itemMax);
    if (!item) return null;
    const key = item.toLowerCase();
    if (!seen.has(key)) { seen.add(key); out.push(item); }
  }
  return out;
};

const boundedInt = (value, min, max) => {
  const n = Number(value);
  return Number.isSafeInteger(n) && n >= min && n <= max ? n : null;
};

const boundedNumber = (value, min, max) => {
  const n = Number(value);
  return Number.isFinite(n) && n >= min && n <= max ? n : null;
};

export function validateSovereignExpansionKernel() {
  const reasons = [];
  const ids = new Set();
  const names = new Set();
  for (const item of SOVEREIGN_EXPANSION_LENSES) {
    if (!item.id || !item.name || !item.purpose || !Array.isArray(item.questions) || item.questions.length < 2) reasons.push(`invalid-lens:${item?.id || 'unknown'}`);
    if (ids.has(item.id)) reasons.push(`duplicate-lens-id:${item.id}`);
    if (names.has(item.name.toLowerCase())) reasons.push(`duplicate-lens-name:${item.name}`);
    ids.add(item.id); names.add(item.name.toLowerCase());
  }
  return envelope({
    ok: reasons.length === 0,
    status: reasons.length === 0 ? 'SOVEREIGN_EXPANSION_KERNEL_HEALTHY' : 'SOVEREIGN_EXPANSION_KERNEL_INVALID',
    version: SOVEREIGN_EXPANSION_KERNEL_VERSION,
    lensCount: SOVEREIGN_EXPANSION_LENSES.length,
    reasonCodes: reasons
  });
}

export function buildExpansionEnvelope({ context, affectedDomains = [], changedPrimitives = [], ideationGeneratorKeys = [], maxLenses = 16, seed = 'uberbond' } = {}) {
  const ctx = cleanText(context, 8000);
  const domains = cleanList(affectedDomains, 256, 500);
  const primitives = cleanList(changedPrimitives, 256, 1000);
  const generators = cleanList(ideationGeneratorKeys, 256, 500);
  const cap = boundedInt(maxLenses, 4, SOVEREIGN_EXPANSION_LENSES.length);
  const stableSeed = cleanText(seed, 500);
  const reasonCodes = [];
  if (!ctx) reasonCodes.push('context-required');
  if (!domains) reasonCodes.push('bounded-affected-domains-required');
  if (!primitives) reasonCodes.push('bounded-changed-primitives-required');
  if (!generators) reasonCodes.push('bounded-ideation-generator-keys-required');
  if (!cap) reasonCodes.push('bounded-max-lenses-required');
  if (!stableSeed) reasonCodes.push('seed-required');
  if (reasonCodes.length) return envelope({ ok: false, status: 'SOVEREIGN_EXPANSION_INVALID', reasonCodes });

  const mandatoryIds = ['missing-uberbond', 'ontology-stress', 'possibility-derivative', 'bottleneck-gradient', 'reality-contact', 'self-completion-attractor'];
  const mandatory = mandatoryIds.map(id => SOVEREIGN_EXPANSION_LENSES.find(item => item.id === id));
  const remaining = SOVEREIGN_EXPANSION_LENSES
    .filter(item => !mandatoryIds.includes(item.id))
    .map(item => ({ item, score: crypto.createHash('sha256').update(`${stableSeed}|${ctx}|${domains.join('|')}|${primitives.join('|')}|${item.id}`).digest('hex') }))
    .sort((a, b) => a.score.localeCompare(b.score) || a.item.id.localeCompare(b.item.id))
    .map(row => row.item);
  const selected = [...mandatory, ...remaining].slice(0, cap).map(item => ({ ...item, mode: 'RESEARCH_AND_QUESTION_GENERATION_ONLY' }));

  return envelope({
    ok: true,
    status: 'SOVEREIGN_EXPANSION_READY',
    version: SOVEREIGN_EXPANSION_KERNEL_VERSION,
    context: ctx,
    affectedDomains: domains,
    changedPrimitives: primitives,
    ideationGeneratorKeys: generators,
    totalLensCount: SOVEREIGN_EXPANSION_LENSES.length,
    selectedLensCount: selected.length,
    selectedLenses: selected,
    terminalQuestions: [
      'WHAT_DIMENSION_OF_REALITY_IS_MISSING_FROM_THE_CURRENT_MODEL',
      'WHAT_CAPABILITY_WOULD_MULTIPLY_THE_VALUE_OF_MANY_OTHER_CAPABILITIES',
      'WHAT_WOULD_A_STRONGER_UBERBOND_NOTICE_THAT_CURRENT_UBERBOND_CANNOT',
      'WHAT_SHOULD_REMAIN_UNOPTIMIZED_UNMODELED_OR_UNREVEALED',
      'WHAT_REQUIRES_REALITY_TO_COMPUTE_THE_ANSWER',
      'WHAT_NEW_CATEGORY_SHOULD_EXIST'
    ],
    executionRule: 'EXPAND_INTERNAL_SEARCH_SPACE_ONLY__EXTERNAL_ACTION_REQUIRES_SEPARATE_EXISTING_AUTHORITY_AND_EVIDENCE',
    claimBoundary: 'EXPANSION_LENSES_AND_QUESTIONS_ARE_NOT_FACTS_DISCOVERIES_CAPABILITIES_OUTCOMES_OR_ASI_PROOF'
  });
}

export function buildMissingUberBondLedger({ desiredCapabilities = [], currentCapabilities = [], blindSpots = [], externalBlockers = [] } = {}) {
  const desired = cleanList(desiredCapabilities, 4096, 500);
  const current = cleanList(currentCapabilities, 4096, 500);
  const blind = cleanList(blindSpots, 2048, 1000);
  const blockers = cleanList(externalBlockers, 2048, 1000);
  if (![desired, current, blind, blockers].every(Boolean)) return envelope({ ok: false, status: 'MISSING_UBERBOND_LEDGER_INVALID', reasonCodes: ['bounded-string-lists-required'] });
  const present = new Set(current.map(item => item.toLowerCase()));
  const missing = desired.filter(item => !present.has(item.toLowerCase())).map(capability => ({ capability, status: 'MISSING_OR_UNVERIFIED', authority: 'NONE' }));
  return envelope({ ok: true, status: 'MISSING_UBERBOND_LEDGER_READY', missing, blindSpots: blind, externalBlockers: blockers, claimBoundary: 'ABSENCE_FROM_CURRENT_LIST_IS_A_GAP_CANDIDATE_NOT_PROOF_OF_IMPOSSIBILITY' });
}

export function buildTheoryEcology({ question, theories = [] } = {}) {
  const q = cleanText(question, 4000);
  if (!q || !Array.isArray(theories) || theories.length < 2 || theories.length > 64) return envelope({ ok: false, status: 'THEORY_ECOLOGY_INVALID', reasonCodes: ['question-and-2-to-64-theories-required'] });
  const normalized = [];
  const ids = new Set();
  for (const raw of theories) {
    const id = cleanText(raw?.id, 200)?.toLowerCase();
    const summary = cleanText(raw?.summary, 4000);
    const predictions = cleanList(raw?.predictions || [], 128, 1000);
    const falsifiers = cleanList(raw?.falsifiers || [], 128, 1000);
    const evidenceRefs = cleanList(raw?.evidenceRefs || [], 128, 2000);
    if (!id || !summary || !predictions || !falsifiers || !evidenceRefs || ids.has(id)) return envelope({ ok: false, status: 'THEORY_ECOLOGY_INVALID', reasonCodes: ['valid-unique-theories-required'] });
    ids.add(id);
    normalized.push({ id, summary, predictions, falsifiers, evidenceRefs, state: 'COMPETING_HYPOTHESIS' });
  }
  return envelope({ ok: true, status: 'THEORY_ECOLOGY_READY', question: q, theories: normalized, selectionRule: 'NO_WINNER_WITHOUT_DISCRIMINATING_EVIDENCE_OR_EXPLICIT_UNCERTAINTY', claimBoundary: 'THEORY_MEMBERSHIP_IS_NOT_TRUTH' });
}

export function scorePossibilityDerivative({ options = [] } = {}) {
  if (!Array.isArray(options) || options.length < 1 || options.length > 512) return envelope({ ok: false, status: 'POSSIBILITY_DERIVATIVE_INVALID', reasonCodes: ['bounded-options-required'] });
  const rows = [];
  for (const raw of options) {
    const id = cleanText(raw?.id, 240);
    const unlocked = cleanList(raw?.unlockedOptions || [], 2048, 500);
    const crossDomains = boundedInt(raw?.crossDomainCount ?? 0, 0, 1000);
    const reversibility = boundedNumber(raw?.reversibility ?? 0.5, 0, 1);
    const evidenceStrength = boundedNumber(raw?.evidenceStrength ?? 0, 0, 1);
    const timeToFeedbackDays = boundedNumber(raw?.timeToFeedbackDays ?? 365, 0, 36500);
    if (!id || !unlocked || crossDomains === null || reversibility === null || evidenceStrength === null || timeToFeedbackDays === null) return envelope({ ok: false, status: 'POSSIBILITY_DERIVATIVE_INVALID', reasonCodes: ['valid-option-fields-required'] });
    const rawScore = unlocked.length * 4 + crossDomains * 2 + reversibility * 10 + evidenceStrength * 8 + 12 / (1 + timeToFeedbackDays / 30);
    rows.push({ id, unlockedOptionCount: unlocked.length, crossDomainCount: crossDomains, reversibility, evidenceStrength, timeToFeedbackDays, possibilityDerivativeScore: Number(rawScore.toFixed(6)) });
  }
  rows.sort((a, b) => b.possibilityDerivativeScore - a.possibilityDerivativeScore || a.id.localeCompare(b.id));
  return envelope({ ok: true, status: 'POSSIBILITY_DERIVATIVE_SCORED', options: rows, scoringBoundary: 'HEURISTIC_FOR_SEARCH_PRIORITY_NOT_A_VALUE_FUNCTION_OR_CHOICE', claimBoundary: 'HIGH_SCORE_DOES_NOT_AUTHORIZE_ACTION_OR_PROVE_GOOD_LIFE_VALUE' });
}

export function rankBottleneckGradient({ constraints = [] } = {}) {
  if (!Array.isArray(constraints) || constraints.length < 1 || constraints.length > 512) return envelope({ ok: false, status: 'BOTTLENECK_GRADIENT_INVALID', reasonCodes: ['bounded-constraints-required'] });
  const rows = [];
  for (const raw of constraints) {
    const id = cleanText(raw?.id, 240);
    const blockedOptions = boundedInt(raw?.blockedOptions, 0, 1_000_000);
    const unlockProbability = boundedNumber(raw?.unlockProbability, 0, 1);
    const evidenceStrength = boundedNumber(raw?.evidenceStrength, 0, 1);
    const effortUnits = boundedNumber(raw?.effortUnits, 0.01, 1_000_000);
    if (!id || blockedOptions === null || unlockProbability === null || evidenceStrength === null || effortUnits === null) return envelope({ ok: false, status: 'BOTTLENECK_GRADIENT_INVALID', reasonCodes: ['valid-constraint-fields-required'] });
    const score = blockedOptions * unlockProbability * (0.25 + 0.75 * evidenceStrength) / Math.sqrt(effortUnits);
    rows.push({ id, blockedOptions, unlockProbability, evidenceStrength, effortUnits, bottleneckGradientScore: Number(score.toFixed(6)) });
  }
  rows.sort((a, b) => b.bottleneckGradientScore - a.bottleneckGradientScore || a.id.localeCompare(b.id));
  return envelope({ ok: true, status: 'BOTTLENECK_GRADIENT_RANKED', constraints: rows, scoringBoundary: 'SEARCH_HEURISTIC_ONLY__REALITY_VALIDATION_REQUIRED_BEFORE_RESOURCE_COMMITMENT' });
}

export function buildMysteryPreservationContract({ protectedDomains = [] } = {}) {
  if (!Array.isArray(protectedDomains) || protectedDomains.length > 128) return envelope({ ok: false, status: 'MYSTERY_PRESERVATION_INVALID', reasonCodes: ['bounded-protected-domains-required'] });
  const rules = [];
  for (const raw of protectedDomains) {
    const domain = cleanText(raw?.domain, 300);
    const mode = cleanText(raw?.mode, 100);
    if (!domain || !['DO_NOT_MODEL', 'MODEL_BUT_DO_NOT_SURFACE', 'NO_PREDICTION', 'NO_SPOILERS', 'DIRECT_EXPERIENCE_FIRST'].includes(mode)) return envelope({ ok: false, status: 'MYSTERY_PRESERVATION_INVALID', reasonCodes: ['valid-domain-and-mode-required'] });
    rules.push({ domain, mode, source: 'FOUNDER_DECLARED' });
  }
  return envelope({ ok: true, status: 'MYSTERY_PRESERVATION_READY', rules, enforcementPrinciple: 'MORE_INFORMATION_IS_NOT_AUTOMATIC_PERMISSION_TO_SURFACE_OR_OPTIMIZE' });
}
