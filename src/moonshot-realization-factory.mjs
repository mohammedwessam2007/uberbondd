import { ZERO_EXTERNAL_EFFECTS } from './effect-ledgers.mjs';

export const MOONSHOT_REALIZATION_FACTORY_VERSION = 'uberbond.moonshot-realization-factory.v1';

export const REALIZATION_SURFACES = Object.freeze([
  'SOFTWARE',
  'FORMAL',
  'PHYSICAL',
  'BIOLOGICAL',
  'HUMAN',
  'INSTITUTIONAL',
  'CIVILIZATION',
  'MIXED'
]);

const DOMAIN_RULES = Object.freeze([
  ['COMPUTATION', ['algorithm','compute','software','program','compiler','code','digital','network','data','model','simulation','ai','agent','protocol','interface']],
  ['MATHEMATICS', ['mathemat','theorem','proof','equation','geometry','number','invariant','constant','logic','formal','axiom']],
  ['PHYSICS', ['physics','physical','matter','quantum','gravity','space','time','field','particle','energy','force','thermodynamic']],
  ['BIOLOGY', ['biology','biological','cell','gene','genome','organism','protein','evolution','metabolism','brain','neural','medicine','aging']],
  ['COGNITION', ['cognition','cognitive','thought','reason','learning','memory','attention','intelligence','mind','concept','perception','sense']],
  ['HUMAN', ['human','person','identity','life','experience','skill','education','career','relationship','health','habit']],
  ['ECONOMICS', ['economic','market','money','price','capital','wealth','trade','value','business','incentive']],
  ['INSTITUTIONS', ['institution','governance','law','rights','trust','coordination','society','organization','mechanism design','constitution']],
  ['MATERIALS', ['material','manufactur','fabricat','structure','molecule','chemistry','chemical','metamaterial']],
  ['ROBOTICS', ['robot','actuator','sensor','autonomous machine','embodied','drone']],
  ['SCIENCE', ['science','scientific','experiment','phenomen','observation','measurement','hypothesis','mechanism','discover']],
  ['CIVILIZATION', ['civilization','society','planet','species','humanity','future','world','epoch','culture']],
  ['SECURITY', ['security','adversarial','attack','failure','immune','resilien','safety','risk','vulnerab']],
  ['INFRASTRUCTURE', ['infrastructure','cloud','runtime','operating system','platform','substrate','network','grid']],
  ['META_RESEARCH', ['unknown','possibility','ontology','genesis','discovery','invention','research','frontier','search space']]
]);

const ANCESTOR_BY_DOMAIN = Object.freeze({
  COMPUTATION: ['representation-ontology-search','experiment-compiler','simulation-ecology'],
  MATHEMATICS: ['representation-ontology-search','truth-evidence-substrate','adversarial-tribunal'],
  PHYSICS: ['causal-mechanism-atoms','physical-reality-bridge','replication-network'],
  BIOLOGY: ['causal-mechanism-atoms','physical-reality-bridge','replication-network'],
  COGNITION: ['representation-ontology-search','experiment-compiler','adversarial-tribunal'],
  HUMAN: ['experiment-compiler','sovereignty-governor','physical-reality-bridge'],
  ECONOMICS: ['causal-mechanism-atoms','simulation-ecology','experiment-compiler'],
  INSTITUTIONS: ['causal-mechanism-atoms','simulation-ecology','sovereignty-governor'],
  MATERIALS: ['physical-reality-bridge','causal-mechanism-atoms','replication-network'],
  ROBOTICS: ['physical-reality-bridge','experiment-compiler','simulation-ecology'],
  SCIENCE: ['causal-mechanism-atoms','experiment-compiler','replication-network'],
  CIVILIZATION: ['simulation-ecology','sovereignty-governor','technology-tree-compiler'],
  SECURITY: ['adversarial-tribunal','sovereignty-governor','experiment-compiler'],
  INFRASTRUCTURE: ['experiment-compiler','simulation-ecology','technology-tree-compiler'],
  META_RESEARCH: ['representation-ontology-search','future-ancestor-graph','epoch-branching-evaluator']
});

const ZERO = () => structuredClone(ZERO_EXTERNAL_EFFECTS);
const envelope = extra => ({
  businessEffectAuthority: 'NONE',
  externalEffectAuthority: 'NONE',
  externalEffectLedger: ZERO(),
  ...extra
});

function normalizedText(entry) {
  return `${entry?.literalTitle || ''} ${entry?.literalBodyMarkdown || ''}`.toLowerCase();
}

function hits(haystack, needles) {
  let total = 0;
  for (const needle of needles) {
    if (haystack.includes(needle)) total += 1;
  }
  return total;
}

function uniq(values) {
  return [...new Set(values)];
}

function firstMeaningfulSentence(markdown) {
  const compact = String(markdown || '')
    .replace(/[#>*_`]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  const match = compact.match(/^(.{1,500}?[.!?])(?:\s|$)/);
  return (match ? match[1] : compact.slice(0, 500)).trim();
}

function classifyDomains(entry) {
  const body = normalizedText(entry);
  const scored = DOMAIN_RULES
    .map(([domain, words]) => ({ domain, score: hits(body, words) }))
    .filter(row => row.score > 0)
    .sort((a,b) => b.score - a.score || a.domain.localeCompare(b.domain));
  const max = scored[0]?.score || 0;
  const selected = scored
    .filter(row => row.score >= Math.max(1, max - 1))
    .slice(0, 5)
    .map(row => row.domain);
  return selected.length ? selected : ['META_RESEARCH'];
}

function classifyIdeaKind(entry, domains) {
  const body = normalizedText(entry);
  if (/north star|invariant|principle|constitution|must |should |never |no amount|final metric/.test(body)) {
    return 'DOCTRINE_OR_INVARIANT';
  }
  if (/civilization|society|species|humanity|planet/.test(body) && domains.includes('CIVILIZATION')) {
    return 'CIVILIZATION_ARCHITECTURE';
  }
  if (/new science|scientific|phenomen|constant|law|theorem|mechanism|hypothesis/.test(body)) {
    return 'RESEARCH_PROGRAM';
  }
  if (/human|identity|life|experience|learning|memory|skill|sense/.test(body) && (domains.includes('HUMAN') || domains.includes('COGNITION'))) {
    return 'HUMAN_CAPABILITY_PROGRAM';
  }
  if (/matter|material|energy|physical|robot|biological|cell|gene|molecule/.test(body)) {
    return 'PHYSICAL_OR_BIOLOGICAL_TECHNOLOGY';
  }
  return 'CAPABILITY_SYSTEM';
}

function classifySurface(domains, kind) {
  if (kind === 'DOCTRINE_OR_INVARIANT') return 'FORMAL';
  const has = d => domains.includes(d);
  if (has('BIOLOGY')) return 'BIOLOGICAL';
  if (has('PHYSICS') || has('MATERIALS') || has('ROBOTICS')) return 'PHYSICAL';
  if (has('HUMAN')) return 'HUMAN';
  if (has('INSTITUTIONS') || has('ECONOMICS')) return 'INSTITUTIONAL';
  if (has('CIVILIZATION')) return 'CIVILIZATION';
  if (has('MATHEMATICS') && !has('COMPUTATION')) return 'FORMAL';
  if (has('COMPUTATION') || has('META_RESEARCH') || has('COGNITION')) return 'SOFTWARE';
  return 'MIXED';
}

function implementationMode(surface, kind) {
  if (kind === 'DOCTRINE_OR_INVARIANT') return 'POLICY_OR_INVARIANT_TEST';
  if (surface === 'SOFTWARE') return 'PURE_SOFTWARE_PROTOTYPE';
  if (surface === 'FORMAL') return 'FORMALIZATION_OR_PROOF_SEARCH';
  if (surface === 'PHYSICAL') return 'SIMULATION_THEN_PHYSICAL_LAB';
  if (surface === 'BIOLOGICAL') return 'SIMULATION_THEN_BIOLOGICAL_LAB';
  if (surface === 'HUMAN') return 'BOUNDED_HUMAN_OR_N_OF_1_STUDY';
  if (surface === 'INSTITUTIONAL') return 'AGENT_SIMULATION_THEN_BOUNDED_FIELD_TRIAL';
  if (surface === 'CIVILIZATION') return 'MULTI_AGENT_SIMULATION_THEN_INSTITUTIONAL_PROXY';
  return 'FORMALIZE_THEN_SELECT_MINIMUM_REALITY_PROBE';
}

function requiresExternalAuthority(surface) {
  return ['PHYSICAL','BIOLOGICAL','HUMAN','INSTITUTIONAL','CIVILIZATION','MIXED'].includes(surface);
}

function ancestorsFor(domains) {
  return uniq([
    'moonshot-reality-object',
    'constraint-genome',
    'future-ancestor-graph',
    ...domains.flatMap(domain => ANCESTOR_BY_DOMAIN[domain] || [])
  ]);
}

function branchingHeuristic(entry, domains) {
  const body = normalizedText(entry);
  let score = 20;
  score += domains.length * 5;
  if (/compiler|factory|language|protocol|substrate|primitive|engine|operating system|platform|genome|periodic table/.test(body)) score += 25;
  if (/arbitrary|universal|general|entire|new science|new capability|new technology|possibility/.test(body)) score += 20;
  if (/civilization|species|humanity/.test(body)) score += 10;
  return Math.min(100, score);
}

function specificityHeuristic(entry) {
  const body = String(entry?.literalBodyMarkdown || '');
  let score = 15;
  if (/\b(if|when|given|input|output|measure|test|compare|detect|search|map|predict|compile|optimi[sz]e|discover)\b/i.test(body)) score += 25;
  if (/\b(physical|biological|economic|computational|mathematical|causal|mechanism|signal|data|experiment)\b/i.test(body)) score += 20;
  if (body.length >= 120 && body.length <= 900) score += 15;
  if (/\bminimum|bounded|invariant|constraint|falsif|baseline|evidence\b/i.test(body)) score += 20;
  return Math.min(100, score);
}

function softwareFit(surface) {
  return {
    SOFTWARE: 100,
    FORMAL: 90,
    INSTITUTIONAL: 55,
    CIVILIZATION: 45,
    HUMAN: 35,
    PHYSICAL: 25,
    BIOLOGICAL: 20,
    MIXED: 30
  }[surface] ?? 30;
}

export function triageFounderMoonshot(entry) {
  const ordinal = Number(entry?.ordinal);
  if (!Number.isSafeInteger(ordinal) || ordinal < 1 || ordinal > 890 ||
      !String(entry?.literalTitle || '').trim() || !String(entry?.literalBodyMarkdown || '').trim()) {
    return envelope({ ok:false, status:'MOONSHOT_TRIAGE_INVALID', reasonCodes:['literal-source-entry-required'] });
  }

  const stableId = `founder-moonshot-${String(ordinal).padStart(4,'0')}`;
  const domains = classifyDomains(entry);
  const kind = classifyIdeaKind(entry, domains);
  const surface = classifySurface(domains, kind);
  const ancestorIds = ancestorsFor(domains);
  const external = requiresExternalAuthority(surface);
  const branching = branchingHeuristic(entry, domains);
  const specificity = specificityHeuristic(entry);
  const fit = softwareFit(surface);
  const priorityHeuristic = Number((
    branching * 0.45 +
    specificity * 0.25 +
    fit * 0.30
  ).toFixed(2));

  const sourceClaimCandidate = firstMeaningfulSentence(entry.literalBodyMarkdown);
  const derived = {
    stableId,
    ordinal,
    literalTitle: entry.literalTitle,
    hypotheticalIq: entry.hypotheticalIq,
    sourceLines: [entry.sourceLineStart, entry.sourceLineEnd],
    domains,
    ideaKind: kind,
    realizationSurface: surface,
    implementationMode: implementationMode(surface, kind),
    ancestorIds,
    sourceClaimCandidate,
    claimAtomizationState: 'PENDING_EVIDENCE_GRADE_ATOMIZATION',
    constraintMappingState: 'PENDING',
    experimentState: 'NOT_DESIGNED',
    realityState: 'IMAGINED',
    requiresExternalAuthority: external,
    executionAuthority: 'NONE',
    heuristicPriority: priorityHeuristic,
    heuristicComponents: {
      branchingPotential: branching,
      specificity,
      softwareFit: fit
    },
    nextAction: kind === 'DOCTRINE_OR_INVARIANT'
      ? 'COMPILE_INTO_MACHINE_CHECKABLE_INVARIANT_OR_DECISION_TEST'
      : external
        ? 'FORMALIZE_AND_SIMULATE_BEFORE_ANY_EXTERNAL_REALITY_PROBE'
        : 'EVIDENCE_GRADE_ATOMIZATION_THEN_MINIMUM_REALITY_PROBE',
    truthBoundary: 'TRIAGE_IS_ROUTING_METADATA__NOT_FEASIBILITY_EVIDENCE_OR_SCIENTIFIC_ATOMIZATION'
  };

  return envelope({ ok:true, status:'MOONSHOT_TRIAGED', moonshot:derived });
}

export function buildMoonshotRealizationLedger({ entries = [] } = {}) {
  if (!Array.isArray(entries) || entries.length !== 890) {
    return envelope({ ok:false, status:'MOONSHOT_LEDGER_INVALID', reasonCodes:['exact-890-entry-corpus-required'] });
  }
  const rows = [];
  const rejected = [];
  for (const entry of entries) {
    const result = triageFounderMoonshot(entry);
    if (result.ok) rows.push(result.moonshot);
    else rejected.push({ ordinal:entry?.ordinal ?? null, reasonCodes:result.reasonCodes });
  }
  const ids = rows.map(row => row.stableId);
  const ordinals = rows.map(row => row.ordinal);
  const contiguous = ordinals.every((value,index) => value === index + 1);
  if (rows.length !== 890 || new Set(ids).size !== 890 || !contiguous) {
    return envelope({
      ok:false,
      status:'MOONSHOT_LEDGER_INTEGRITY_FAILURE',
      reasonCodes:['all-890-unique-contiguous-triage-records-required'],
      triagedCount:rows.length,
      rejected
    });
  }

  const counts = {
    bySurface:{},
    byKind:{},
    byDomain:{},
    externalAuthorityRequired:0,
    internalFirst:0
  };
  for (const row of rows) {
    counts.bySurface[row.realizationSurface]=(counts.bySurface[row.realizationSurface]||0)+1;
    counts.byKind[row.ideaKind]=(counts.byKind[row.ideaKind]||0)+1;
    for (const domain of row.domains) counts.byDomain[domain]=(counts.byDomain[domain]||0)+1;
    if (row.requiresExternalAuthority) counts.externalAuthorityRequired += 1;
    else counts.internalFirst += 1;
  }

  return envelope({
    ok:true,
    status:'MOONSHOT_REALIZATION_LEDGER_READY',
    sourceCount:entries.length,
    triagedCount:rows.length,
    rejectedCount:rejected.length,
    counts,
    rows,
    law:'EVERY_SOURCE_IDEA_HAS_A_REALIZATION_ROUTE__NO_ROUTE_IS_MISTAKEN_FOR_PROOF'
  });
}

export function buildSharedAncestorDemand({ rows = [], ancestorSpine = [] } = {}) {
  if (!Array.isArray(rows) || !Array.isArray(ancestorSpine)) {
    return envelope({ ok:false, status:'ANCESTOR_DEMAND_INVALID', reasonCodes:['rows-and-ancestor-spine-required'] });
  }
  const known = new Map(ancestorSpine.map(node => [node.id,node]));
  const demand = new Map();
  for (const row of rows) {
    for (const ancestorId of row.ancestorIds || []) {
      if (!demand.has(ancestorId)) {
        demand.set(ancestorId,{
          ancestorId,
          name:known.get(ancestorId)?.name || ancestorId,
          currentStatus:known.get(ancestorId)?.status || 'UNREGISTERED_ANCESTOR',
          moonshotIds:[],
          surfaceCounts:{},
          domainCounts:{}
        });
      }
      const item=demand.get(ancestorId);
      item.moonshotIds.push(row.stableId);
      item.surfaceCounts[row.realizationSurface]=(item.surfaceCounts[row.realizationSurface]||0)+1;
      for (const domain of row.domains) item.domainCounts[domain]=(item.domainCounts[domain]||0)+1;
    }
  }
  const rowsOut=[...demand.values()].map(item=>({
    ...item,
    moonshotCount:item.moonshotIds.length,
    crossSurfaceCount:Object.keys(item.surfaceCounts).length,
    leverageScore:item.moonshotIds.length*Math.max(1,Object.keys(item.surfaceCounts).length)
  })).sort((a,b)=>b.leverageScore-a.leverageScore||a.ancestorId.localeCompare(b.ancestorId));

  return envelope({
    ok:true,
    status:'SHARED_ANCESTOR_DEMAND_READY',
    ancestors:rowsOut,
    law:'ANCESTOR_DEMAND_MEASURES_ROUTING_LEVERAGE__NOT_CAUSAL_NECESSITY'
  });
}

export function selectInternalRealizationFrontier({
  rows = [],
  limit = 25,
  excludeStableIds = []
} = {}) {
  const n=Number(limit);
  if (!Array.isArray(rows) || !Number.isSafeInteger(n) || n < 1 || n > 200 || !Array.isArray(excludeStableIds)) {
    return envelope({ ok:false, status:'REALIZATION_FRONTIER_INVALID', reasonCodes:['rows-limit-and-exclusions-required'] });
  }
  const excluded=new Set(excludeStableIds);
  const candidates=rows
    .filter(row=>!row.requiresExternalAuthority)
    .filter(row=>!excluded.has(row.stableId))
    .filter(row=>['SOFTWARE','FORMAL'].includes(row.realizationSurface))
    .map(row=>({
      stableId:row.stableId,
      ordinal:row.ordinal,
      literalTitle:row.literalTitle,
      realizationSurface:row.realizationSurface,
      ideaKind:row.ideaKind,
      ancestorIds:row.ancestorIds,
      heuristicPriority:row.heuristicPriority,
      nextAction:row.nextAction,
      claimAtomizationState:row.claimAtomizationState,
      truthBoundary:'FRONTIER_RANKING_SELECTS_WHAT_TO_FORMALIZE_NEXT__IT_DOES_NOT_RANK_IDEA_TRUTH_OR_CIVILIZATIONAL_IMPORTANCE'
    }))
    .sort((a,b)=>b.heuristicPriority-a.heuristicPriority||a.ordinal-b.ordinal)
    .slice(0,n);

  return envelope({
    ok:true,
    status:'INTERNAL_REALIZATION_FRONTIER_READY',
    candidateCount:candidates.length,
    candidates,
    executionAuthority:'NONE',
    law:'CHEAP_REVERSIBLE_INTERNAL_WORK_FIRST__REALITY_AND_AUTHORITY_GATES_BEFORE_EXTERNAL_EFFECTS'
  });
}
