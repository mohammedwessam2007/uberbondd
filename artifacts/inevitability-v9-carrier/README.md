# UberBond V9 full-source lossless repository carrier

This directory preserves **every byte** of `UBERBOND_NULLSTAR_OMEGA_INFINITY_INEVITABILITY_ENGINE_V9.txt` inside Git. The canonical source is **146,566,257 bytes**, **232,406 lines**, SHA-256 `8ad73f53116107acea824f6847aa6f29845e263b3ec01d241b90aae5719fe55d`.

GitHub will not accept the 146 MB source as one ordinary blob. The repository therefore stores a reversible Brotli Q11 carrier in 16 base64 text parts. That is storage encoding, not semantic compression: `node scripts/materialize-inevitability-v9.mjs` reconstructs the exact original and refuses success unless every part hash, compressed-stream hash, byte count, line count, and canonical SHA-256 match.

Derived indexes, summaries, embeddings, compiled directives, retrieval caches, or context slices may improve access but may never replace this carrier or the reconstructed canonical source.
