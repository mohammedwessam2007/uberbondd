# Activation Checklist

Status: practical setup checklist. Live model names, prices, and provider controls must be refreshed at activation time.

## Goal

Activate the smallest viable real-world stack that can begin generating quality/cost evidence immediately.

## Required founder resources

1. TypingMind on the iPad.
2. One OpenRouter account.
3. One OpenRouter API key.
4. A hard monthly cognition budget around $30.
5. Permission to use the relevant models through OpenRouter.

Optional direct-provider credentials remain optional until measured evidence shows they improve exact capability, price, cache economics, Batch/Flex access, latency, or reliability.

## Secret handling

Never commit API keys.

Store secrets only in:

- TypingMind's protected API configuration for interactive use;
- UberBond protected runtime environment for unattended use.

Never paste secrets into:

- Git;
- public logs;
- issue comments;
- source files;
- screenshots intended for sharing.

## Step 1 - Refresh market reality

Before selecting models:

- refresh OpenRouter model catalog;
- refresh current prices;
- refresh context limits;
- refresh tool/reasoning support;
- refresh provider routes;
- refresh current best-model evidence;
- identify the strongest task-specific Crown candidates.

Do not assume the September 2026 roster is still best.

## Step 2 - Configure TypingMind

Create/import model slots for:

- current general Crown;
- current coding/research Crown candidates as needed;
- at least 2 cheap workers from different model families;
- Jev/System-One;
- one optional stronger specialist.

## Step 3 - Install role prompts

Create saved agents/prompts for:

- Crown Baseline;
- Explorer;
- Falsifier;
- Framebreaker;
- Counterfactual;
- Evidence Hunter;
- Minority Preserver;
- Adversarial Synthesizer;
- Crown Finalizer.

The finalizer must preserve the independent Crown baseline and reject majority-vote logic.

## Step 4 - Set budget policy

Hard law:

```
monthly all-in target = $30
quality delta allowed = 0
budget pressure action = queue/defer/batch
```

Track platform fees separately so token-list prices do not understate card spend.

## Step 5 - Start with paired tasks

For each test task:

### Baseline

Run the current Crown directly.

Record:

- model/revision;
- reasoning setting;
- input;
- output/reasoning;
- cache usage;
- latency;
- all-in cost;
- final artifact.

### UberMind

Run:

- Crown independent baseline where required;
- minimum cheap diverse swarm;
- adversarial synthesis;
- Crown final adjudication;
- Jev shadow decisions where available.

Record same metrics.

### Compare

Prefer blinded paired comparison where practical.

Failure:

```
UberMind is worse on a required dimension
```

Success:

```
UberMind equal-or-better and cheaper
```

Superadditive success:

```
UberMind better and cheaper
```

## Step 6 - Jev shadow

Do not immediately let Jev suppress Crown work.

Select bounded recurring decisions and run:

```
current mechanism / Crown
vs
Jev shadow
```

Examples:

- route worker;
- continue/stop;
- evidence relevance;
- contradiction;
- branch viability;
- escalation;
- claim materiality.

## Step 7 - Build first circuit passports

For each promising Jev circuit, record:

- exact state schema;
- exact question;
- allowed outputs;
- applicability domain;
- Crown reference;
- paired outcomes;
- drift signal;
- failure policy.

## Step 8 - Activate Cognitive Multicast

Before each Crown call:

- normalize unresolved propositions;
- search existing decision artifacts;
- identify duplicate semantic dependencies;
- coalesce compatible requests;
- create one adjudication packet.

Publish the Crown decision as a reusable artifact with exact scope.

## Step 9 - Build Crown Thought Capital records

Every Crown call should answer:

- what did this cost?
- what new semantic decision was discovered?
- who can reuse it?
- can it become a Jev circuit?
- can any exact part become code?
- how many future Crown calls does it avoid?

## Step 10 - Night shift

Only after the interactive path produces trustworthy receipts:

- enable unattended queue;
- run cheap preparation continuously;
- use Jev for semantic interrupt control;
- batch/coalesce nonurgent Crown questions;
- preserve results for founder review.

## First-month kill conditions

Do not blindly continue the architecture if evidence shows:

- paired quality regressions;
- swarm routinely harms Crown output;
- Jev routing misses important escalations;
- actual spend accounting is unreliable;
- model identity is uncertain;
- cache reuse is unsafe;
- the $30 hard cap causes unacceptable queue growth.

Repair the mechanism or raise budget.

Never lower required quality.

## Owner actions that cannot be automated away

- create accounts;
- accept provider terms;
- create/store API key;
- set spend limits;
- approve new financial commitment;
- approve consequential permissions.

Everything else should be automated or prepared by UberBond where lawful and technically possible.

## Definition of first successful activation

The subsystem is genuinely live only when:

- OpenRouter key is working;
- TypingMind can call selected models;
- current Crown is identified from current evidence;
- at least one paired Crown-vs-UberMind task is completed;
- actual billing/token receipt exists;
- no quality regression is observed on that task;
- at least one Jev shadow decision is recorded;
- the $30 budget controller is operating.

Architecture alone is not activation.


## V5 zero-spend readiness commands

Before any paired burn-in, run:

```bash
npm run frontier-vm:doctor
```

Default mode is **interactive TypingMind**. It does not require the UberBond backend executor to be enabled.

For the unattended 24/7 worker path:

```bash
node scripts/frontier-vm-v5-doctor.mjs --unattended
```

The V5 doctor requires:

```
OPENROUTER_API_KEY
UBERMIND_LIVE_CROWN_SNAPSHOT_REF
UBERMIND_FRESH_TASK_SOURCE_REF
UBERMIND_MONTHLY_COGNITION_BUDGET_USD=30
UBERMIND_PROTECTED_CROWN_ESCROW_USD>=15
```

Unattended mode additionally requires:

```
OPENROUTER_AGENT_ENABLED=true
```

The doctor performs **zero provider inference and zero spend**. Green means only that controlled burn-in prerequisites are present. It does not establish frontier equivalence, compression, novelty, or production authority.
