# UBERMIND Ω47 · Machiavelli strategic canon

**2026-10-24 · Status: WORKING LOCAL SOURCE-INDEX AND CURATED INTERPRETATIONS, NOT MODEL WEIGHT TRAINING**

## Scope, provenance and intellectual honesty

The founder requested that Machiavelli's principles become part of UberMind's human/business intelligence and permanent Opus-first cognitive tools. This addition expands the existing Ω46 social-strategy skill. It is not a new terminal mission, cannot overrule the Sovereign Cognitive Continuum/Personal Civilization North Stars, and must preserve all 890 founder ideas and GENESIS descendants.

We indexed four major works **by address**, using verified Project Gutenberg editions and chapter/book headings:

| Work | Translation / published digital edition | Address coverage |
| --- | --- | --- |
| *The Prince* | W. K. Marriott / [Gutenberg #1232](https://www.gutenberg.org/ebooks/1232) | 26/26 chapter addresses |
| *Discourses on the First Decade of Titus Livius* | Ninian Hill Thomson / [Gutenberg #10827](https://www.gutenberg.org/ebooks/10827) | 142/142 chapter addresses across I:60, II:33, III:49 |
| *The Art of War* | Peter Whitehorne / [Gutenberg #15772](https://www.gutenberg.org/ebooks/15772) | 7/7 book addresses |
| *Florentine Histories* | Gutenberg #2464, 1901 edition does not name a translator / [Gutenberg #2464](https://www.gutenberg.org/ebooks/2464) | 8/8 book addresses |

**Coverage does NOT mean entire full texts have been ingested, annotated or verified line-by-line.** The packaged JSON contains 183 source-address slots and **106 curated source-themed interpretations** (26 Prince, 65 Discourses, 7 Art of War, 8 Histories). The source addresses are factual metadata; the original historical paraphrases and modern business analogies are interpretive and contestable, not Machiavelli's verbatim words. Book-level Art of War and Histories entries are broad hypotheses, not verified claims about every passage. A full scholarly edition-level, text-by-text exhaustive reading would require further source ingestion and review.

The source corpus is stored as versioned Base64-encoded Brotli-compressed JSON in `artifacts/strategy/machiavelli-principles.v1.json.br.b64` for economy and repeatable retrieval; no third-party code executes when it is read. SHA-256 of the uncompressed JSON: `56e4a5eb45189e2b238dbf6c758a50280366214c0a324b8656173b2400f12c1b`. Byte-level compressed blob SHA-256: `b2dbd6a243d958e4d47ffa4f4ed766fd7469e64cb39a40a8e1863042d9931074`. Source URL references are not proofs of the exact quotations in every passage. The corpus contains no full copyrighted book copies. English translation licensing is jurisdiction-specific; publishers mark editions public domain in the USA, not automatically worldwide.

## Core historical disciplines, including uncomfortable contradictions

1. **Virtù and fortuna**: skilled judgment, preparation, flexibility, timing, uncertainty; *The Prince* VI–VII, XXIV–XXV; *Discourses* III.IX. Do not confuse historical *virtù* with moral virtue or guaranteed prediction.
2. **Independent capacity, dependency and mercenaries**: hired or auxiliary power can undermine autonomy; *Prince* XII–XIV; *Discourses* II.XX. Business analogue: maintain portable capabilities and supplier exit routes.
3. **Reputation, fear, love, hatred and contempt**: *Prince* XV–XIX, XXI. Historically some claims defend harsh rule. Business must use lawful, transparent boundaries and earned trust, not intimidation.
4. **Incentives of elites and ordinary people**: *Prince* IX; *Discourses* I.III–V. Business analogue: buyer, users, procurement, managers and stakeholders may have different interests.
5. **Appearance and information asymmetry**: *Prince* XVIII, XXII–XXIII; *Discourses* I.VIII, I.XLV, III.XXXIV. Recognize deceptive conduct in the world; do not recommend false promises, fabricated social proof or concealment of material terms.
6. **Institutions, liberty and accountable opposition**: *Discourses* I.IV, I.VII–X, I.XXXIV–XXXV, I.XLV, I.LVIII. *The Prince* is not the whole Machiavelli: he also defended republics, speech, law and the productive tension of institutional checks.
7. **Good advisers and anti-flattery**: *Prince* XXII–XXIII; *Discourses* III.XVI, III.XXXIV. Use falsifiers, independent measurements and dissenting specialists around Opus.
8. **Negotiation, alliances, grievances and overreach**: *Discourses* II.XI, II.XV, II.XXVI–XXX, III.XXXV. Business analogue: preserve BATNAs, understand partner constraints, repair complaints and avoid turning an acceptable deal into defeat through excess demands.
9. **Historical pattern recognition and counter-moves**: *Discourses* I.XXXIX, III.XVIII, III.XXXIX, III.XLVIII; *Florentine Histories* (eight books). Historical analogy is a hypothesis generator, not causal or commercial proof.
10. **Adaptation versus fixed temperament**: *Prince* XXV, *Discourses* III.IX, contextualized by scholarship. Change routes as evidence changes; note Machiavelli himself doubted whether individuals can freely change entrenched character.
11. **Succession and the limits of one great ruler**: *Discourses* I.XX, III.XXIV. Build founder-independent organizations, permissions and memory, even when Opus stays the frontier lead.
12. **Humane conduct can be strategically consequential**: *Discourses* III.XX. A respectful remedy may build more trust than pressure. This does not reduce dignity to a tool for getting money.

**Tension to preserve:** The Prince analyzes acquisition/maintenance of personal power, sometimes discussing brutality and broken promises, whereas Discourses also values liberty, public deliberation, distributed judgment and institutional freedom. Stanford Encyclopedia emphasizes longstanding scholarly disagreement on Machiavelli's political commitments: https://plato.stanford.edu/entries/machiavelli/ . Do not pick the most ruthless passage and falsely claim it represents all of Machiavelli or modern ethical business practice. His work is historically contextual, with inaccurate stereotypes in some passages.

## Executable local retrieval

These commands use **zero LLM calls**, zero network, and no external commercial authority:

```bash
node scripts/machiavelli-canon.mjs status
node scripts/machiavelli-canon.mjs search 'negotiation buyer trust'
node scripts/machiavelli-canon.mjs get MACH-0017
node scripts/machiavelli-canon.mjs chapter PRINCE 18
node scripts/machiavelli-canon.mjs chapter DISCOURSES 1 4
node scripts/machiavelli-canon.mjs chapter ART_OF_WAR 7
node --test tests/machiavelli-strategic-canon.test.mjs
```

The `get` and `search` outputs provide source section IDs, historical paraphrases, optional modern analogy, risk treatment, source links, dataset SHA, and `businessEffectAuthority:NONE`. The `chapter` command explicitly says `originalTextLoaded:false`. Existing `src/inter-sovereign.mjs` still governs hypothetical private emotions, mutuality, consent, uncertainty, and calibration. No new workflow is allowed to assert another person's secret motives as facts or silently contact them.

## Opus-first social-business decision protocol

- **OBSERVE**: explicit claims, behavior and source dates. Identify people with their own interests and agency, never deterministic mind-reading.
- **MACHIAVELLI COUNTERFACTUAL**: ask who controls which resources, the authentic BATNAs, potential coalition response, interests, reputational hazards and how a disclosed strategy would be perceived.
- **EQ**: write at least two alternative non-sensitive explanations for observed emotions/behavior; ask an honest question when uncertainty is high; match tone and cultural preferences from explicit evidence.
- **ECONOMICS**: check customer functional, emotional and social jobs; lawful payment capacity, offer value, alternatives, partner/user benefits and cleared-cash evidence.
- **MUTUALITY / LEGALITY**: refuse manipulative pressure, fear exploitation, impersonation, fraud, engineered division, false scarcity or bypassing voluntary informed consent; don't turn Machiavelli's *descriptions* into authority.
- **ACTION / PROOF**: propose one best legitimate move, fallback, reversal condition and observational test. External messaging, KYC, deployment and payments require separate valid authority.
- **LEARN**: compare prediction with actual response and record correction, maintaining separate historical-source, modern-inference and actual-commercial-evidence classes.

## Remaining gaps, honestly identified

- Full original-text archival ingest of four complete books is NOT performed by this v1 compressed structured index. Future ingestion should verify translation copyright and text SHA, then save chapter-level extracted content with provenance rather than a flood of unreferenced snippets.
- The complete surviving Machiavelli literary/political oeuvre (Mandragola, Clizia, Belfagor, selected letters, diplomatic dispatches, Life of Castruccio, essays and poems) is NOT fully indexed in v1. These are future donors, not silently discarded or mislabeled covered.
- Business effectiveness and human EQ have not been measured. No claim of actual fine-tuning, direct PHOENIX cloud call or approved supplier activation.

**Canon class:** RESEARCH_ASSET + SOURCE_INDEXED_COGNITIVE_CAPABILITY. A model may retrieve and reason from the data when connected to the repository. That is not a change to the model's weights or permanently invisible thought process.
