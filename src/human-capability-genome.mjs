// Human capability as a dependency graph, and what growing it costs elsewhere.
// Low scores remain evidence-relative observations, never silent trait verdicts.
export const HUMAN_CAPABILITY_GENOME_VERSION = 'uberbond.human-capability-genome.v1.2';

export const ASSESSMENT_BASIS = Object.freeze([
  'SINGLE_OBSERVATION', 'SELF_REPORT', 'REPEATED_OBSERVATION',
  'VARIED_CONDITIONS', 'LONGITUDINAL'
]);

export const LOW_SCORE_EXPLANATIONS = Object.freeze([
  'INSUFFICIENT_EXPOSURE', 'ENVIRONMENT_EFFECT', 'TEMPORARY_STATE',
  'SKILL_GAP', 'DURABLE_LIMIT'
]);

export const CAPABILITY_TRAJECTORY = Object.freeze([
  'STRENGTHENING', 'MAINTAINED', 'DELEGATED', 'ATROPHYING', 'ABANDONED_ON_PURPOSE'
]);

const text = (value, max = 2000) => {
  const out = String(value ?? '').trim();
  return out && out.length <= max ? out : null;
};

const fail = (status, reasonCodes, extra = {}) => ({
  ok: false,
  status,
  reasonCodes: [...new Set(reasonCodes.filter(Boolean))],
  businessEffectAuthority: 'NONE',
  ...extra
});

const uniqueText = (values, max = 80) => [...new Set(
  (Array.isArray(values) ? values : []).map(value => text(value, 240)).filter(Boolean)
)].slice(0, max);

export const supportsDurableClaim = basis =>
  ASSESSMENT_BASIS.indexOf(basis) >= ASSESSMENT_BASIS.indexOf('VARIED_CONDITIONS');

export function capabilityAtom(input = {}) {
  const name = text(input?.name, 240);
  if (!name) return fail('CAPABILITY_INVALID', ['capability-name-required']);

  const basis = ASSESSMENT_BASIS.includes(input?.basis) ? input.basis : null;
  if (!basis) return fail('CAPABILITY_INVALID', ['assessment-basis-required'], {
    note: 'A level with no stated basis cannot be told apart from a guess.'
  });

  const level = Number(input?.level);
  if (!Number.isFinite(level) || level < 0 || level > 1) {
    return fail('CAPABILITY_INVALID', ['level-must-be-zero-to-one']);
  }

  const explanation = LOW_SCORE_EXPLANATIONS.includes(input?.explanation) ? input.explanation : null;
  if (explanation === 'DURABLE_LIMIT' && !supportsDurableClaim(basis)) {
    return fail('CAPABILITY_CLAIM_REFUSED', ['durable-limit-requires-varied-or-longitudinal-evidence'], {
      capability: name,
      basis,
      note: 'Inexperience under one set of conditions is not a limit. Recording it as one decides something about a person the evidence does not support.'
    });
  }

  return {
    ok: true,
    status: 'CAPABILITY_RECORDED',
    capability: {
      name,
      level,
      basis,
      explanation,
      provisional: !supportsDurableClaim(basis),
      dependsOn: uniqueText(input?.dependsOn).sort(),
      unlocks: uniqueText(input?.unlocks).sort(),
      trajectory: CAPABILITY_TRAJECTORY.includes(input?.trajectory) ? input.trajectory : null
    },
    businessEffectAuthority: 'NONE'
  };
}

function normalizeRequirement(value, index) {
  if (typeof value === 'string') {
    const name = text(value, 240);
    return name ? {
      id: `required:${name}`,
      label: name,
      mode: 'ANY_OF',
      members: [name],
      minimumLevel: null,
      criticality: 1,
      sourceIndex: index
    } : null;
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;

  const capability = text(value.capability ?? value.name, 240);
  const substitutes = uniqueText(value.substitutes);
  const anyOf = uniqueText(value.anyOf);
  const allOf = uniqueText(value.allOf);
  const groups = [Boolean(anyOf.length), Boolean(allOf.length), Boolean(capability || substitutes.length)].filter(Boolean).length;
  if (groups !== 1) return null;

  const members = allOf.length ? allOf : anyOf.length ? anyOf : uniqueText([capability, ...substitutes]);
  if (!members.length) return null;

  const minimumRaw = value.minimumLevel;
  const minimumLevel = minimumRaw === undefined || minimumRaw === null ? null : Number(minimumRaw);
  if (minimumLevel !== null && (!Number.isFinite(minimumLevel) || minimumLevel < 0 || minimumLevel > 1)) return null;

  const criticalityRaw = value.criticality;
  const criticality = criticalityRaw === undefined || criticalityRaw === null ? 1 : Number(criticalityRaw);
  if (!Number.isFinite(criticality) || criticality <= 0 || criticality > 1) return null;

  const mode = allOf.length ? 'ALL_OF' : 'ANY_OF';
  return {
    id: text(value.id, 240) || `required:${index}:${members.join('|')}`,
    label: text(value.label, 240) || (mode === 'ALL_OF' ? members.join(' + ') : capability || members.join(' OR ')),
    mode,
    members,
    minimumLevel,
    criticality,
    sourceIndex: index
  };
}

function rankClass(reason) {
  if (reason === 'DEPENDENCY_CYCLE') return 6;
  if (reason === 'DEPENDENCY_ABSENT' || reason === 'DEPENDENCY_UNUSABLE') return 5;
  if (reason === 'JOINT_PREREQUISITE_SET') return 5;
  if (reason === 'ABSENT' || reason === 'ALTERNATIVE_SET_ABSENT') return 4;
  if (reason === 'JOINT_PREREQUISITE_MEMBER_ABSENT') return 4;
  if (reason === 'GOAL_THRESHOLD_DEFICIT' || reason === 'JOINT_PREREQUISITE_MEMBER_BELOW_THRESHOLD') return 3;
  return 1;
}

function rankTuple(constraint) {
  return [
    rankClass(constraint.reason),
    Number(constraint.downstreamBlocked || 0),
    Number(constraint.goalUnlock === true),
    Number(constraint.criticality || 0),
    Number(constraint.deficit || 0)
  ];
}

function compareRank(a, b) {
  const left = rankTuple(a);
  const right = rankTuple(b);
  for (let i = 0; i < left.length; i += 1) {
    if (left[i] !== right[i]) return right[i] - left[i];
  }
  return String(a.capability || a.label || '').localeCompare(String(b.capability || b.label || ''));
}

function sameRank(a, b) {
  if (!a || !b) return false;
  const left = rankTuple(a);
  const right = rankTuple(b);
  return left.every((value, index) => value === right[index]);
}

function dependencyConstraints({ root, requirement, have, goal }) {
  const constraints = [];
  const visit = (name, path = []) => {
    if (path.includes(name)) {
      constraints.push({
        capability: name,
        reason: 'DEPENDENCY_CYCLE',
        dependencyPath: [...path, name],
        blockedCapability: root,
        criticality: requirement.criticality,
        downstreamBlocked: path.length,
        goalUnlock: false,
        requirementId: requirement.id
      });
      return;
    }
    const row = have.get(name);
    if (!row) return;
    for (const dependency of uniqueText(row.dependsOn)) {
      const dep = have.get(dependency);
      if (!dep) {
        constraints.push({
          capability: dependency,
          reason: 'DEPENDENCY_ABSENT',
          blockedCapability: name,
          dependencyPath: [...path, name, dependency],
          criticality: requirement.criticality,
          downstreamBlocked: path.length + 1,
          goalUnlock: false,
          requirementId: requirement.id
        });
        continue;
      }
      if (Number(dep.level) <= 0) {
        constraints.push({
          capability: dependency,
          reason: 'DEPENDENCY_UNUSABLE',
          level: dep.level,
          blockedCapability: name,
          dependencyPath: [...path, name, dependency],
          criticality: requirement.criticality,
          downstreamBlocked: path.length + 1,
          goalUnlock: uniqueText(dep.unlocks).includes(goal),
          requirementId: requirement.id
        });
        continue;
      }
      visit(dependency, [...path, name]);
    }
  };
  visit(root, []);
  return constraints;
}

function routeSeverity(route) {
  if (!route.dependencies.length) return route.thresholdSatisfied ? 0 : 1;
  const worst = [...route.dependencies].sort(compareRank)[0];
  return 10 + rankClass(worst.reason);
}

function compareAlternativeRoutes(a, b) {
  const severityDelta = routeSeverity(a) - routeSeverity(b);
  if (severityDelta !== 0) return severityDelta;
  if (a.dependencies.length !== b.dependencies.length) return a.dependencies.length - b.dependencies.length;
  if (a.row.level !== b.row.level) return b.row.level - a.row.level;
  return a.row.name.localeCompare(b.row.name);
}

/**
 * Find the goal-relative binding constraint. Simple string requirements retain
 * the historical API. Structured contracts add substitutes, ANY_OF routes,
 * ALL_OF joint prerequisites, goal thresholds, criticality and dependency
 * traversal. Array order is never allowed to become causal evidence.
 */
export function findBottleneck({ goal = null, capabilities = [], required = [] } = {}) {
  const target = text(goal, 500);
  if (!target) return fail('BOTTLENECK_INVALID', ['goal-required']);

  const have = new Map();
  for (const row of (Array.isArray(capabilities) ? capabilities : [])) {
    if (row?.name) have.set(row.name, row);
  }

  const supplied = Array.isArray(required) ? required : [];
  if (!supplied.length) return fail('BOTTLENECK_INVALID', ['required-capabilities-required']);
  const requirements = supplied.map(normalizeRequirement);
  if (requirements.some(row => !row)) {
    return fail('BOTTLENECK_INVALID', ['required-capability-contract-invalid'], {
      note: 'A requirement must be a capability string, one ANY_OF route, one ALL_OF joint set, or capability+substitutes with valid optional minimumLevel/criticality.'
    });
  }

  const constraints = [];
  const fallback = [];
  const substitutionsUsed = [];
  const analysis = [];

  for (const requirement of requirements) {
    if (requirement.mode === 'ANY_OF') {
      const present = requirement.members.map(name => have.get(name)).filter(Boolean);
      if (!present.length) {
        constraints.push({
          capability: requirement.members.length === 1 ? requirement.members[0] : requirement.label,
          reason: requirement.members.length === 1 ? 'ABSENT' : 'ALTERNATIVE_SET_ABSENT',
          alternatives: requirement.members,
          criticality: requirement.criticality,
          downstreamBlocked: 0,
          goalUnlock: false,
          requirementId: requirement.id
        });
        analysis.push({ requirementId: requirement.id, mode: requirement.mode, status: 'UNSATISFIED', chosen: null });
        continue;
      }

      // Evaluate every available route before choosing one. A high score on a
      // route with a broken dependency is not evidence that it is the best path.
      const routes = present.map(row => ({
        row,
        dependencies: dependencyConstraints({ root: row.name, requirement, have, goal: target }),
        thresholdSatisfied: requirement.minimumLevel === null || row.level >= requirement.minimumLevel
      })).sort(compareAlternativeRoutes);
      const chosenRoute = routes[0];
      const chosen = chosenRoute.row;

      if (requirement.members.length > 1 && chosen.name !== requirement.members[0]) {
        substitutionsUsed.push({ requirementId: requirement.id, requested: requirement.members[0], used: chosen.name });
      }

      if (!chosenRoute.thresholdSatisfied) {
        constraints.push({
          capability: chosen.name,
          reason: 'GOAL_THRESHOLD_DEFICIT',
          level: chosen.level,
          minimumLevel: requirement.minimumLevel,
          deficit: requirement.minimumLevel - chosen.level,
          alternatives: requirement.members,
          criticality: requirement.criticality,
          downstreamBlocked: 0,
          goalUnlock: uniqueText(chosen.unlocks).includes(target),
          requirementId: requirement.id
        });
      } else if (!chosenRoute.dependencies.length) {
        fallback.push({ ...chosen, requirementId: requirement.id, criticality: requirement.criticality });
      }

      constraints.push(...chosenRoute.dependencies);
      analysis.push({
        requirementId: requirement.id,
        mode: requirement.mode,
        status: !chosenRoute.dependencies.length && chosenRoute.thresholdSatisfied
          ? 'ROUTE_SATISFIED'
          : chosenRoute.dependencies.length ? 'ROUTE_DEPENDENCY_BLOCKED' : 'BELOW_THRESHOLD',
        chosen: chosen.name,
        alternatives: requirement.members,
        minimumLevel: requirement.minimumLevel,
        evaluatedRoutes: routes.map(route => ({
          capability: route.row.name,
          level: route.row.level,
          thresholdSatisfied: route.thresholdSatisfied,
          dependencyBlockers: route.dependencies.map(entry => entry.reason)
        }))
      });
      continue;
    }

    const memberState = requirement.members.map(name => ({ name, row: have.get(name) || null }));
    const unsatisfied = memberState.filter(({ row }) => !row || (requirement.minimumLevel !== null && row.level < requirement.minimumLevel));
    if (unsatisfied.length > 1) {
      constraints.push({
        capability: requirement.label,
        label: requirement.label,
        reason: 'JOINT_PREREQUISITE_SET',
        members: unsatisfied.map(({ name, row }) => ({
          capability: name,
          present: Boolean(row),
          level: row?.level ?? null,
          minimumLevel: requirement.minimumLevel,
          deficit: row && requirement.minimumLevel !== null ? requirement.minimumLevel - row.level : null
        })),
        criticality: requirement.criticality,
        downstreamBlocked: unsatisfied.length,
        goalUnlock: false,
        requirementId: requirement.id
      });
    } else if (unsatisfied.length === 1) {
      const { name, row } = unsatisfied[0];
      constraints.push({
        capability: name,
        reason: row ? 'JOINT_PREREQUISITE_MEMBER_BELOW_THRESHOLD' : 'JOINT_PREREQUISITE_MEMBER_ABSENT',
        level: row?.level ?? null,
        minimumLevel: requirement.minimumLevel,
        deficit: row && requirement.minimumLevel !== null ? requirement.minimumLevel - row.level : null,
        jointRequirement: requirement.label,
        criticality: requirement.criticality,
        downstreamBlocked: requirement.members.length - 1,
        goalUnlock: row ? uniqueText(row.unlocks).includes(target) : false,
        requirementId: requirement.id
      });
    }

    for (const { name, row } of memberState) {
      if (!row) continue;
      if (requirement.minimumLevel === null || row.level >= requirement.minimumLevel) {
        fallback.push({ ...row, requirementId: requirement.id, criticality: requirement.criticality });
      }
      constraints.push(...dependencyConstraints({ root: name, requirement, have, goal: target }));
    }
    analysis.push({
      requirementId: requirement.id,
      mode: requirement.mode,
      status: unsatisfied.length ? 'JOINT_UNSATISFIED' : 'JOINT_SATISFIED',
      members: requirement.members,
      minimumLevel: requirement.minimumLevel
    });
  }

  const dedupedConstraints = [];
  const seen = new Set();
  for (const constraint of constraints) {
    const identity = JSON.stringify([
      constraint.reason,
      constraint.capability,
      constraint.requirementId,
      constraint.blockedCapability || null,
      constraint.members || null
    ]);
    if (!seen.has(identity)) {
      seen.add(identity);
      dedupedConstraints.push(constraint);
    }
  }

  dedupedConstraints.sort(compareRank);
  let status;
  let bottleneck;
  let competingConstraints = [];

  if (dedupedConstraints.length) {
    const first = dedupedConstraints[0];
    const tied = dedupedConstraints.filter(row => sameRank(row, first));
    if (tied.length > 1) {
      status = 'BOTTLENECK_UNDERDETERMINED';
      bottleneck = null;
      competingConstraints = tied;
    } else {
      status = 'BOTTLENECK_IDENTIFIED';
      bottleneck = first;
    }
  } else {
    const weakest = fallback.sort((a, b) => a.level - b.level)[0] || null;
    bottleneck = weakest ? {
      capability: weakest.name,
      reason: 'WEAKEST_PRESENT',
      level: weakest.level,
      criticality: weakest.criticality,
      requirementId: weakest.requirementId
    } : null;
    status = bottleneck ? 'BOTTLENECK_IDENTIFIED' : 'NO_BINDING_CONSTRAINT_FOUND';
  }

  const absentReasons = new Set(['ABSENT', 'ALTERNATIVE_SET_ABSENT', 'JOINT_PREREQUISITE_MEMBER_ABSENT', 'DEPENDENCY_ABSENT']);
  const missing = [...new Set(dedupedConstraints.filter(row => absentReasons.has(row.reason)).flatMap(row =>
    Array.isArray(row.alternatives) && row.reason === 'ALTERNATIVE_SET_ABSENT' ? row.alternatives : [row.capability]
  ).filter(Boolean))];

  return {
    ok: true,
    status,
    goal: target,
    bottleneck,
    missing,
    substitutionsUsed,
    competingConstraints,
    requirementAnalysis: analysis,
    unlocks: bottleneck?.capability && have.has(bottleneck.capability) ? (have.get(bottleneck.capability)?.unlocks || []) : [],
    nextEvidenceRequired: status === 'BOTTLENECK_UNDERDETERMINED'
      ? 'Add goal-specific criticality, threshold, dependency, or outcome evidence. Array order is not evidence.'
      : null,
    law: 'EFFORT_ON_A_NON_BINDING_DIMENSION_FEELS_PRODUCTIVE_AND_MOVES_NOTHING',
    truthBoundary: 'A BOTTLENECK IS A GOAL-AND-EVIDENCE-RELATIVE CAUSAL CLAIM, NOT A TRAIT VERDICT ABOUT THE PERSON.',
    businessEffectAuthority: 'NONE'
  };
}

export function agencyDebt(capabilities = []) {
  const rows = (Array.isArray(capabilities) ? capabilities : []).filter(row => row?.name);
  const atrophying = rows.filter(row => row.trajectory === 'ATROPHYING');
  const delegated = rows.filter(row => row.trajectory === 'DELEGATED');
  const deliberate = rows.filter(row => row.trajectory === 'ABANDONED_ON_PURPOSE');

  return {
    ok: true,
    status: 'AGENCY_DEBT_ASSESSED',
    delegated: delegated.map(row => row.name),
    atrophying: atrophying.map(row => row.name),
    deliberatelyAbandoned: deliberate.map(row => row.name),
    debt: atrophying.length,
    trade: 'DELEGATION BUYS TIME AND SPENDS CAPABILITY. A DELIBERATE ABANDONMENT IS A CHOICE; AN UNNOTICED ATROPHY IS A COST NOBODY PRICED.',
    businessEffectAuthority: 'NONE'
  };
}

export function growSkeleton({ future = null, required = [], capabilities = [] } = {}) {
  const target = text(future, 500);
  if (!target) return fail('SKELETON_INVALID', ['future-required']);

  const have = new Map((Array.isArray(capabilities) ? capabilities : []).filter(row => row?.name).map(row => [row.name, row]));
  const needed = (Array.isArray(required) ? required : []).map(r => text(r, 240)).filter(Boolean);

  const gaps = needed
    .filter(name => !have.has(name) || have.get(name).level < 0.5)
    .map(name => ({
      capability: name,
      present: have.has(name),
      level: have.get(name)?.level ?? null,
      provisional: have.get(name)?.provisional ?? true
    }));

  return {
    ok: true,
    status: gaps.length ? 'SKELETON_HAS_GAPS' : 'SKELETON_COMPLETE',
    future: target,
    gaps,
    reachableWithout: gaps.length === 0,
    boundary: 'THIS NAMES WHAT IS MISSING FOR A FUTURE. IT DOES NOT PROPOSE REWRITING A PERSON, AND WHETHER THE FUTURE IS WORTH GROWING TOWARD IS NOT ITS CALL.',
    businessEffectAuthority: 'NONE'
  };
}
