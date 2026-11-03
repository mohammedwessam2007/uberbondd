// PHOENIX: deterministic, read-only founder-idea crossover retrieval.
// No side effects, external model calls, or authority granted by idea text.
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
const STOP = new Set('the and for with that this from into over across have has would could should their they are its not all new make where more than then your through using each same only which being what when while such can how one two via onto every instead'.split(' '));
export function tokens(value) {
  return (String(value).toLowerCase().match(/[a-z][a-z0-9-]{2,}/g) || []).filter(x => !STOP.has(x));
}
export function validateCorpus(ideas) {
  if (!Array.isArray(ideas) || ideas.length !== 890) throw new Error('Expected exactly 890 founder ideas');
  const seen = new Set();
  for (let k = 0; k < ideas.length; k++) {
    const x = ideas[k];
    const ordinal = x.ordinal ?? x.number;
    const id = 'founder-moonshot-' + String(k + 1).padStart(4, '0');
    if (ordinal !== k + 1 || x.id !== id || typeof x.title !== 'string' || typeof x.body !== 'string' || !x.body.trim() || (x.sha256 && createHash('sha256').update(x.body).digest('hex') !== x.sha256) || seen.has(x.id)) throw new Error('Corpus identity/body mismatch at ' + id);
    seen.add(x.id);
  }
  return ideas;
}
export function retrieveCrossovers(ideas, query, limit = 12) {
  validateCorpus(ideas);
  if (typeof query !== 'string' || !query.trim() || !Number.isInteger(limit) || limit < 1 || limit > 890) throw new Error('Invalid query or limit');
  const docs = ideas.map(x => {
    const counts = new Map();
    for (const t of tokens(x.title + ' ' + x.title + ' ' + x.body)) counts.set(t, (counts.get(t) || 0) + 1);
    return counts;
  });
  const df = new Map();
  for (const d of docs) for (const t of d.keys()) df.set(t, (df.get(t) || 0) + 1);
  const q = new Map();
  for (const t of tokens(query)) q.set(t, Math.min(3, (q.get(t) || 0) + 1));
  const scores = docs.map(d => {
    const len = [...d.values()].reduce((a, v) => a + v, 0) || 1;
    let score = 0;
    for (const [t, count] of q) {
      const f = d.get(t) || 0;
      const idf = Math.log(1 + (890 - (df.get(t) || 0) + .5) / ((df.get(t) || 0) + .5));
      score += idf * f * 2.2 / (f + 1.2 * (.25 + .75 * len / 70)) * count;
    }
    return score;
  });
  const selected = [], remaining = new Set(ideas.map((_, k) => k).filter(k => scores[k] > 0));
  while (selected.length < limit && remaining.size > 0) {
    let best = -1, merit = -Infinity;
    for (const k of remaining) {
      let overlap = 0;
      for (const j of selected) {
        let common = 0;
        for (const t of docs[k].keys()) if (docs[j].has(t)) common++;
        overlap = Math.max(overlap, common / Math.max(1, docs[k].size + docs[j].size - common));
      }
      // Later ideas receive a bounded preference, never a substitute for evidence or relevance.
      const latePrior = scores[k] > 0 && k >= 712 ? .12 : 0;
      const m = scores[k] + latePrior - .32 * overlap;
      if (m > merit || (m === merit && (best < 0 || k < best))) { merit = m; best = k; }
    }
    remaining.delete(best); selected.push(best);
  }
  return selected.map(k => ({ id: ideas[k].id, title: ideas[k].title, ordinal: k + 1, score: Number(scores[k].toFixed(4)), body_sha256: ideas[k].sha256 ?? null, truth: 'FOUNDER_HYPOTHESIS_NOT_PROOF' }));
}
export function loadRegistry(path) {
  const raw = readFileSync(path, 'utf8');
  const data = path.endsWith('.jsonl') ? raw.split(/\r?\n/).filter(Boolean).map(line => JSON.parse(line)) : JSON.parse(raw);
  const items = Array.isArray(data) ? data : data.ideas;
  if (!Array.isArray(items)) throw new Error('Registry must contain an ideas array');
  return validateCorpus(items.map(x => ({ ...x, body: x.body ?? x.exact_original_body, sha256: x.sha256 ?? x.exact_source_bytes_sha256 })));

}
