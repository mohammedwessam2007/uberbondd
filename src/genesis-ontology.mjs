import crypto from 'node:crypto';
import { ZERO_EXTERNAL_EFFECTS } from './effect-ledgers.mjs';

export const GENESIS_ONTOLOGY_VERSION = 'uberbond.genesis-ontology-1.0.0';

function envelope(extra = {}) { return { businessEffectAuthority: 'NONE', externalEffectAuthority: 'NONE', externalEffectLedger: structuredClone(ZERO_EXTERNAL_EFFECTS), ...extra }; }
function text(value, max = 2400) { const out = String(value ?? '').trim(); return out && out.length <= max ? out : null; }
function list(value, max = 1024, itemMax = 1000) { if (!Array.isArray(value) || value.length > max) return null; const out=[], seen=new Set(); for (const raw of value) { const item=text(raw,itemMax); if(!item)return null; if(!seen.has(item)){seen.add(item);out.push(item);} } return out; }
function score(value) { const n=Number(value); return Number.isFinite(n)&&n>=0&&n<=100?n:null; }
function digest(value) { return crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex'); }
function slug(value) { return String(value??'').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,80); }
function refs(values) { const r=list(values||[],256,2000); return r ? r.filter(v=>/^(evidence|signal|receipt|test|doc|outcome|experiment|audit|synthetic):/i.test(v)) : null; }

export function compileConcept({ id, name, definition, parentIds = [], aliases = [], evidenceRefs = [], status = 'CANDIDATE' } = {}) {
  const conceptId=text(id,120)?.toLowerCase(), conceptName=text(name,300), def=text(definition,2000), parents=list(parentIds,64,120), als=list(aliases,64,300), evidence=refs(evidenceRefs), normalizedStatus=text(status,40)?.toUpperCase();
  if(!conceptId||!/^[a-z0-9][a-z0-9._-]*$/.test(conceptId)||!conceptName||!def||!parents||!als||!evidence||!['CANDIDATE','ACTIVE','DEPRECATED','ARCHIVED'].includes(normalizedStatus)) return envelope({ok:false,status:'CONCEPT_INVALID',reasonCodes:['valid-concept-contract-required']});
  const concept={id:conceptId,name:conceptName,definition:def,parentIds:parents,aliases:als,evidenceRefs:evidence,status:normalizedStatus};
  return envelope({ok:true,status:'CONCEPT_COMPILED',concept,conceptDigest:digest(concept),claimBoundary:'CONCEPT_IS_MACHINE_VOCABULARY_NOT_EXTERNAL_FACT'});
}

export function scoreConceptFitness({ explanatoryGain, usage, contradictionReduction, opportunityReach, stability, novelty } = {}) {
  const values={explanatoryGain:score(explanatoryGain),usage:score(usage),contradictionReduction:score(contradictionReduction),opportunityReach:score(opportunityReach),stability:score(stability),novelty:score(novelty)};
  if(Object.values(values).some(v=>v==null)) return envelope({ok:false,status:'CONCEPT_FITNESS_INVALID',reasonCodes:['all-bounded-fitness-dimensions-required']});
  const fitness=Number((values.explanatoryGain*.25+values.usage*.15+values.contradictionReduction*.20+values.opportunityReach*.15+values.stability*.15+values.novelty*.10).toFixed(2));
  return envelope({ok:true,status:'CONCEPT_FITNESS_READY',fitness,dimensions:values,claimBoundary:'CONCEPT_FITNESS_IS_INTERNAL_UTILITY_SCORE_NOT_TRUTH'});
}

export function fuseConcepts({ a, b, relation = 'COMPOSITION', evidenceRefs = [] } = {}) {
  if(!a?.id||!b?.id||a.id===b.id) return envelope({ok:false,status:'CONCEPT_FUSION_INVALID',reasonCodes:['two-distinct-concepts-required']});
  const evidence=refs([...(a.evidenceRefs||[]),...(b.evidenceRefs||[]),...(evidenceRefs||[])]);
  if(!evidence) return envelope({ok:false,status:'CONCEPT_FUSION_INVALID',reasonCodes:['valid-evidence-references-required']});
  const identity={parents:[a.id,b.id].sort(),relation:String(relation).toUpperCase()};
  const concept=compileConcept({id:`fusion-${digest(identity).slice(0,18)}`,name:`${a.name} × ${b.name}`,definition:`A ${identity.relation.toLowerCase()} concept combining: ${a.definition} AND ${b.definition}`,parentIds:identity.parents,evidenceRefs:evidence,status:'CANDIDATE'});
  return concept.ok?envelope({ok:true,status:'CONCEPT_FUSION_READY',concept:concept.concept,relation:identity.relation,claimBoundary:'FUSION_IS_CANDIDATE_VOCABULARY_NOT_DISCOVERED_LAW'}):concept;
}

export function speciateConcept({ concept, dimensions = [] } = {}) {
  const dims=list(dimensions,64,500); if(!concept?.id||!dims||!dims.length) return envelope({ok:false,status:'CONCEPT_SPECIATION_INVALID',reasonCodes:['concept-and-dimensions-required']});
  const children=dims.map(dimension=>compileConcept({id:`${concept.id}-${slug(dimension)||digest(dimension).slice(0,8)}`,name:`${concept.name}: ${dimension}`,definition:`A specialization of ${concept.name} along the dimension ${dimension}. Parent definition: ${concept.definition}`,parentIds:[concept.id],evidenceRefs:concept.evidenceRefs||[],status:'CANDIDATE'})).filter(result=>result.ok).map(result=>result.concept);
  return envelope({ok:true,status:'CONCEPT_SPECIATION_READY',parentId:concept.id,children,claimBoundary:'SPECIATION_CREATES_CANDIDATE_DISTINCTIONS_NOT_REAL_WORLD_CATEGORIES'});
}

export function decideOntologyDeath({ concept, usageCount = 0, dependentConceptIds = [], replacementId, evidenceRefs = [] } = {}) {
  const usage=Number(usageCount), deps=list(dependentConceptIds,1024,120), replacement=text(replacementId,120), evidence=refs(evidenceRefs);
  if(!concept?.id||!Number.isSafeInteger(usage)||usage<0||!deps||!evidence) return envelope({ok:false,status:'ONTOLOGY_DEATH_INVALID',reasonCodes:['valid-concept-usage-dependencies-evidence-required']});
  const eligible=usage===0&&deps.length===0&&Boolean(replacement)&&evidence.length>0;
  return envelope({ok:true,status:eligible?'ONTOLOGY_ARCHIVE_CANDIDATE':'ONTOLOGY_KEEP',conceptId:concept.id,replacementId:replacement||null,usageCount:usage,dependentConceptIds:deps,evidenceRefs:evidence,decisionAuthority:'PROPOSE_ONLY',claimBoundary:'ONTOLOGY_DEATH_NEVER_SILENTLY_DELETES_HISTORY_OR_DEPENDENCIES'});
}

export function buildIdeaPhylogeny({ ideas = [] } = {}) {
  if(!Array.isArray(ideas)||ideas.length>10000) return envelope({ok:false,status:'IDEA_PHYLOGENY_INVALID',reasonCodes:['bounded-ideas-required']});
  const nodes=new Map(); for(const idea of ideas){const id=text(idea?.id,160)?.toLowerCase(),parents=list(idea?.parentIds||[],64,160);if(!id||!parents||nodes.has(id))return envelope({ok:false,status:'IDEA_PHYLOGENY_INVALID',reasonCodes:['unique-id-and-parent-list-required']});nodes.set(id,{id,name:text(idea?.name,500)||id,parentIds:parents});}
  for(const node of nodes.values()) for(const parent of node.parentIds) if(!nodes.has(parent)) return envelope({ok:false,status:'IDEA_PHYLOGENY_INVALID',reasonCodes:[`missing-parent:${parent}`]});
  const visiting=new Set(),visited=new Set(); function visit(id){if(visiting.has(id))return false;if(visited.has(id))return true;visiting.add(id);for(const p of nodes.get(id).parentIds)if(!visit(p))return false;visiting.delete(id);visited.add(id);return true;}
  for(const id of nodes.keys())if(!visit(id))return envelope({ok:false,status:'IDEA_PHYLOGENY_INVALID',reasonCodes:['phylogeny-cycle-prohibited']});
  const roots=[...nodes.values()].filter(node=>!node.parentIds.length).map(node=>node.id); const children={}; for(const node of nodes.values())for(const parent of node.parentIds)(children[parent]??=[]).push(node.id);
  return envelope({ok:true,status:'IDEA_PHYLOGENY_READY',nodes:[...nodes.values()],roots,children,claimBoundary:'PHYLOGENY_IS_LINEAGE_METADATA_NOT_PROOF_OF_CAUSAL_INHERITANCE'});
}

export function buildAbstractionLadder({ observation, mechanism, pattern, principle, metaPrinciple } = {}) {
  const values=[observation,mechanism,pattern,principle,metaPrinciple].map(v=>text(v,1600)); if(values.some(v=>!v))return envelope({ok:false,status:'ABSTRACTION_LADDER_INVALID',reasonCodes:['all-five-levels-required']});
  const levels=['OBSERVATION','MECHANISM','PATTERN','PRINCIPLE','META_PRINCIPLE'].map((level,index)=>({level,value:values[index]}));
  return envelope({ok:true,status:'ABSTRACTION_LADDER_READY',levels,claimBoundary:'HIGHER_ABSTRACTION_LEVELS_REQUIRE_SEPARATE_EVIDENCE_AND_CAN_OVERGENERALIZE'});
}

export function generateInverseProblem({ desiredOutcome, observables = [], controls = [], constraints = [] } = {}) {
  const outcome=text(desiredOutcome,1600),obs=list(observables,256,800),ctrl=list(controls,256,800),cons=list(constraints,256,800); if(!outcome||!obs||!obs.length||!ctrl||!ctrl.length||!cons)return envelope({ok:false,status:'INVERSE_PROBLEM_INVALID',reasonCodes:['desired-outcome-observables-controls-required']});
  return envelope({ok:true,status:'INVERSE_PROBLEM_READY',problem:{desiredOutcome:outcome,observables:obs,controls:ctrl,constraints:cons,questions:['Which hidden mechanisms could map controls to the desired outcome?','Which observation most distinguishes competing mechanisms?','Which control has the smallest safe reversible intervention?','What result would falsify the current inverse solution?']},claimBoundary:'INVERSE_PROBLEM_DEFINITION_IS_NOT_SOLUTION_OR_CAUSAL_PROOF'});
}

export function compileQuestionGenome({ questions = [] } = {}) {
  if(!Array.isArray(questions)||questions.length>5000)return envelope({ok:false,status:'QUESTION_GENOME_INVALID',reasonCodes:['bounded-question-array-required']});
  const genome=questions.map((raw,index)=>{const q=text(raw?.question??raw,2000);if(!q)return null;const lower=q.toLowerCase();let type='EXPLORATORY';if(/why|cause|causal/.test(lower))type='CAUSAL';else if(/what if|counterfactual|if .* then/.test(lower))type='COUNTERFACTUAL';else if(/how much|probab|likelihood|forecast/.test(lower))type='PREDICTIVE';else if(/should|best|choose|decision/.test(lower))type='DECISION';else if(/disprove|falsif|wrong/.test(lower))type='FALSIFICATION';return {questionId:`q_${digest({index,q}).slice(0,16)}`,question:q,type,parents:list(raw?.parentQuestionIds||[],32,120)||[],status:'OPEN'};}).filter(Boolean);
  return envelope({ok:true,status:'QUESTION_GENOME_READY',questions:genome,typeCounts:genome.reduce((acc,q)=>{acc[q.type]=(acc[q.type]||0)+1;return acc;},{}),claimBoundary:'QUESTION_CLASSIFICATION_DOES_NOT_SUPPLY_ANSWERS'});
}

export function compressInsight({ statement, evidenceRefs = [], implications = [], uncertainty = 50, contradictions = [] } = {}) {
  const s=text(statement,1600),e=refs(evidenceRefs),i=list(implications,64,800),c=list(contradictions,64,800),u=score(uncertainty);if(!s||!e||!e.length||!i||!c||u==null)return envelope({ok:false,status:'INSIGHT_COMPRESSION_INVALID',reasonCodes:['statement-evidence-and-bounded-fields-required']});
  const packet={insightId:`insight_${digest({s,e,i,c,u}).slice(0,20)}`,statement:s,evidenceRefs:e,implications:i,uncertainty:u,contradictions:c,lossWarning:'Compression may omit context; follow evidence pointers before consequential use.'};
  return envelope({ok:true,status:'INSIGHT_COMPRESSED',packet,claimBoundary:'COMPRESSED_INSIGHT_NEVER_OUTRANKS_SOURCE_EVIDENCE'});
}

export function buildOntologyDsl({ concepts = [], relations = [], mode = 'ECONOMIC' } = {}) {
  const m=text(mode,40)?.toUpperCase(); if(!['ECONOMIC','CAUSAL','AUTHORITY','COMPANY_GENOME'].includes(m)||!Array.isArray(concepts)||concepts.length>5000||!Array.isArray(relations)||relations.length>10000)return envelope({ok:false,status:'ONTOLOGY_DSL_INVALID',reasonCodes:['recognized-mode-and-bounded-ontology-required']});
  const conceptIds=new Set(concepts.map(c=>text(c?.id,120)).filter(Boolean)); const rels=[];for(const r of relations){const from=text(r?.from,120),to=text(r?.to,120),type=text(r?.type,80)?.toUpperCase();if(!from||!to||!type||!conceptIds.has(from)||!conceptIds.has(to))continue;rels.push({from,to,type});}
  const grammar={mode:m,statements:['CONCEPT <id> := <definition>','RELATION <from> <type> <to>','EVIDENCE <concept-or-relation> := <evidence-ref>','STATUS <id> := CANDIDATE|ACTIVE|DEPRECATED|ARCHIVED'],execution:'PARSE_VALIDATE_QUERY_ONLY_NO_ARBITRARY_CODE_EXECUTION'};
  return envelope({ok:true,status:'ONTOLOGY_DSL_READY',grammar,conceptCount:conceptIds.size,relations:rels,claimBoundary:'DSL_IS_MACHINE_READABLE_VOCABULARY_NOT_GENERAL_PROGRAMMING_LANGUAGE_OR_AUTHORITY'});
}

export function compileExecutableOntology({ concepts = [], relations = [] } = {}) {
  if(!Array.isArray(concepts)||concepts.length>5000||!Array.isArray(relations)||relations.length>10000)return envelope({ok:false,status:'EXECUTABLE_ONTOLOGY_INVALID',reasonCodes:['bounded-concepts-and-relations-required']});
  const byId=new Map();for(const raw of concepts){const compiled=compileConcept(raw);if(!compiled.ok)return envelope({ok:false,status:'EXECUTABLE_ONTOLOGY_INVALID',reasonCodes:['invalid-concept']});if(byId.has(compiled.concept.id))return envelope({ok:false,status:'EXECUTABLE_ONTOLOGY_INVALID',reasonCodes:['duplicate-concept-id']});byId.set(compiled.concept.id,compiled.concept);}
  const normalizedRelations=[];for(const raw of relations){const from=text(raw?.from,120)?.toLowerCase(),to=text(raw?.to,120)?.toLowerCase(),type=text(raw?.type,80)?.toUpperCase();if(!from||!to||!type||!byId.has(from)||!byId.has(to))return envelope({ok:false,status:'EXECUTABLE_ONTOLOGY_INVALID',reasonCodes:['invalid-relation']});normalizedRelations.push({from,to,type});}
  const index=Object.fromEntries([...byId.values()].map(concept=>[concept.id,{name:concept.name,status:concept.status,parents:concept.parentIds,aliases:concept.aliases}]));
  const ontology={concepts:[...byId.values()],relations:normalizedRelations,index};
  return envelope({ok:true,status:'EXECUTABLE_ONTOLOGY_READY',ontology,ontologyDigest:digest(ontology),allowedOperations:['LOOKUP','TRAVERSE_RELATIONS','VALIDATE_REFERENCE','PROPOSE_MUTATION'],prohibitedOperations:['ARBITRARY_CODE_EXECUTION','AUTHORITY_WIDENING','SILENT_HISTORY_DELETION'],claimBoundary:'EXECUTABLE_MEANS_MACHINE_QUERYABLE_AND_VALIDATABLE_NOT_SELF_AUTHORIZING_CODE'});
}

export function evolveOntology({ currentConcepts = [], candidateConcepts = [], fitnessById = {}, dependencies = {}, promotionThreshold = 70, archiveThreshold = 20 } = {}) {
  const promote=score(promotionThreshold),archive=score(archiveThreshold);if(promote==null||archive==null||archive>=promote)return envelope({ok:false,status:'ONTOLOGY_EVOLUTION_INVALID',reasonCodes:['valid-threshold-order-required']});
  const current=currentConcepts.map(c=>compileConcept(c)).filter(r=>r.ok).map(r=>r.concept);const candidates=candidateConcepts.map(c=>compileConcept(c)).filter(r=>r.ok).map(r=>r.concept);if(current.length!==currentConcepts.length||candidates.length!==candidateConcepts.length)return envelope({ok:false,status:'ONTOLOGY_EVOLUTION_INVALID',reasonCodes:['all-concepts-must-compile']});
  const promotions=[];for(const concept of candidates){const f=score(fitnessById?.[concept.id]);if(f!=null&&f>=promote)promotions.push({conceptId:concept.id,fitness:f,decision:'PROMOTE_CANDIDATE_TO_ACTIVE_PROPOSAL'});}
  const archives=[];for(const concept of current){const f=score(fitnessById?.[concept.id]);const deps=list(dependencies?.[concept.id]||[],1024,120);if(f!=null&&f<=archive&&deps&&deps.length===0)archives.push({conceptId:concept.id,fitness:f,decision:'ARCHIVE_PROPOSAL_REQUIRES_REPLACEMENT_AND_HISTORY_PRESERVATION'});}
  return envelope({ok:true,status:'ONTOLOGY_EVOLUTION_PROPOSAL_READY',promotions,archives,promotionAuthority:'NONE',claimBoundary:'ONTOLOGY_EVOLUTION_PROPOSES_CHANGES; IT_CANNOT_SILENTLY_REDEFINE_REALITY_OR_AUTHORITY'});
}

export function autogenResearchAgenda({ unknowns = [], anomalies = [], contradictions = [], maxQuestions = 64 } = {}) {
  const cap=Number(maxQuestions);if(!Number.isSafeInteger(cap)||cap<1||cap>512)return envelope({ok:false,status:'RESEARCH_AGENDA_AUTOGEN_INVALID',reasonCodes:['bounded-max-questions-required']});
  const buckets=[['UNKNOWN',unknowns],['ANOMALY',anomalies],['CONTRADICTION',contradictions]],questions=[];for(const [kind,values] of buckets){const cleaned=list(values,1024,1600);if(!cleaned)return envelope({ok:false,status:'RESEARCH_AGENDA_AUTOGEN_INVALID',reasonCodes:[`bounded-${kind.toLowerCase()}-list-required`]});for(const value of cleaned){questions.push({question:`What missing concept, mechanism, measurement, or theory would explain this ${kind.toLowerCase()}: ${value}?`,kind});questions.push({question:`What observation would most efficiently falsify the leading explanation for: ${value}?`,kind});if(questions.length>=cap)break;}if(questions.length>=cap)break;}
  const genome=compileQuestionGenome({questions});return envelope({ok:true,status:'RESEARCH_AGENDA_AUTOGENERATED',agenda:genome.questions,claimBoundary:'AUTOGENERATED_RESEARCH_AGENDA_PRIORITIZES_IGNORANCE_NOT_FACTS'});
}

export function buildOntogenesisCycle({ currentConcepts = [], unknowns = [], anomalies = [], contradictions = [], evidenceRefs = [] } = {}) {
  const agenda=autogenResearchAgenda({unknowns,anomalies,contradictions,maxQuestions:32});if(!agenda.ok)return agenda;const evidence=refs(evidenceRefs);if(!evidence)return envelope({ok:false,status:'ONTOGENESIS_INVALID',reasonCodes:['valid-evidence-reference-list-required']});
  const candidates=[];for(const item of agenda.agenda.slice(0,12)){const name=item.question.replace(/^What\s+/i,'').replace(/[?:].*$/,'').slice(0,120)||'emergent concept';const id=`emergent-${slug(name)||digest(item.question).slice(0,12)}`;const compiled=compileConcept({id,name,definition:`Candidate concept generated to explain or discriminate an unresolved research question: ${item.question}`,evidenceRefs:evidence.length?evidence:[`synthetic:ontogenesis-${digest(item.question).slice(0,12)}`],status:'CANDIDATE'});if(compiled.ok)candidates.push(compiled.concept);}
  const fitnessById=Object.fromEntries(candidates.map((concept,index)=>[concept.id,Math.max(30,80-index*3)]));const evolution=evolveOntology({currentConcepts,candidateConcepts:candidates,fitnessById,dependencies:{},promotionThreshold:70,archiveThreshold:20});
  const dsl=buildOntologyDsl({concepts:[...currentConcepts,...candidates],relations:[],mode:'ECONOMIC'});
  return envelope({ok:true,status:'ONTOGENESIS_CYCLE_READY',agenda,candidates,evolution,dsl,nextRule:'CANDIDATE_CONCEPTS_REQUIRE_EVIDENCE_AND_REPEATED_UTILITY_BEFORE_CANONICAL_PROMOTION',claimBoundary:'ONTOGENESIS_CREATES_CANDIDATE_VOCABULARY_AND_RESEARCH_STRUCTURE_NOT_NEW_EXTERNAL_FACTS'});
}
