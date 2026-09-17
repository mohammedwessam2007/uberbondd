# UberBond V9 lossless carrier

Git cannot store the 146,566,257-byte V9 as one normal GitHub blob (>100 MB). This directory stores the exact V7 ancestor losslessly as eight XZ/base64 parts plus the exact deterministic V8/V9 generator. Nothing is summarized. Run `python3 scripts/materialize-inevitability-v9.py`; success requires 146,566,257 bytes, 232,406 lines and SHA-256 `8ad73f53116107acea824f6847aa6f29845e263b3ec01d241b90aae5719fe55d`. The reconstructed canonical file is `.uberbond/v9/immutable/UBERBOND_NULLSTAR_OMEGA_INFINITY_INEVITABILITY_ENGINE_V9.txt`.
