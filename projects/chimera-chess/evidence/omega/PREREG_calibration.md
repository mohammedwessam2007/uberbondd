# PREREG autonomous style calibration (registered before round 1)
tools/omega/calibrate.py: 5 rounds x 10 games vs sf:2685 at 60+0.6, isolated. Each round's style weights, games, traces and
characteristics are kept (evidence/omega/calibration/). Update rule fixed in code before any round. Soundness gate never changed.
Success criterion: final round within 0.5x-2x of every PDF §6.1 category and draw rate <= 25%; otherwise the residual gaps are reported.
Calibration targets the PDF's playing character only; Regan screening statistics remain archived and are not targets.
