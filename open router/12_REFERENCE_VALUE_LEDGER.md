# 12 — Reference-Value Ledger

## Purpose

Prove or falsify the claim that approximately USD 30 of UberMind spend can deliver work that would cost hundreds or thousands of dollars if the current strongest frontier were used directly for the same workload.

## Required accounting unit

For every matched task:

~~~
task_id
task_class
current_reference_Crown
reference_run_cost
UberMind_run_cost
reference_quality_result
UberMind_quality_result
paired_required_dimension_result
compression_valid
compression_factor
founder_minutes
~~~

## Valid compression

A task contributes to compression only if:

~~~
UberMind required quality >= matched reference Crown required quality
~~~

If UberMind is cheaper but worse, compression_valid = false.

## Reference Cost Equivalent

For valid matched tasks only:

~~~
monthly_RCE
= sum(reference_run_cost for matched valid workload)

monthly_compression_factor
= monthly_RCE / actual_monthly_UberMind_all_in_cost
~~~

## Quality outcomes

Record at minimum:
- UberMind WIN;
- TIE;
- REGRESSION;
- ABSTAIN / unresolved.

Any required-quality regression is investigated by task class and architecture.

## Sources of realized savings

Attribute savings rather than reporting one mysterious number:
- exact cache;
- prompt/prefix cache;
- artifact-reference avoidance;
- Jev certified reflex;
- deterministic code;
- task-archetype reuse;
- evidence multicast;
- adaptive-N reduction;
- branch killing;
- same-model provider arbitrage;
- Batch/deferred;
- shorter Crown input;
- shorter Crown output;
- avoided second-Crown call;
- deduplicated retrieval/tool call.

## Cognitive capital ledger

For every reusable asset record:
- creation Crown cost;
- maintenance cost;
- number of reuses;
- direct Crown calls avoided;
- realized avoided reference cost;
- current validity;
- last audit;
- decompilation events.

This exposes which thought bonds and Jev circuits actually compound.

## Milestones

Do not say "$30 equals thousands" until the ledger shows it.

Suggested evidence milestones:
- RCE >= $300 with matched quality: 10x demonstrated;
- RCE >= $750: 25x;
- RCE >= $1,500: 50x;
- RCE >= $3,000: 100x;
- RCE >= $7,500: 250x;
- RCE >= $15,000: 500x;
- RCE >= $30,000: 1000x.

The milestone is a measured workload equivalence, not a claim that the output could be sold for that amount.

## Anti-gaming law

Never inflate RCE by:
- forcing the Crown to produce useless verbosity;
- choosing an unnecessarily expensive reference route;
- counting repeated identical work that the baseline would also cache;
- comparing different task quality;
- ignoring OpenRouter/provider fees;
- excluding failed UberMind attempts from actual spend;
- cherry-picking only wins.

The ledger exists to make the compression claim harder to fake.
