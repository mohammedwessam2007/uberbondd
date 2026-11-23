import { Maia3 } from "maia3-js";
import fs from "fs";
const fens = JSON.parse(fs.readFileSync(process.argv[2]));
const maia = new Maia3({ variant: "5m" });
await maia.load();
const out = [];
for (const fen of fens) {
  const r = await maia.predict({ fen, selfElo: 2200, oppoElo: 2200, temperature: 1, topK: 500 });
  out.push({ fen, best: r.bestMove, cands: r.candidates.slice(0, 5).map(c => [c.uci, c.probability]), wdl: r.wdl });
}
console.log(JSON.stringify(out));
