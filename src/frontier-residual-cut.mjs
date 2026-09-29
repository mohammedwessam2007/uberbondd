import { exactObligationKey, semanticHash } from './crown-closure.mjs';

// Research prototype: factor unresolved leaf debt across distinct programs,
// then attach the full dependent-root cut to each exact obligation. This lets
// one adjudication target many blocked artifacts without merging the artifacts
// or discarding their different verification obligations.
export function factorFrontierResidualCut(programs) {
  if (!Array.isArray(programs) || programs.length > 4096) throw new Error('bounded-program-list-required');
  const groups = new Map(), seen = new Set();
  for (const program of programs) {
    if (!program.id || seen.has(program.id) || !Array.isArray(program.nodes) || program.nodes.length > 4096 || !Array.isArray(program.roots)) throw new Error('unique-bounded-program-required');
    seen.add(program.id);
    const byId = new Map(program.nodes.map(node=>[node.id,node]));
    if (new Set(program.roots).size !== program.roots.length || program.roots.some(id => !byId.has(id))) throw new Error('unique-existing-roots-required');
    const validated = new Set(), checking = new Set();
    function validateDag(id) {
      if (validated.has(id)) return;
      const node = byId.get(id);
      if (!node || checking.has(id)) throw new Error('missing-or-cyclic-dependency');
      checking.add(id);
      for (const dep of node.dependencies ?? []) validateDag(dep);
      checking.delete(id); validated.add(id);
    }
    for (const id of byId.keys()) validateDag(id);
    if (byId.size !== program.nodes.length) throw new Error('duplicate-node-id');
    const memo = new Map(), visiting = new Set();
    function leaves(id) {
      if (memo.has(id)) return memo.get(id);
      const node = byId.get(id);
      if (!node || visiting.has(id)) throw new Error('missing-or-cyclic-dependency');
      visiting.add(id);
      if (node.resolved !== true && node.resolved !== false) throw new Error('resolution-state-unknown');
      let result;
      if (node.resolved) result = new Set();
      else if (node.obligation) {
        if ((node.dependencies || []).length) throw new Error('residual-obligation-must-be-leaf');
        const key = exactObligationKey(node.obligation);
        if (!groups.has(key)) groups.set(key,{key,obligation:structuredClone(node.obligation),consumers:[]});
        result = new Set([key]);
      } else {
        if (!Array.isArray(node.dependencies) || !node.dependencies.length) throw new Error('unresolved-leaf-obligation-required');
        result = new Set(node.dependencies.flatMap(dep=>[...leaves(dep)]));
      }
      visiting.delete(id);memo.set(id,result);return result;
    }
    for (const root of program.roots) for (const key of leaves(root)) groups.get(key).consumers.push({programId:program.id,rootId:root});
  }
  const cuts = [...groups.values()].sort((a,b)=>a.key.localeCompare(b.key));
  return {status:'RESIDUAL_CUT_PLAN_ONLY',cuts,planHash:semanticHash(cuts),totalRootObligations:cuts.reduce((n,c)=>n+c.consumers.length,0),uniqueResidualObligations:cuts.length,adjudicationsPerformed:0,promotionAuthority:'NONE',claimBoundary:'Exact leaf identity and graph factoring only. No global invention priority, quality equivalence, live fanout or realized savings claim.'};
}
