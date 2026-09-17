# UberBond V9 exact-source repository carrier

This directory is a **lossless, hash-locked representation** of the complete `UBERBOND_NULLSTAR_OMEGA_INFINITY_INEVITABILITY_ENGINE_V9.txt`. Canonical identity: **146,566,257 bytes**, **232,406 lines**, SHA-256 `8ad73f53116107acea824f6847aa6f29845e263b3ec01d241b90aae5719fe55d`.

GitHub rejects an ordinary single blob above 100 MB. This repo therefore stores the exact V7 ancestor as an XZ seed plus the exact deterministic V8/V9 generation program, also losslessly compressed. `python3 scripts/materialize-inevitability-v9.py` reconstructs the full 146 MB canonical artifact and refuses success unless the final bytes, line count, and SHA-256 match.

Nothing is summarized away. Derived indexes, embeddings, compiled directives, or context slices are caches only and may never replace the canonical hash-locked reconstruction.
