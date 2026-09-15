// Sovereign adaptive mastery engine.
// Clean-room synthesis of knowledge-state diagnosis, prerequisite graphs,
// retrieval scheduling and interleaving. No external-effect authority.
export const ADAPTIVE_MASTERY_ENGINE_VERSION = 'uberbond.adaptive-mastery-engine.v1';

const clamp = (n, lo = 0, hi = 1) => Math.min(hi, Math.max(lo, Number(n) || 0));
const text = (v, max = 400) => {
  const s = String(v ?? '').trim();
  return s && s.length <= max ? s : null;
};
const list = v => Array.isArray(v) ? v : [];
const envelope = extra => ({ businessEffectAuthority: 'NONE', externalEffectAuthority: 'NONE', ...extra });

export function normalizeKnowledgeState(input = {}) {
  const id = text(input.id ?? input.name);
  if (!id) return envelope({ ok: false, status: 'KNOWLEDGE_STATE_INVALID', reasonCodes: ['id-required'] });
  const mastery = clamp(input.mastery);
  const uncertainty = clamp(input.uncertainty ?? 1 - mastery);
  const stabilityDays = Math.max(0.05, Number(input.stabilityDays) || 1);
  const difficulty = clamp(input.difficulty ?? 0.5);
  return envelope({
    ok: true,
    status: 'KNOWLEDGE_STATE_READY',
    state: {
      id,
      mastery,
      uncertainty,
      stabilityDays,
      difficulty,
      prerequisites: [...new Set(list(input.prerequisites).map(v => text(v)).filter(Boolean))].sort(),
      lastReviewedAt: text(input.lastReviewedAt, 80),
      evidenceRefs: [...new Set(list(input.evidenceRefs).map(v => text(v, 800)).filter(Boolean))].sort()
    }
  });
}

export function diagnoseKnowledgeState({ states = [], targetIds = [] } = {}) {
  const normalized = states.map(normalizeKnowledgeState).filter(x => x.ok).map(x => x.state);
  const byId = new Map(normalized.map(x => [x.id, x]));
  const targets = (targetIds.length ? targetIds : normalized.map(x => x.id)).filter(id => byId.has(id));
  const diagnostics = targets.map(id => {
    const s = byId.get(id);
    const missingPrerequisites = s.prerequisites.filter(p => !byId.has(p) || byId.get(p).mastery < 0.7);
    const informationGain = clamp(s.uncertainty * (0.35 + 0.65 * (1 - s.mastery)));
    return { id, mastery: s.mastery, uncertainty: s.uncertainty, missingPrerequisites, informationGain };
  }).sort((a, b) =>
    b.missingPrerequisites.length - a.missingPrerequisites.length ||
    b.informationGain - a.informationGain ||
    a.id.localeCompare(b.id)
  );
  return envelope({ ok: true, status: 'DIAGNOSTIC_READY', diagnostics });
}

// Retention-target scheduler inspired by modern spaced-repetition principles,
// but deliberately uses an independent, transparent decay model.
export function scheduleReview({ state = {}, desiredRetention = 0.9, now = new Date().toISOString() } = {}) {
  const built = normalizeKnowledgeState(state);
  if (!built.ok) return built;
  const retention = clamp(desiredRetention, 0.5, 0.99);
  const s = built.state;
  const difficultyPenalty = 0.55 + 0.9 * (1 - s.difficulty);
  const masteryGain = 0.6 + 1.8 * s.mastery;
  const intervalDays = Math.max(0.02, s.stabilityDays * difficultyPenalty * masteryGain * (-Math.log(retention)));
  const due = new Date(new Date(now).getTime() + intervalDays * 86400000);
  return envelope({
    ok: true,
    status: 'REVIEW_SCHEDULED',
    review: { id: s.id, desiredRetention: retention, intervalDays, dueAt: due.toISOString() }
  });
}

export function updateFromRecall({ state = {}, recalled, latencyMs = null } = {}) {
  const built = normalizeKnowledgeState(state);
  if (!built.ok) return built;
  const s = built.state;
  const fast = Number.isFinite(Number(latencyMs)) ? clamp(1 - Number(latencyMs) / 30000) : 0.5;
  const success = Boolean(recalled);
  const delta = success ? 0.08 + 0.08 * fast : -0.16;
  const newMastery = clamp(s.mastery + delta);
  const newStability = success ? s.stabilityDays * (1.35 + 0.65 * newMastery) : Math.max(0.25, s.stabilityDays * 0.55);
  return envelope({
    ok: true,
    status: 'KNOWLEDGE_STATE_UPDATED',
    state: { ...s, mastery: newMastery, uncertainty: clamp(s.uncertainty * (success ? 0.82 : 0.92)), stabilityDays: newStability }
  });
}

export function compileLearningQueue({ states = [], desiredRetention = 0.9, maxItems = 20 } = {}) {
  const diagnostic = diagnoseKnowledgeState({ states });
  const byId = new Map(states.map(s => [s.id ?? s.name, s]));
  const queue = [];
  for (const row of diagnostic.diagnostics) {
    for (const prereq of row.missingPrerequisites) {
      if (!queue.some(x => x.id === prereq) && byId.has(prereq)) queue.push({ id: prereq, mode: 'PREREQUISITE_REPAIR' });
    }
    if (!queue.some(x => x.id === row.id)) {
      const mode = row.mastery < 0.45 ? 'ACTIVE_RECALL_AND_WORKED_EXAMPLES' :
        row.uncertainty > 0.4 ? 'DIAGNOSTIC_RETRIEVAL' : 'SPACED_RETRIEVAL';
      const scheduled = scheduleReview({ state: byId.get(row.id), desiredRetention });
      queue.push({ id: row.id, mode, dueAt: scheduled.ok ? scheduled.review.dueAt : null });
    }
  }
  return envelope({ ok: true, status: 'LEARNING_QUEUE_READY', queue: queue.slice(0, Math.max(1, Number(maxItems) || 20)) });
}

export function compileCurriculumFromCapabilityGaps({ gaps = [], knowledgeMap = {} } = {}) {
  const units = [];
  for (const gap of list(gaps)) {
    const capability = text(gap.capability ?? gap.name);
    if (!capability) continue;
    const mapped = list(knowledgeMap[capability]);
    units.push({
      capability,
      criticality: clamp(gap.criticality ?? 1),
      units: mapped.map(v => text(v)).filter(Boolean)
    });
  }
  units.sort((a, b) => b.criticality - a.criticality || a.capability.localeCompare(b.capability));
  return envelope({ ok: true, status: 'CURRICULUM_COMPILED', units });
}
