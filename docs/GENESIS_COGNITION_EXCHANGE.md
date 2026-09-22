# GENESIS Cognition Exchange

Status: **source contract / zero-spend default**

GENESIS now has a provider-neutral cognition contract between generated candidates and model suppliers.

The exchange is intentionally supplier-agnostic: deterministic workers, local models, cheap cloud models and frontier models may all compete for a typed job, but only when their callability has evidence and the exact job's class/capability/cost envelope admits them.

Default generated jobs have `maxCostMicrousd: 0` and allow only `LOCAL` or `DETERMINISTIC` suppliers. A cloud/frontier model is therefore incapable of silently creating spend merely because a credential later appears.

Every accepted response must name supplier, provider, model, usage, cost and latency and return a structured thesis, counterexamples, refined falsifier, minimum experiment, internal-only implementation sketch, confidence and unresolved questions.

Model output remains research evidence. It cannot promote itself, implement code, contact customers, spend beyond a job cap, or create external-effect authority.
