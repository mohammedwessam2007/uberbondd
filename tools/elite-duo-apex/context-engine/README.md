# Native context-economy engine

## Zones

- Green: continue normally.
- Yellow: route noisy exploration to isolated Sonnet workers and avoid large main-context reads.
- Orange: finish the current phase, snapshot decisions, and prepare focused compaction.
- Red: do not start a new large branch; compact at the next safe boundary or rewind an abandoned branch.
- Critical: persist state immediately. Allow only work necessary to reach a safe compaction or stop boundary.

## The engine never

- switches to a cheaper model;
- deletes evidence without a recoverable pointer;
- treats compaction as proof of completion;
- compacts merely to make the status bar look small;
- uses a fork as an independent reviewer.
