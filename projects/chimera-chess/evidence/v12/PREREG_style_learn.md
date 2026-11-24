# Pre-registration: learned named-player style heads (written 2026-11-24T10:04:47Z, before running)
Data: CC0 Lichess broadcasts 2021-2026, identity-audited (lab/style_corpus/MANIFEST.json); Dubov, Shirov, Ivanchuk;
<=300 games each, <=8 positions/game; held-out by game (sha256 % 5 == 0).
Success (style is learnable and identifiable): held-out attribution accuracy > chance with z >= 3 AND at least 2 of 3
players' own-head top-1 >= pooled-head top-1. Failure -> named style not identifiable at this data scale; preserved.
