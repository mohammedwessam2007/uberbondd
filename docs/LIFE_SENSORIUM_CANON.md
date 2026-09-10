# UberBond Life Sensorium / Passive Reality Capture

Status: **FOUNDER_SPEC promoted into bounded private-runtime source foundation**

Founder principle:

> **Live first. Log never.**

The Life Sensorium is the perception layer in front of the existing private Thought Ocean, Life Event ledger, Living Mohamed Model and Life Knowledge Graph. Its purpose is to reduce the founder's need to manually explain his own life to UberBond.

It does not mean that every part of life should be recorded. It means that when Mohamed has chosen to make a dimension observable, UberBond should prefer passive, local, privacy-preserving sensing and inference over turning Mohamed into a data-entry operator.

## 1. Target loop

The intended long-horizon loop is:

`REALITY -> AUTHORIZED LOCAL SENSORS -> PRIVATE SIGNALS -> MULTI-SIGNAL FUSION -> UNCERTAIN LIFE-STATE HYPOTHESES -> CORRECTION/CALIBRATION -> LIVING MOHAMED MODEL -> RELEVANCE/SALIENCE -> PREPARE / SURFACE / SILENCE`

Manual logging is a fallback for unresolved high-value uncertainty, not the default interface.

The mature system should ask:

> **What sensor, indirect inference, context source, or learned pattern would make this manual question unnecessary next time?**

## 2. Source-neutral sensor vocabulary

The executable source foundation currently recognizes adapter-neutral signal families:

- `LOCATION`
- `DEVICE_ACTIVITY`
- `HEALTH`
- `MOTION`
- `CALENDAR`
- `AUDIO_METADATA`
- `VISION_METADATA`
- `PROXIMITY`
- `WEARABLE`
- `EMG`
- `EEG`
- `ENVIRONMENT`
- `FOUNDER_CORRECTION`

This is a software ontology, not a claim that all of these sources are currently connected, available, medically validated, or authorized on a real founder device.

Adapters should expose minimal tags and provenance rather than force the core inference layer to depend on Apple, Meta, Google, a particular wearable, a particular BCI, or any 2026 vendor.

## 3. Weak-signal fusion

A single signal should rarely become a life fact.

For example, a gym location alone does not prove a workout. A stronger private hypothesis may emerge from several independent signals such as:

`gym context + workout-session metadata + exercise motion pattern + elevated physiology`

Likewise, study may be inferred from a combination of document activity, active-recall use, low app switching, stylus activity, calendar/context, and other locally available evidence.

The executable `fuseLifeState()` primitive therefore aggregates corroborating signal kinds and returns **candidate states** with an explicitly heuristic confidence value.

Its confidence is not called a calibrated probability until longitudinal corrections and observed outcomes justify calibration.

## 4. Timeline reconstruction

`reconstructLifeTimeline()` groups authorized private signals into bounded time buckets and produces candidate activity states for each bucket.

The result is a reconstructable hypothesis over the day, not an exact diary. Ambiguity remains visible. Overlapping life states are possible, and future versions may use richer temporal models rather than fixed buckets.

## 5. Correction should reduce future work

When the founder corrects an inference, `buildSensoriumCorrection()` converts that event into a private calibration/personalization example.

The standing learning rule is:

> **Every meaningful correction should reduce future manual logging without turning one correction into a permanent trait.**

A correction is evidence about a specific inference under a specific context. It is not permission to create a permanent identity claim.

## 6. Observability without vanity percentages

`measureSensoriumCoverage()` measures which desired source kinds are represented by the supplied signals. It deliberately refuses to call that value "percent of life observed" or inference accuracy.

Having ten sensor classes connected does not imply UberBond understands a life. Source coverage, temporal coverage, inference quality, calibration, blind spots, privacy choices and meaningful relevance are separate quantities.

Blind spots should generate a Sensorium question:

> **Which missing sensor or indirect inference would reduce the most high-value manual input?**

If all known source kinds are present, the harder question becomes:

> **Which unobserved life dimension exists despite apparently complete source coverage?**

That routes the Sensorium back into the Sovereign Expansion Kernel and Ontogenesis.

## 7. Privacy and sovereignty

The executable Sensorium requires the same founder authorization object used by the existing private Personal Civilization core before it performs private life-state inference.

Its outputs declare:

- `privacyClass: PRIVATE_LIFE_DATA`
- `repositoryPersistenceAllowed: false`
- `businessEffectAuthority: NONE`
- `externalEffectAuthority: NONE`

Real life signals, inferred timelines, physiological data, private conversations, locations and corrections do not belong in this public repository.

The repository may contain synthetic fixtures and generic source code only.

The existing rights to `DO_NOT_MODEL`, `DO_NOT_INFER_FROM`, `DO_NOT_PREDICT_FROM`, `DO_NOT_PERSIST`, right not to know, delete/export, and right of exit continue to apply. More sensing capability never creates permission to sense.

## 8. Current executable foundation

- module: `src/life-sensorium.mjs`
- runnable synthetic doctor: `scripts/life-sensorium-doctor.mjs`
- focused tests: `tests/life-sensorium.test.mjs`
- doctor test: `tests/life-sensorium-doctor.test.mjs`

The synthetic doctor deliberately uses invented signals. It proves source composition only. It does not prove that any real device is connected or that any real-world inference is accurate.

## 9. Physical roadmap boundary

The source ontology is intentionally ready for increasingly ambient inputs, including future wearables and non-invasive neural interfaces, without claiming those integrations exist now.

The long-horizon target is not compulsory surveillance. It is **chosen observability with near-zero founder clerical burden**.

A mature UberBond should increasingly know relevant context because its authorized senses improved, while still being able to leave parts of life unmodeled, mysterious, directly experienced, or silent by founder choice.
