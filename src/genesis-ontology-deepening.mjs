import crypto from 'node:crypto';
import { ZERO_EXTERNAL_EFFECTS } from './effect-ledgers.mjs';

export const GENESIS_ONTOLOGY_DEEPENING_VERSION = 'uberbond.genesis-ontology-deepening.v1';
const envelope = (extra = {}) => ({ businessEffectAuthority: 'NONE', externalEffectAuthority: 'NONE', externalEffectLedger: structuredClone(ZERO_EXTERNAL_EFFECTS), ...extra });
const hash = (value) => crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
const text = (value, max = 1000) => { const s = String(value ?? '').trim(); return s && s.length <= max ? s : null; };
const unique = (items = []) => [...new Set(items)].sort();

export function inventBoundedLanguage({ concepts = [], relations = [], namespace = 'ub' } = {}) {
  const ns = text(namespace, 32)?.toLowerCase();
  if (!ns || !/^[a-z][a-z0-9_]*$/.test(ns) || !Array.isArray(concepts) || !concepts.length || concepts.length > 512 || !Array.isArray(relations) || relations.length > 2048) return envelope({ ok: false, status: 'BOUNDED_LANGUAGE_INVALID' });
  const tokens = new Map();
  const symbols = [];
  for (const raw of concepts) {
    const id = text(raw?.id ?? raw, 120)?.toLowerCase(); if (!id) continue;
    const base = id.replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 40) || `c_${hash(id).slice(0, 8)}`;
    let token = base, suffix = 1;
    while (tokens.has(token) && tokens.get(token) !== id) token = `${base}_${suffix++}`;
    tokens.set(token, id); symbols.push({ id, token: `${ns}.${token}` });
  }
  const known = new Set(symbols.map(row => row.id));
  const grammar = relations.map(raw => ({ from: text(raw?.from, 120)?.toLowerCase(), relation: text(raw?.relation, 80)?.toUpperCase(), to: text(raw?.to, 120)?.toLowerCase() }))
    .filter(row => row.from && row.relation && row.to && known.has(row.from) && known.has(row.to));
  return envelope({ ok: true, status: 'BOUNDED_LANGUAGE_INVENTED', namespace: ns, symbols, grammar, languageDigest: hash({ ns, symbols, grammar }), executionAuthority: 'NONE', claimBoundary: 'LANGUAGE_IS_A_BOUNDED_SYMBOLIC_GRAMMAR_NOT_ARBITRARY_EXECUTABLE_CODE' });
}

export function compileEconomicDsl({ entities = [], flows = [], constraints = [], objectives = [] } = {}) {
  if (!Array.isArray(entities) || !entities.length || entities.length > 512 || !Array.isArray(flows) || flows.length > 4096 || !Array.isArray(constraints) || constraints.length > 1024 || !Array.isArray(objectives) || objectives.length > 128) return envelope({ ok: false, status: 'ECONOMIC_DSL_INVALID' });
  const entityMap = new Map();
  for (const raw of entities) {
    const id = text(raw?.id, 120)?.toLowerCase(), kind = text(raw?.kind, 60)?.toUpperCase();
    if (!id || !['ACTOR','RESOURCE','MARKET','PROCESS','ASSET','OUTCOME'].includes(kind) || entityMap.has(id)) return envelope({ ok: false, status: 'ECONOMIC_DSL_INVALID', reasonCodes: ['unique-known-entities-required'] });
    entityMap.set(id, { id, kind, unit: text(raw?.unit, 40) ?? null });
  }
  const compiledFlows = [];
  for (const raw of flows) {
    const from = text(raw?.from, 120)?.toLowerCase(), to = text(raw?.to, 120)?.toLowerCase(), resource = text(raw?.resource, 120)?.toLowerCase();
    const rate = Number(raw?.rate);
    if (!entityMap.has(from) || !entityMap.has(to) || (resource && !entityMap.has(resource)) || !Number.isFinite(rate)) return envelope({ ok: false, status: 'ECONOMIC_DSL_INVALID', reasonCodes: ['valid-flow-required'] });
    compiledFlows.push({ from, to, resource: resource ?? null, rate });
  }
  const compiledConstraints = constraints.map((raw, index) => ({ id: text(raw?.id, 120) ?? `constraint_${index + 1}`, expression: text(raw?.expression, 1000), evidenceRefs: unique((Array.isArray(raw?.evidenceRefs) ? raw.evidenceRefs : []).map(v => text(v, 500)).filter(Boolean)) })).filter(row => row.expression);
  const compiledObjectives = objectives.map((raw, index) => ({ id: text(raw?.id, 120) ?? `objective_${index + 1}`, metric: text(raw?.metric, 120), direction: text(raw?.direction, 20)?.toUpperCase(), weight: Number(raw?.weight ?? 1) })).filter(row => row.metric && ['MAXIMIZE','MINIMIZE'].includes(row.direction) && Number.isFinite(row.weight));
  const ast = { entities: [...entityMap.values()], flows: compiledFlows, constraints: compiledConstraints, objectives: compiledObjectives };
  return envelope({ ok: true, status: 'ECONOMIC_DSL_COMPILED', ast, astDigest: hash(ast), evaluationAuthority: 'NONE', claimBoundary: 'DSL_ENCODES_SUPPLIED_ECONOMIC_STRUCTURE_AND_DOES_NOT_ASSERT_MARKET_TRUTH' });
}

export function compileCompanyGenomeLanguage({ company = {} } = {}) {
  const fields = ['buyer','problem','mechanism','value','distribution','revenue','delivery'];
  const core = Object.fromEntries(fields.map(key => [key, text(company?.[key], 2000)]));
  const missing = fields.filter(key => !core[key]);
  const capabilities = unique((Array.isArray(company?.capabilities) ? company.capabilities : []).map(v => text(v, 240)).filter(Boolean));
  const dependencies = (Array.isArray(company?.dependencies) ? company.dependencies : []).map(raw => ({ from: text(raw?.from, 240), to: text(raw?.to, 240), kind: text(raw?.kind, 80)?.toUpperCase() })).filter(row => row.from && row.to && row.kind);
  if (missing.length) return envelope({ ok: false, status: 'COMPANY_GENOME_LANGUAGE_INVALID', reasonCodes: missing.map(key => `missing-${key}`) });
  const capabilitySet = new Set(capabilities);
  const unresolvedDependencies = dependencies.filter(row => row.kind === 'REQUIRES' && !capabilitySet.has(row.to));
  const ast = { identity: text(company?.id, 120) ?? `company_${hash(core).slice(0, 16)}`, core, capabilities, dependencies, unresolvedDependencies };
  return envelope({ ok: true, status: unresolvedDependencies.length ? 'COMPANY_GENOME_COMPILED_WITH_GAPS' : 'COMPANY_GENOME_COMPILED', ast, astDigest: hash(ast), executableSemantics: ['VALIDATE_CORE','CHECK_CAPABILITY_DEPENDENCIES','COMPARE_GENOMES'], externalEffectAuthority: 'NONE', claimBoundary: 'COMPANY_GENOME_AST_IS_A_DESIGN_AND_VALIDATION_OBJECT_NOT_A_LEGAL_ENTITY_OR_LIVE_COMPANY' });
}
