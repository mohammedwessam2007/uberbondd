# GENESIS realization: Autonomy Compression Ratio

Candidate: `genesis-candidate-20260922-0021`

Status: **SOURCE IMPLEMENTED / HYPOTHESIS NOT GENERALLY PROVEN**

GENESIS proposed measuring how much accepted task-equivalent work has safely moved from frontier cognition into deterministic, JEV/System-One, or local-model layers.

The realization is `src/autonomy-compression-ratio.mjs`.

It measures quality-adjusted accepted work, frontier-token intensity, defects, hidden frontier intervention, acceptance, and the share of accepted work completed by compiled/local layers. Comparison is allowed only across the same declared task population.

The candidate falsifier is executable: a rising compression ratio becomes `AUTONOMY_COMPRESSION_GAMING_RISK` if defects, hidden frontier intervention, acceptance loss, or accepted-quality loss exceed the declared thresholds.

A fixed synthetic replay proves the implementation behaves as specified. It does not establish that UberBond has achieved a particular real-world compression ratio. That requires real task receipts.

Focused implementation harness on 2026-09-22: **6/6 pass, 0 fail**.
