# OMNIA V9 Real Operational Shadow Sample Plan

This is a design document. No messages are sent, no forms are submitted, and no external outreach is executed by this document or this mission. It restates and extends [`V9_REAL_OPERATIONAL_SAMPLE_PLAN.md`](./V9_REAL_OPERATIONAL_SAMPLE_PLAN.md) (Mission 6) for this mission's specific target of 25-50 real, public business action candidates for a future shadow sample.

## Current state

`REAL_OPERATIONAL = 0`, unchanged from every prior mission. `data/db.sample.json` remains an empty schema skeleton; `sample-prospects.csv` remains a single placeholder row explicitly labeled `"Replace with a real target"`. Nothing in this mission changed that, and nothing in this document manufactures data to hide it.

## Target: 25-50 public business action candidates

"Action candidates," not "send candidates" -- this plan produces a dataset for exercising this mission's execution/reconciliation logic against realistic-shaped identifiers (real public business names, real public domains, real publicly-listed general-inquiry addresses), never a list anyone sends anything to.

## The three permitted sources, in order of preference

1. **Existing UberBond research artifacts.** If a prior, already-completed UberBond research or discovery effort (not scraped fresh for this mission) already identified real, public businesses as part of legitimate prior work, that existing artifact is the preferred source -- no new external action is needed to use it. This mission's own repository search (`data/db.sample.json`, `sample-prospects.csv`) found none usable; if one exists outside this repository, only a human can identify and supply it.
2. **Already-researched project organizations.** Organizations already mentioned, referenced, or documented anywhere in this project's own history (commit messages, prior mission docs, existing code comments) as real, public entities -- never inferred, never looked up fresh for this purpose.
3. **Public business websites, read-only.** As a last resort, and only where the source's own published terms explicitly permit this kind of automated read access: recording a business's already-public name, website, and general-inquiry contact address exactly as it displays them, and nothing else.

## What is recorded, and what never is

Recorded, at most, per candidate: a stable non-reversible identifier (hash of business name + domain), the public business name, the public website URL, and the publicly-listed general-inquiry address if the business itself displays one. **Never recorded**: any individual person's name, any phone number not already published as the business's own general line, any inferred demographic, firmographic, or behavioral data, and never any address obtained by guessing a common pattern (`firstname.lastname@domain`) rather than reading it directly off a public page.

## What this dataset is used for, and what it is never used for

Used for: exercising `dispatchExternalEffect()`, the recovery worker, and (once/if a real Gmail adapter test-mode exists) the Gmail adapter's `prepare()`/validation logic against realistic-shaped inputs, entirely within this mission's existing null-sink/fake-transport testing infrastructure -- never against the real Gmail API, never producing a real network call to any of these candidates. **Never used to send anything, to any of these 25-50 candidates, under this mission or any future one, without a separate, explicit, per-candidate owner decision** -- this dataset existing does not itself authorize contacting anyone on it.

## Why this remains a plan, not an action

Both of the two sources requiring any new action (an existing-artifact search this mission could not perform because the artifact does not exist in this repository, and a live directory fetch this mission was not authorized to perform) sit outside this mission's read-only, non-contacting posture. Per the originating mission brief's own instruction, this document stops at the design boundary. If 25-50 real candidates are later needed, the smallest lawful next step is a human either supplying an existing research artifact or explicitly authorizing a scoped, terms-compliant public-directory read -- not this mission proceeding unilaterally.
