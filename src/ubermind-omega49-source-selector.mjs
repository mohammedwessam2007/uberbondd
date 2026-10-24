export function selectStrategy49(query, catalog) {
  if (typeof query !== "string" || !query.trim() || query.length > 3200) throw Error("MISSION_REQUIRED");
  if (catalog?.schema !== "uberbond.ubermind.omega49.asymmetric-strategy-index.v1") throw Error("CATALOG_REQUIRED");
  const text = " " + query.toLowerCase().replace(/[^a-z0-9]+/g, " ") + " ";
  const match = entries => entries.map(entry => ({
    id: entry.id,
    n: entry.terms.filter(t => text.includes(" " + t.toLowerCase().replace(/[^a-z0-9]+/g, " ") + " ")).length
  })).filter(x=>x.n>0).sort((a,b)=>b.n-a.n||a.id.localeCompare(b.id)).slice(0,2).map(x=>x.id);
  const topics=match(catalog.domains), thinkers=match(catalog.thinkers);
  if (!topics.length && !thinkers.length) return null;
  return {schema:"omega49.strategy-pointers.v1",topics,thinkers,source:catalog.doc,
    mode:"RESEARCH_ONLY",authority:"NO_EXTERNAL_EFFECTS"};
}
