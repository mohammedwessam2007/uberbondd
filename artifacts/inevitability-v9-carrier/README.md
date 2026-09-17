# UberBond V9 lossless repository carrier

This directory preserves the complete 146,566,257-byte `UBERBOND_NULLSTAR_OMEGA_INFINITY_INEVITABILITY_ENGINE_V9.txt` in Git without amputating a byte. Git stores a reversible Brotli carrier split into 128 base64 text parts. `node scripts/materialize-inevitability-v9.mjs` reconstructs the raw source at `.uberbond/v9/immutable/UBERBOND_NULLSTAR_OMEGA_INFINITY_INEVITABILITY_ENGINE_V9.txt` and refuses success unless the result is exactly 146,566,257 bytes, 232,406 lines, and SHA-256 `8ad73f53116107acea824f6847aa6f29845e263b3ec01d241b90aae5719fe55d`.

The compressed stream is also verified at 1,074,194 bytes with SHA-256 `0f8d1b231852b7b11637d27ea7774c42990714924dd50d0c05c43081731b94fb` before decompression.

Indexes, summaries, embeddings, compiled directives, and context slices are derived caches only. They may improve retrieval but may never replace the reconstructable canonical bytes. Lossless compression is storage representation, not semantic compression.
