// Geographic sovereignty engine.
// Time-sensitive legal/licensure facts expire instead of becoming silent permanent truth.
export const GEOGRAPHIC_SOVEREIGNTY_ENGINE_VERSION = 'uberbond.geographic-sovereignty-engine.v1';

const text = (v, max = 1000) => {
  const s = String(v ?? '').trim();
  return s && s.length <= max ? s : null;
};
const list = v => Array.isArray(v) ? v : [];
const clamp = n => Math.min(1, Math.max(0, Number(n) || 0));
const envelope = extra => ({ businessEffectAuthority: 'NONE', externalEffectAuthority: 'NONE', ...extra });
export const SOURCE_AUTHORITY = Object.freeze(['PRIMARY_AUTHORITY', 'INTERGOVERNMENTAL', 'PROFESSIONAL_BODY', 'SECONDARY']);

export function evidenceRecord(input = {}, { now = new Date().toISOString() } = {}) {
  const url = text(input.url, 2000);
  const checkedAt = text(input.checkedAt, 80);
  const authority = SOURCE_AUTHORITY.includes(input.authority) ? input.authority : null;
  if (!url || !checkedAt || !authority) return envelope({ ok: false, status: 'EVIDENCE_INVALID', reasonCodes: ['url-checkedAt-authority-required'] });
  const maxAgeDays = Math.max(1, Number(input.maxAgeDays) || 30);
  const ageDays = (new Date(now).getTime() - new Date(checkedAt).getTime()) / 86400000;
  const stale = !Number.isFinite(ageDays) || ageDays < 0 || ageDays > maxAgeDays;
  return envelope({ ok: true, status: stale ? 'EVIDENCE_STALE' : 'EVIDENCE_CURRENT', evidence: { url, checkedAt, authority, maxAgeDays, stale } });
}

export function pathway(input = {}, opts = {}) {
  const id = text(input.id);
  const destination = text(input.destination);
  const profession = text(input.profession);
  if (!id || !destination) return envelope({ ok: false, status: 'PATHWAY_INVALID', reasonCodes: ['id-and-destination-required'] });
  const evidence = list(input.evidence).map(x => evidenceRecord(x, opts)).filter(x => x.ok).map(x => x.evidence);
  const missingEvidence = list(input.evidence).length === 0 || evidence.length === 0;
  const stale = evidence.some(x => x.stale);
  const requirements = list(input.requirements).map(r => ({
    id: text(r.id),
    label: text(r.label),
    status: ['MET', 'UNMET', 'UNKNOWN', 'EXPIRING'].includes(r.status) ? r.status : 'UNKNOWN',
    dependsOn: [...new Set(list(r.dependsOn).map(v => text(v)).filter(Boolean))].sort()
  })).filter(r => r.id && r.label);
  return envelope({
    ok: true,
    status: missingEvidence || stale ? 'PATHWAY_EVIDENCE_INSUFFICIENT' : 'PATHWAY_READY',
    pathway: {
      id, destination, profession,
      routeType: text(input.routeType),
      requirements,
      evidence,
      costScore: clamp(input.costScore),
      timeScore: clamp(input.timeScore),
      careerFit: clamp(input.careerFit),
      languageFit: clamp(input.languageFit),
      stability: clamp(input.stability),
      reversibility: clamp(input.reversibility)
    }
  });
}

export function nextPathwayBlockers({ route = {} } = {}) {
  const built = pathway(route);
  if (!built.ok) return built;
  const rs = built.pathway.requirements;
  const byId = new Map(rs.map(r => [r.id, r]));
  const blockers = rs.filter(r => r.status !== 'MET').filter(r =>
    r.dependsOn.every(id => byId.get(id)?.status === 'MET')
  ).map(r => ({ id: r.id, label: r.label, status: r.status }));
  return envelope({ ok: true, status: 'PATHWAY_BLOCKERS_READY', blockers });
}

export function comparePathways({ pathways = [], weights = {} } = {}) {
  const w = {
    cost: clamp(weights.cost ?? 0.15),
    time: clamp(weights.time ?? 0.15),
    career: clamp(weights.career ?? 0.25),
    language: clamp(weights.language ?? 0.1),
    stability: clamp(weights.stability ?? 0.2),
    reversibility: clamp(weights.reversibility ?? 0.15)
  };
  const total = Object.values(w).reduce((a, b) => a + b, 0) || 1;
  const ranked = pathways.map(p => pathway(p)).filter(x => x.ok).map(x => {
    const p = x.pathway;
    const evidencePenalty = p.evidence.length && !p.evidence.some(e => e.stale) ? 1 : 0.35;
    const utility = (
      w.cost * (1 - p.costScore) + w.time * (1 - p.timeScore) +
      w.career * p.careerFit + w.language * p.languageFit +
      w.stability * p.stability + w.reversibility * p.reversibility
    ) / total * evidencePenalty;
    return { id: p.id, destination: p.destination, utility, evidencePenalty };
  }).sort((a, b) => b.utility - a.utility || a.id.localeCompare(b.id));
  return envelope({ ok: true, status: 'PATHWAYS_COMPARED', ranked, note: 'Decision support only; primary authorities remain controlling for legal/licensure requirements.' });
}
