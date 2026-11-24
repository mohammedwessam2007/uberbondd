# Pre-registration: trained evaluator v3 (written 2026-11-24T02:55:21Z, before training)
Changes vs V9 attempts: incremental quantized accumulator (no full recomputation; nncheck exact), 5.6x more quiet data
(384,444 rows after dedupe target: lab/data/selfplay_s11-13 + nnue/dataset_v2_selfplay; game-disjoint by self-play id),
residual target on EvalV2, scaling curve 50k / 150k / all. H=128.
Promotion criteria (vs frozen V8 reference, ref:2): equal-time 10s+0.1 48 games point estimate > +20 Elo with lower 95%
bound > -40; equal-nodes (50k) not worse than -20 point estimate. Otherwise stays opt-in (EvalVersion 3 off by default).
Scaling decision rule: if validation loss gain from 150k -> all is < 2% relative, larger data generation is not the next lever.
