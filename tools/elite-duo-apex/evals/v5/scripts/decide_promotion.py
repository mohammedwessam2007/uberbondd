#!/usr/bin/env python3
"""Compute a promotion decision from gate results.

The decision vocabulary is closed. Exactly four outcomes exist:

  CONTAMINATED          evidence integrity failed; the comparison is void
  INSUFFICIENT_EVIDENCE at least one gate could not be determined
  PROMOTE               every gate is satisfied
  REJECT                every gate was determined and at least one failed

They are evaluated in that order, and the order is the point: a contaminated
campaign is never "rejected on the merits" (that would imply the numbers meant
something), and an undetermined gate is never silently read as a pass.

There is no fifth outcome, no "PROMOTE with caveats", and no override flag. A
campaign that wants a different answer must produce different evidence.
"""

import argparse
import json
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
V5 = os.path.dirname(HERE)
sys.path.insert(0, HERE)

import _minischema as ms  # noqa: E402

DECISIONS = ("PROMOTE", "REJECT", "INSUFFICIENT_EVIDENCE", "CONTAMINATED")

GATES = (
    "no_critical_quality_regression",
    "no_increase_in_material_defects",
    "no_increase_in_owner_intervention",
    "acceptance_success_equal_or_greater",
    "efficiency_benefit",
    "held_out_repeatability",
    "static_context_budget_compliance",
    "maintenance_budget_compliance",
    "contamination_free",
)

SCHEMA = os.path.join(V5, "schemas", "PROMOTION_DECISION.schema.json")


def decide(gates):
    """Return (decision, rationale). `gates` maps gate name -> True/False/None."""
    unknown = [g for g in GATES if g not in gates]
    if unknown:
        raise ValueError("missing gate(s): %s" % ", ".join(unknown))

    if gates["contamination_free"] is False:
        return "CONTAMINATED", (
            "contamination_free is false; the comparison is void and no "
            "merit-based verdict may be issued from it")

    undetermined = [g for g in GATES if gates[g] is None]
    if undetermined:
        return "INSUFFICIENT_EVIDENCE", (
            "undetermined gate(s): %s. An undetermined gate is not a pass."
            % ", ".join(undetermined))

    failed = [g for g in GATES if gates[g] is False]
    if failed:
        return "REJECT", "failed gate(s): %s" % ", ".join(failed)

    return "PROMOTE", "all nine gates satisfied on determined evidence"


def build_decision(campaign_id, gates, evidence_refs, quarantined=None,
                   excluded=None):
    decision, rationale = decide(gates)
    doc = {
        "decision": decision,
        "campaign_id": campaign_id,
        "gates": {g: gates[g] for g in GATES},
        "evidence_refs": list(evidence_refs),
        "rationale": rationale,
    }
    if quarantined:
        doc["quarantined_tasks"] = list(quarantined)
    if excluded:
        doc["excluded_runs"] = list(excluded)
    errors = ms.validate(ms.load_schema(SCHEMA), doc)
    if errors:
        raise AssertionError("promotion decision failed its own schema: %s"
                             % "; ".join(errors))
    return doc


def main(argv=None):
    ap = argparse.ArgumentParser()
    ap.add_argument("--gates", required=True,
                    help="path to a JSON object mapping gate name -> true/false/null")
    ap.add_argument("--campaign", required=True)
    ap.add_argument("--evidence", action="append", default=[], required=False)
    ap.add_argument("--out")
    args = ap.parse_args(argv)

    with open(args.gates, encoding="utf-8") as fh:
        gates = json.load(fh)
    evidence = args.evidence or ["(no evidence reference supplied)"]
    doc = build_decision(args.campaign, gates, evidence)

    out = args.out or os.path.join(V5, "reports",
                                   args.campaign + ".promotion.json")
    os.makedirs(os.path.dirname(out), exist_ok=True)
    with open(out, "w", encoding="utf-8") as fh:
        json.dump(doc, fh, indent=2, sort_keys=True)
        fh.write("\n")
    print("%s  %s" % (doc["decision"], doc["rationale"]))
    return 0


if __name__ == "__main__":
    sys.exit(main())
