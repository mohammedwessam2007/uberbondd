import crypto from 'node:crypto';

export const UBERBOND_MEMORY_RECONCILIATION_POLICY_VERSION = 'uberbond-memory-reconciliation-1.0.0';

function clone(value) {
  return structuredClone(value);
}

function text(value, max = 1600) {
  const normalized = String(value ?? '').trim();
  return normalized && normalized.length <= max ? normalized : null;
}

function digest(value) {
  return crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

function fail(reasonCodes) {
  return {
    ok: false,
    policyVersion: UBERBOND_MEMORY_RECONCILIATION_POLICY_VERSION,
    reasonCodes: [...new Set((reasonCodes || []).filter(Boolean))]
  };
}

function validInitiative(item) {
  return Boolean(
    item
    && typeof item === 'object'
    && !Array.isArray(item)
    && text(item.id, 120)
    && text(item.name, 240)
    && text(item.status, 80)
    && text(item.role, 1600)
    && text(item.currentReconciliation, 1600)
  );
}

function validSource(item) {
  return Boolean(
    item
    && typeof item === 'object'
    && !Array.isArray(item)
    && text(item.id, 120)
    && text(item.title, 500)
    && text(item.evidenceClass, 120)
  );
}

export function applyUberBondMemoryReconciliation({ memoryIndex, reconciliation } = {}) {
  if (!memoryIndex || typeof memoryIndex !== 'object' || Array.isArray(memoryIndex)) {
    return fail(['memory-index-object-required']);
  }
  if (!reconciliation || typeof reconciliation !== 'object' || Array.isArray(reconciliation)) {
    return fail(['memory-reconciliation-object-required']);
  }
  const reasons = [];
  if (reconciliation.schemaVersion !== 'uberbond-memory-reconciliation-1.0.0') reasons.push('unsupported-memory-reconciliation-schema');
  if (reconciliation.project !== 'UberBond') reasons.push('memory-reconciliation-project-must-be-uberbond');
  if (!Array.isArray(memoryIndex.namedInitiatives)) reasons.push('memory-named-initiatives-required');
  if (!Array.isArray(reconciliation.replaceInitiatives)) reasons.push('replacement-initiatives-required');
  if (!Array.isArray(reconciliation.appendInitiatives)) reasons.push('append-initiatives-required');
  if (!Array.isArray(reconciliation.unresolvedNames)) reasons.push('reconciled-unresolved-names-required');
  if (!Array.isArray(reconciliation.appendSourceBasis)) reasons.push('append-source-basis-required');
  if (!Array.isArray(reconciliation.appendAntiForgettingRules)) reasons.push('append-anti-forgetting-rules-required');
  if (reasons.length) return fail(reasons);

  const next = clone(memoryIndex);
  next.namedInitiatives = [...next.namedInitiatives.map(clone)];
  const byId = new Map(next.namedInitiatives.map((item, index) => [item?.id, index]));
  const names = new Map(next.namedInitiatives.map((item, index) => [String(item?.name || '').trim().toLowerCase(), index]));

  for (const replacement of reconciliation.replaceInitiatives) {
    if (!validInitiative(replacement)) reasons.push('replacement-initiative-invalid');
    const index = byId.get(replacement?.id);
    if (index == null) {
      reasons.push('replacement-initiative-target-missing');
      continue;
    }
    const existingNameIndex = names.get(String(replacement.name || '').trim().toLowerCase());
    if (existingNameIndex != null && existingNameIndex !== index) reasons.push('replacement-initiative-name-conflict');
    if (!reasons.length) {
      names.delete(String(next.namedInitiatives[index].name || '').trim().toLowerCase());
      next.namedInitiatives[index] = clone(replacement);
      names.set(String(replacement.name).trim().toLowerCase(), index);
    }
  }

  for (const addition of reconciliation.appendInitiatives) {
    if (!validInitiative(addition)) {
      reasons.push('append-initiative-invalid');
      continue;
    }
    const nameKey = String(addition.name).trim().toLowerCase();
    if (byId.has(addition.id) || names.has(nameKey)) {
      reasons.push('append-initiative-conflict');
      continue;
    }
    const index = next.namedInitiatives.length;
    next.namedInitiatives.push(clone(addition));
    byId.set(addition.id, index);
    names.set(nameKey, index);
  }

  next.unresolvedNames = clone(reconciliation.unresolvedNames);

  const sourceBasis = Array.isArray(next.sourceBasis) ? next.sourceBasis.map(clone) : [];
  const sourceIds = new Set(sourceBasis.map(item => item?.id));
  for (const source of reconciliation.appendSourceBasis) {
    if (!validSource(source)) {
      reasons.push('append-source-basis-invalid');
      continue;
    }
    if (sourceIds.has(source.id)) continue;
    sourceBasis.push(clone(source));
    sourceIds.add(source.id);
  }
  next.sourceBasis = sourceBasis;

  const rules = Array.isArray(next.antiForgettingRules) ? [...next.antiForgettingRules] : [];
  for (const rule of reconciliation.appendAntiForgettingRules) {
    const normalized = text(rule, 1000);
    if (!normalized) reasons.push('append-anti-forgetting-rule-invalid');
    else if (!rules.includes(normalized)) rules.push(normalized);
  }
  next.antiForgettingRules = rules;

  if (text(reconciliation.generatedAt, 80)) next.generatedAt = reconciliation.generatedAt;
  if (reasons.length) return fail(reasons);

  return {
    ok: true,
    policyVersion: UBERBOND_MEMORY_RECONCILIATION_POLICY_VERSION,
    status: 'MEMORY_RECONCILED',
    memoryIndex: next,
    lineage: Array.isArray(reconciliation.lineage) ? reconciliation.lineage.map(item => text(item, 240)).filter(Boolean) : [],
    sourceMemoryDigest: digest(memoryIndex),
    reconciledMemoryDigest: digest(next)
  };
}
