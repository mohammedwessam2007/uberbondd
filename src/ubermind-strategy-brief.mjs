// Deterministic zero-inference strategic evidence selector; never a legal verdict or model router.
// Compiles only pointers, never uploads copyrighted books, calls a model or performs effects.
export function compileStrategicBrief(input,index,{maxChars=2200}={}){
  if(typeof input!=="string"||!input.trim())throw new TypeError("A nonempty mission is required");
  if(input.length>3200)throw new RangeError("Mission exceeds 3200 characters; supply a focused decision");
  if(!index||!Array.isArray(index.thinkers)||!Array.isArray(index.domains))throw new TypeError("Invalid strategy index");
  const text=input.toLowerCase().replace(/[^a-z0-9\u0600-\u06ff]+/g," ");
  const keys={
    "jurisdictional-arbitrage":["jurisdiction","wyoming","delaware","offshore","residency","resident","company formation","incorporat","permanent establishment","nexus","entity structure","cross border"],
    "contract-mechanics":["contract","nda","indemn","liability cap","liquidated damages","termination","arbitrat","agreement","warranty","penalty","terms of service"],
    "asset-insulation-trust-law":["asset protection","trust law","trust fund","trust entity","trust structure","trustee","creditor","insolvenc","shield assets","beneficial owner","llc","litigat","insurance","separateness"],
    "statutory-tax-planning":["tax","deduction","write off","depreciat","withholding","transfer pricing","corporate income","vat","treaty","irc","irs"],
    "venture-and-corporate-finance":["equity","vc","venture","investor","seed round","valuation","dilution","buyout","mezzanine","cap table","convertible","safe note","debt","irr"],
    "hyper-efficient-execution":["automat","operations","outsource","delivery","fulfil","fulfill","process","cost arbitrage","lean","workflow","profit margin","scalab"],
    "competitive-intelligence":["competitor","competition","market research","positioning","market data","intelligence","benchmark","trend","customer research","industry"]
  };
  const lens={
    "machiavelli":["power","stakeholder","leverage","coalition","status","reputation","authority","decision maker"],
    "greene":["position","negotiat","strategy","leverage","competition","reputation","opponent"],
    "bismarck":["coalition","allianc","pragmatic","realpolitik","institution","politic","partnership"],
    "rand":["ownership","profit","founder","autonomy","value","independence","capital"],
    "stirner":["autonomy","personal freedom","nonbinding","social pressure","independence"],
    "sun-tzu":["competitor","strategy","market entry","position","asymmet","battle","rival"],
    "von-neumann":["game theor","payoff","negotiat","equilibrium","countermove","bargain","pricing"],
    "hart":["law","statut","legal","regulat","compliance","tax","jurisdiction"],
    "holmes":["liability","contract","court","litigation","legal","enforce","dispute"]
  };
  const stems=new Set(["incorporat","indemn","arbitrat","insolvenc","litigat","depreciat","automat","fulfil","fulfill","scalab","regulat","outsourc","negotia","asymmet"]);
  const matching=(p)=>{
    let hits=0;
    for(const raw of p){
      const word=raw.toLowerCase().replace(/[^a-z0-9\u0600-\u06ff]+/g," ").trim();
      if(!word)continue;
      const escaped=word;
      if(new RegExp("\\b"+escaped+(stems.has(word)?"\\w*":"")+"\\b").test(text))hits++;
    }
    return hits;
  };
  const domains=index.domains.map(x=>({id:x.id,score:matching(keys[x.id]||[])})).filter(x=>x.score>0).sort((a,b)=>b.score-a.score||a.id.localeCompare(b.id)).slice(0,3);
  const thinkers=index.thinkers.map(x=>({id:x.id,score:matching(lens[x.id]||[])})).filter(x=>x.score>0).sort((a,b)=>b.score-a.score||a.id.localeCompare(b.id)).slice(0,4);
  const highImpact=/\b(tax|contract|law|legal|fraud|asset|bank|incorporat|regulat|liability|litigat|personal data|privacy|debt|investor)\w*\b/.test(text);
  const social=/\b(buyer|customer|sales|trust|conflict|relationship|negotia|procurement|partner|human|reply|objection|empathy|status)\w*/.test(text);
  const packet={
    schema:"ubermind.strategy.microbrief.v1",
    lead:"Opus frontier; no subordinate model calls unless evidence justifies them",
    route:domains.length?"EVIDENCE_LED":social?"EQ_FIRST":"UNCLASSIFIED_REQUIRES_OPUS_SELECTION",
    topics:domains.map(x=>x.id),
    lenses:thinkers.map(x=>x.id),
    eq:social?"Use Ω46; observations are not mind-reading":undefined,
    gates:highImpact?"Date+jurisdiction+official law; counsel before consequential acts; no assumed clearance":"Authority, observed proof and counterparty agency",
    task:"Opus: compare realistic options, counterpart countermoves and second-order costs; choose reversible first test and explicit falsifier",
    sourcePointers:[
      "config/ubermind-omega47-strategic-philosophy-index.json",
      "docs/architecture/UBERMIND_OMEGA47_STRATEGIC_PHILOSOPHY_CORPUS_2026-10-24.md",
      ...(social?[".claude/skills/ubermind-social-strategy/SKILL.md"]:[]),
      ...(text.includes("machiavelli")?["docs/architecture/UBERMIND_OMEGA47_MACHIAVELLI_COMPLETE_SOURCE_INDEX_2026-10-24.md"]:[])
    ],
    missing:"Any motive, law, benchmark, price, ROI, payment or outcome not independently observed remains unknown",
    effects:"NONE; zero paid API, outreach, spending, disclosure or deployment"
  };
  if(packet.route==="UNCLASSIFIED_REQUIRES_OPUS_SELECTION")packet.task="No reliable local match; Opus selects the appropriate donor without invented expertise";
  const omit=["missing","task","sourcePointers","eq"];
  while(JSON.stringify(packet).length>maxChars&&omit.length){delete packet[omit.shift()];}
  if(JSON.stringify(packet).length>maxChars)throw new RangeError("Microbrief budget too small");
  return packet;
}
