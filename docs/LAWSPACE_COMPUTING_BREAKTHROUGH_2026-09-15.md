# Lawspace Computing: A Breakthrough Research Program

Date: 2026-09-15
Base: `acd51138b6b5204f32b7dbe74e862c76ccee7b2f`
Status: `SPECULATIVE_RESEARCH_HYPOTHESIS / NOT_IMPLEMENTATION_PROOF / NOT_ASI_CLAIM`

## Mission

Find a lawful path to frontier-effective cognition whose fresh digital-compute requirement falls radically below transformer-era scaling by changing the computational abstraction itself.

The hypothesis is **Lawspace Computing**: compile a problem into a temporary dynamical law whose natural evolution performs the search, then use verified experience to reshape that law so mastered problem classes converge faster in the future.

This does not remove physics or hardware. It attempts to replace repeated instruction-by-instruction digital search with a substrate-neutral dynamical computation that can initially run as a software simulation and later map to optical, analog electronic, memristive, superconducting, mechanical, chemical, neuromorphic, or other lawful physical substrates.

## Why this is different

Current frontier AI usually learns a large parameterized function and repeatedly executes it. Existing analog accelerators usually map known neural or optimization workloads onto specialized hardware. Existing continuous-time SAT and memcomputing systems compile specific constraint classes into dynamical systems. Existing analog-programming systems can describe and validate known dynamical compute paradigms.

Lawspace targets the missing layer between them:

> **A general semantic-to-dynamics compiler that discovers, verifies, stores, composes, and continually improves problem-specific laws of motion.**

The desired long-term transition is:

`problem -> instructions -> repeated digital execution`

becoming

`problem -> verified constraints/invariants -> temporary artificial physics -> natural settling/search -> verified solution`

and then

`verified solution family -> simpler reusable law -> fewer future dynamics -> lower marginal compute`

## Public donor evidence

These are donors, not evidence that the synthesis works.

1. Continuous-time SAT/MaxSAT systems demonstrate that Boolean solutions can be encoded as stable states of coupled ODEs and reached through continuous dynamics.
   - https://doi.org/10.1016/j.cpc.2020.107469
   - https://www.nature.com/articles/s41467-018-07327-2
2. Digital memcomputing demonstrates memory-assisted collective dynamics for constraint solving and motivates computation through system-wide state evolution rather than serial branching.
   - https://www.nature.com/articles/s41598-020-76666-2
3. Microsoft's Analog Optical Computer demonstrates a unified fixed-point abstraction for equilibrium-model inference and optimization, with analog feedback loops and consumer-grade optical/electronic components.
   - https://doi.org/10.1038/s41586-025-09430-z
4. Physical neural-network research argues that direct physical computation may enable radically more efficient and private edge inference, while explicitly noting that scalable training remains unsolved.
   - https://www.nature.com/articles/s41586-025-09384-2
5. Equilibrium propagation shows that physical laws can compute learning gradients locally, including extensions to dissipative mechanical/electrical dynamics.
   - https://advanced.onlinelibrary.wiley.com/doi/10.1002/aisy.202501310
6. Momentum-driven reversible logic shows that transient momentum can be a computational resource, improving speed and fidelity without the same energy penalty as quasi-static storage in a demonstrated physical model.
   - https://www.nature.com/articles/s44335-026-00095-z
7. Thermodynamic computing formalizes exploiting intrinsic physical, chemical, or biological dynamics as computation.
   - https://www.nature.com/articles/s44335-026-00057-5
8. Photonic reservoir computing has demonstrated extremely high throughput and low energy per operation on bounded tasks, illustrating the value of using native physical dynamics instead of digitally emulating them.
   - https://www.nature.com/articles/s41467-025-67983-z
9. Neural cellular automata show that global adaptive behavior can emerge from local reusable update rules and provide a donor for morphogenetic computation.
   - https://www.sciencedirect.com/science/article/pii/S1571064525001757
10. Active inference provides a principled way to choose observations/actions by expected information gain between competing world models.
   - https://www.nature.com/articles/s41467-026-77209-5
11. Classical computability results establish that continuous ODE systems can in principle realize universal computation. This proves expressive possibility, not efficient computation.
   - https://doi.org/10.1016/0304-3975(94)00147-B
12. Ark is an important near-neighbor: a language and compiler for describing/validating analog compute paradigms. Lawspace must go beyond describing known dynamics by **discovering task-specific dynamics from semantic constraints**.
   - https://arxiv.org/abs/2309.08774

## The new abstraction: Cognitive Law IR

A mission is compiled into a substrate-neutral intermediate representation containing:

- typed state variables;
- hard constraints;
- soft objectives;
- known invariants;
- conditional equivalences;
- observed evidence;
- uncertainty;
- verification predicates;
- wormhole transformations;
- failure/forbidden regions;
- intervention ports for new observations;
- cost dimensions including wall-clock, energy, founder time, external calls and verification burden.

The IR is not itself a solution. It is a specification from which candidate dynamics can be synthesized.

## Artificial cognitive physics

For a continuous state `z` and optional momentum/workspace state `p`, a candidate Lawspace cell can be represented schematically by:

`dz/dt = dH/dp`

`dp/dt = -dH/dz - Gamma*p + U_observe + Xi`

where the Hamiltonian/effective objective contains a task field:

`H(z,p) = K(p) + Phi_constraints(z) + Phi_failures(z) - Phi_wormholes(z) + Phi_uncertainty(z)`

Interpretation:

- verified solutions should form stable or decodable solution manifolds;
- violated constraints create restoring forces;
- verified dead regions create repulsive structure;
- reusable wormholes create low-action corridors;
- momentum preserves transient computational state and helps cross shallow barriers;
- controlled stochasticity can explore when deterministic settling is insufficient;
- observations alter the field only through explicit evidence ports.

The equation family is deliberately not fixed. The meta-compiler searches over dynamical families, discrete/continuous hybrids, update laws and representations.

## The genuinely new mechanism: problem-induced physics

Instead of asking a fixed neural model to solve every problem, Lawspace asks:

1. What are the irreducible constraints of this problem?
2. What state representation makes them local?
3. What dynamics would make invalid states unstable and valid states attractive?
4. What conserved quantity or invariant can replace search?
5. What prior solved motifs can be embedded as attractors or low-action paths?
6. What failure regions can safely repel the trajectory?
7. What minimal observation would maximally reshape the landscape?
8. What physical or digital substrate can realize these dynamics most cheaply?

A successful answer becomes a **law**, not just a trajectory.

## Law crystallization

Every solved mission attempts to compile its expensive reasoning into one or more reusable structures:

- a simpler ODE/update law;
- deterministic code;
- a theorem/invariant;
- an attractor initialization policy;
- an associative-memory prototype;
- a specialized local rule;
- a constraint macro;
- a proof-carrying topology rewrite;
- a tiny specialist model;
- a verified solver configuration.

Promotion requires held-out transfer. A law that only memorizes solved instances is not a wormhole.

## Equilibrium internalization target

Recent attractor-model work reports a phenomenon called equilibrium internalization, where fixed-point training can place initial states near the final equilibrium so much of the iterative solver can eventually be removed at inference.

Lawspace generalizes this into a research objective:

> A mastered problem family should require progressively less trajectory length because the compiler learns to initialize or directly map the state near a verified solution manifold.

The asymptotic dream is **zero-search cognition for mastered structures**, while novel problems still consume fresh search.

## Morphogenetic compute

The computational graph should not be static. Local cells can spawn, merge, freeze or disappear according to problem structure.

A hard subgraph recruits more compute. A settled subgraph freezes. A repeated motif crystallizes into one macro-cell. This imports the local-rule/self-organization lesson from neural cellular automata without claiming biological equivalence.

The result is problem-shaped computation rather than a fixed giant model executing uniformly.

## Substrate virtualization

Lawspace must separate the cognitive law from the device that realizes it.

Candidate backends include:

- ordinary CPU/GPU numerical integration for the first prototype;
- SIMD/vector engines;
- FPGA fixed-point/continuous-time approximations;
- analog RLC networks;
- memristive crossbars;
- optical fixed-point feedback;
- photonic reservoirs;
- superconducting reversible/momentum logic;
- future thermodynamic or material reservoirs.

A Lawspace program is admissible only if it has a deterministic digital reference implementation for verification, even when a physical backend is faster.

## What would make this revolutionary

The breakthrough is not `analog is efficient`. That is known.

The breakthrough would be evidence for all of the following together:

1. arbitrary structured tasks can be compiled into a common Cognitive Law IR;
2. the compiler can automatically synthesize useful dynamics rather than relying on a human to hand-design them;
3. solved structures transfer as reusable laws across unseen instances;
4. trajectory length or energy falls as the law library grows;
5. law composition produces super-additive transfer across domains;
6. physical backends preserve the verified semantics closely enough to retain the gains;
7. the meta-compiler itself improves from accumulated experiments without self-certifying.

## Falsifiable experiments

### Experiment 0: software-only Lawspace canary

Domains:
- SAT;
- Sudoku/Latin-square constraints;
- shortest-path/planning;
- small symbolic-equation solving;
- bounded program-repair constraints.

Compare:
- standard algorithmic baseline;
- fixed generic dynamical solver;
- task-compiled dynamics;
- task-compiled dynamics plus prior crystallized laws;
- task-compiled dynamics plus failure geometry.

Measure:
- verified solution rate;
- wall-clock;
- numerical integration steps;
- state updates;
- energy proxy;
- reuse rate;
- transfer to held-out sizes/distributions;
- failure due to spurious attractors;
- compiler overhead.

Kill criterion: if the compiler overhead plus dynamics does not beat or reveal a credible scaling advantage over standard algorithms on any targeted structure class, do not promote the architecture.

### Experiment 1: law transfer

Train/synthesize dynamics on families A/B, then test structurally related held-out family C. Require measurable benefit from reusable law motifs versus fresh compilation.

### Experiment 2: attractor internalization

Track convergence steps across repeated related tasks. The key signal is whether median trajectory length falls without reducing verified accuracy.

### Experiment 3: failure geometry

Promote narrow verified failure regions and test whether they reduce search while preserving solution recall on adversarial counterexamples.

### Experiment 4: momentum workspace

Compare first-order relaxation against second-order/momentum dynamics at matched quality/cost. Recent physical results make this worth testing, but no gain is assumed.

### Experiment 5: substrate migration

Run one identical Cognitive Law IR through a numerical backend and one available physical/analog proxy. Verify output equivalence and measure efficiency. No physical advantage may be claimed from simulation alone.

## Unknown-unknown search inside Lawspace

The meta-research loop should mutate not only parameters but the computational laws themselves:

`task family -> generate candidate representations -> generate candidate dynamics -> simulate -> adversarial verify -> measure convergence/cost -> identify transferable motifs -> crystallize laws -> compose laws -> search for simpler meta-law -> repeat`

High-value discoveries are those that reduce the minimum physical work for broad future task families.

## Relationship to the Interstellar Wormhole program

The Interstellar program operates primarily in cognitive topology. Lawspace provides a candidate **execution substrate for wormholes**.

- topology rewrite becomes a change in the field/dynamics;
- antimatter geometry becomes repulsive potential or exclusion constraints;
- wormholes become low-action transitions or compiled macro-dynamics;
- representation forge chooses coordinates for the field;
- information-gradient navigation selects external observations;
- dream compilation searches for simpler laws after missions;
- phase-transition telemetry measures whether convergence cost actually falls.

## Truth boundary

- There is no evidence that Lawspace delivers frontier-model capability today.
- There is no evidence of ASI, a singularity, super-Turing computation, unlimited compute, or computation without physical hardware.
- Turing universality says a dynamical substrate can express general computation; it does not imply efficient execution.
- Apparent analog speedups may hide precision, energy, scaling, conversion, calibration, manufacturing or verification costs.
- Complexity-theoretic limits are not repealed by calling an algorithm physics.
- The semantic-to-dynamics compiler is the central unsolved research problem.
- Any claimed breakthrough requires held-out benchmarks, adversarial testing, resource accounting and later physical receipts.

## North-star experiment

The first serious milestone is not a new chip.

It is:

> **Demonstrate that a software-simulated semantic-to-dynamics compiler learns reusable laws that reduce verified convergence cost on unseen related problem instances, then migrate the same law representation to a physical substrate without changing the task semantics.**

If that works, we have evidence for a new computational architecture worth scaling. If it fails, we have learned exactly which assumption was false without spending frontier-lab hardware money.
