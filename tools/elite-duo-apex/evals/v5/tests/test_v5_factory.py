"""Self-tests for the v5 benchmark operations factory.

These tests use synthetic miniature fixtures only. They execute no UberBond
task, start no benchmark run, make no network call, and invoke no model. Each
test class corresponds to one property the factory contract requires proving.

Run with:
    python3 -m unittest discover -s tests -t tests
from tools/elite-duo-apex/evals/v5/.
"""

import glob
import json
import os
import subprocess
import sys
import tempfile
import unittest

TESTS_DIR = os.path.dirname(os.path.abspath(__file__))
V5 = os.path.dirname(TESTS_DIR)
SCRIPTS = os.path.join(V5, "scripts")
# v5 -> evals -> elite-duo-apex -> tools -> repository root
REPO_ROOT = os.path.abspath(os.path.join(V5, "..", "..", "..", ".."))
sys.path.insert(0, SCRIPTS)

import _minischema as ms                 # noqa: E402
import build_executor_packet as bep      # noqa: E402
import build_judge_packet as bjp         # noqa: E402
import check_cleanup                     # noqa: E402
import check_contamination               # noqa: E402
import create_run                        # noqa: E402
import decide_promotion                  # noqa: E402
import score_run                         # noqa: E402


def load(path):
    with open(path, encoding="utf-8") as fh:
        return json.load(fh)


def manifest_paths():
    return sorted(glob.glob(os.path.join(V5, "manifests", "*.json")))


def synthetic_judge_result(anon, **scores):
    """A miniature judge result with the five mandatory dimensions filled in."""
    base = {
        "1_prohibited_external_action": False,
        "2_protected_path_violation": False,
        "3_critical_defect": 0,
        "4_acceptance_test_failure": False,
        "5_material_defect": 0,
        "6_owner_burden": None,
        "7_repair_count": None,
        "8_elapsed_time": None,
        "9_fresh_token_usage": None,
        "10_measured_total_cost": None,
    }
    base.update(scores)
    return {
        "anon_run_id": anon,
        "task_id": "SYN-TEST-00",
        "judge_id": "blind-judge-a",
        "lexicographic_scores": base,
        "verdict_inputs": {"acceptance_result": "PASS",
                           "contamination_detected": False},
    }


def all_gates(value=True, **overrides):
    gates = {name: value for name in decide_promotion.GATES}
    gates.update(overrides)
    return gates


class TestManifestsValidate(unittest.TestCase):
    """Property 1: manifests validate."""

    def test_twelve_manifests_validate_against_schema(self):
        schema = ms.load_schema(os.path.join(V5, "schemas",
                                             "TASK_MANIFEST.schema.json"))
        paths = manifest_paths()
        self.assertEqual(len(paths), 12)
        for path in paths:
            with self.subTest(manifest=os.path.basename(path)):
                self.assertEqual(ms.validate(schema, load(path)), [])

    def test_registry_counts_match_manifests(self):
        registry = load(os.path.join(V5, "BENCHMARK_REGISTRY.json"))
        self.assertEqual(registry["task_counts"],
                         {"calibration": 6, "held_out": 4,
                          "adversarial": 2, "total": 12})
        classes = [load(p)["task_class"] for p in manifest_paths()]
        self.assertEqual(classes.count("CALIBRATION"), 6)
        self.assertEqual(classes.count("HELD_OUT"), 4)
        self.assertEqual(classes.count("ADVERSARIAL"), 2)

    def test_schema_validator_rejects_a_malformed_manifest(self):
        """A validator that passes everything proves nothing."""
        schema = ms.load_schema(os.path.join(V5, "schemas",
                                             "TASK_MANIFEST.schema.json"))
        broken = load(manifest_paths()[0])
        broken["task_id"] = "NOT-A-VALID-ID"
        self.assertNotEqual(ms.validate(schema, broken), [])

    def test_validator_refuses_unsupported_keywords(self):
        with self.assertRaises(ValueError):
            ms.assert_schema_keywords_supported({"oneOf": [{"type": "string"}]})


class TestDeterministicHashes(unittest.TestCase):
    """Property 2: hashes are deterministic."""

    def test_canonical_form_is_key_order_independent(self):
        self.assertEqual(bep.canonical({"a": 1, "b": 2}),
                         bep.canonical({"b": 2, "a": 1}))

    def test_packet_hash_is_stable_across_rebuilds(self):
        for path in manifest_paths():
            manifest = load(path)
            first = bep.build_packet(manifest)["packet_hash"]
            second = bep.build_packet(manifest)["packet_hash"]
            self.assertEqual(first, second)

    def test_packet_hash_changes_when_the_task_changes(self):
        manifest = load(manifest_paths()[0])
        before = bep.build_packet(manifest)["packet_hash"]
        manifest["exact_objective"] = (manifest.get("exact_objective", "") + " x")
        self.assertNotEqual(bep.build_packet(manifest)["packet_hash"], before)

    def test_committed_packets_match_their_manifests(self):
        for path in manifest_paths():
            manifest = load(path)
            sub = {"CALIBRATION": "calibration", "HELD_OUT": "heldout",
                   "ADVERSARIAL": "adversarial"}[manifest["task_class"]]
            on_disk = load(os.path.join(V5, "public", sub,
                                        manifest["task_id"] + ".packet.json"))
            self.assertEqual(on_disk, bep.build_packet(manifest))


class TestPacketsExcludeHiddenMaterial(unittest.TestCase):
    """Property 3: public packets exclude hidden material."""

    def test_no_committed_packet_carries_an_excluded_key(self):
        for path in sorted(glob.glob(os.path.join(V5, "public", "*", "*.json"))):
            packet = load(path)
            for key in bep.EXCLUDED_KEYS:
                self.assertNotIn(key, packet, path)

    def test_sealed_placeholder_marker_never_reaches_a_packet(self):
        for path in sorted(glob.glob(os.path.join(V5, "public", "*", "*.json"))):
            blob = bep.canonical(load(path)).decode("utf-8")
            self.assertNotIn("vault://", blob, path)
            self.assertNotIn("SEALED_PLACEHOLDER", blob, path)

    def test_leaked_hidden_key_is_caught(self):
        packet = bep.build_packet(load(manifest_paths()[0]))
        packet["hidden_evaluator_reference"] = {"mode": "SEALED_PLACEHOLDER"}
        with self.assertRaises(AssertionError):
            bep.assert_packet_clean(packet)

    def test_reproduced_hidden_text_is_caught(self):
        """Synthetic manifest whose packet echoes a hidden check verbatim."""
        manifest = load(manifest_paths()[0])
        secret = "the evaluator compares against fixture beta-seven"
        manifest["hidden_evaluator_checks"] = [secret]
        manifest["exact_objective"] = "Do the thing; %s" % secret
        with self.assertRaises(AssertionError):
            bep.build_packet(manifest)


class TestHiddenPacketsNotIndexed(unittest.TestCase):
    """Property 4: hidden packets are not automatically indexed."""

    DISCOVERY_SURFACES = (
        "CLAUDE.md",
        ".claude/settings.json",
        ".claude/rules",
        ".claude/skills",
        ".claude/agents",
    )

    def test_no_startup_surface_advertises_the_sealed_directories(self):
        for rel in self.DISCOVERY_SURFACES:
            path = os.path.join(REPO_ROOT, rel)
            if not os.path.exists(path):
                continue
            proc = subprocess.run(
                ["grep", "-rIl", "-e", "evals/v5/heldout",
                 "-e", "evals/v5/adversarial", path],
                capture_output=True, text=True)
            self.assertEqual(proc.stdout.strip(), "",
                             "%s advertises a sealed directory" % rel)

    def test_sealed_contracts_declare_absence_of_hidden_material(self):
        paths = (sorted(glob.glob(os.path.join(V5, "heldout", "*.sealed.json")))
                 + sorted(glob.glob(os.path.join(V5, "adversarial", "*.sealed.json"))))
        self.assertEqual(len(paths), 6)
        for path in paths:
            contract = load(path)
            self.assertIs(contract["hidden_material_present_in_repository"], False)
            self.assertEqual(contract["seal_status"], "SEALED_PLACEHOLDER")
            self.assertEqual(contract["scoring_blocked_reason"],
                             "AWAITING_VAULT_MATERIAL")
            for forbidden in check_contamination.FORBIDDEN_SEALED_KEYS:
                self.assertNotIn(forbidden, contract, path)

    def test_vault_pointers_do_not_resolve_inside_the_repository(self):
        for path in manifest_paths():
            manifest = load(path)
            ref = manifest["hidden_evaluator_reference"]
            if ref["mode"] != "SEALED_PLACEHOLDER":
                continue
            self.assertTrue(ref["vault_pointer"].startswith("vault://"))
            local = ref["vault_pointer"].replace("vault://", "")
            self.assertFalse(os.path.exists(os.path.join(V5, local)))
            self.assertFalse(os.path.exists(os.path.join(REPO_ROOT, local)))


class TestAnonymousLabels(unittest.TestCase):
    """Property 5: anonymous labels hide configuration names from judges."""

    def test_judge_packet_strips_every_identifying_field(self):
        manifest = load(manifest_paths()[0])
        run = create_run.build_run(manifest["task_id"], "cfg-hash-abc",
                                   "0" * 40, anon_run_id="run-synth")
        run["acceptance_result"] = "PASS"
        packet = bjp.build_judge_packet(run, manifest, ["artifact://synthetic"])
        blob = json.dumps(packet)
        self.assertNotIn("cfg-hash-abc", blob)
        for key in bjp.IDENTIFYING_KEYS:
            self.assertNotIn('"%s"' % key, blob)
        self.assertEqual(packet["anon_run_id"], "run-synth")

    def test_identifying_field_smuggled_in_an_artifact_is_caught(self):
        with self.assertRaises(AssertionError):
            bjp.assert_judge_packet_blind(
                {"anon_run_id": "run-x",
                 "artifacts": [{"config_hash": "cfg-hash-abc"}]})

    def test_run_labels_are_not_derived_from_configuration_order(self):
        import inspect
        # The generator cannot encode configuration identity because it is never
        # given any: it takes no configuration, task, or ordering argument.
        params = set(inspect.signature(create_run.new_anon_run_id).parameters)
        self.assertEqual(params, {"rng"})

        labels = {create_run.new_anon_run_id() for _ in range(200)}
        self.assertGreater(len(labels), 190)
        self.assertTrue(all(label.startswith("run-") for label in labels))

        # Two runs of the same configuration get unrelated labels.
        pair = {create_run.build_run("CAL-UB-01", "same-cfg", "0" * 40)["anon_run_id"]
                for _ in range(2)}
        self.assertEqual(len(pair), 2)

    def test_sealing_commits_to_the_map_and_detects_relabelling(self):
        import hashlib
        entries = {"run-aaa": "cfg-1", "run-bbb": "cfg-2"}
        commitment = hashlib.sha256(bep.canonical(entries)).hexdigest()
        self.assertEqual(commitment, hashlib.sha256(
            bep.canonical({"run-bbb": "cfg-2", "run-aaa": "cfg-1"})).hexdigest())
        swapped = {"run-aaa": "cfg-2", "run-bbb": "cfg-1"}
        self.assertNotEqual(
            commitment,
            hashlib.sha256(bep.canonical(swapped)).hexdigest())


class TestCriticalDefectsDominateCost(unittest.TestCase):
    """Property 6: critical defects dominate cost."""

    def test_a_free_run_with_a_critical_defect_loses_to_an_expensive_clean_run(self):
        cheap_broken = synthetic_judge_result(
            "run-cheap", **{"3_critical_defect": 1, "10_measured_total_cost": 0.01,
                            "9_fresh_token_usage": 10})
        pricey_clean = synthetic_judge_result(
            "run-pricey", **{"3_critical_defect": 0,
                             "10_measured_total_cost": 999.0,
                             "9_fresh_token_usage": 10 ** 7})
        self.assertEqual(score_run.compare(pricey_clean, cheap_broken), -1)
        ordered = score_run.rank([cheap_broken, pricey_clean])
        self.assertEqual(ordered[0]["anon_run_id"], "run-pricey")
        self.assertEqual(
            score_run.deciding_dimension(pricey_clean, cheap_broken),
            "3_critical_defect")

    def test_prohibited_action_outranks_every_other_dimension(self):
        offender = synthetic_judge_result(
            "run-offender", **{"1_prohibited_external_action": True,
                               "10_measured_total_cost": 0.0})
        plain = synthetic_judge_result(
            "run-plain", **{"5_material_defect": 9,
                            "10_measured_total_cost": 500.0})
        self.assertEqual(score_run.compare(plain, offender), -1)
        self.assertEqual(score_run.deciding_dimension(plain, offender),
                         "1_prohibited_external_action")

    def test_cost_decides_only_when_everything_above_it_ties(self):
        cheap = synthetic_judge_result("run-a", **{"10_measured_total_cost": 1.0})
        dear = synthetic_judge_result("run-b", **{"10_measured_total_cost": 2.0})
        self.assertEqual(score_run.compare(cheap, dear), -1)
        self.assertEqual(score_run.deciding_dimension(cheap, dear),
                         "10_measured_total_cost")

    def test_hierarchy_order_matches_the_contract(self):
        self.assertEqual(score_run.DIMENSION_NAMES, (
            "1_prohibited_external_action", "2_protected_path_violation",
            "3_critical_defect", "4_acceptance_test_failure",
            "5_material_defect", "6_owner_burden", "7_repair_count",
            "8_elapsed_time", "9_fresh_token_usage", "10_measured_total_cost"))


class TestContaminationInvalidatesRun(unittest.TestCase):
    """Property 7: contamination invalidates a run."""

    def test_contaminated_beats_every_merit_verdict(self):
        decision, _ = decide_promotion.decide(all_gates(True, contamination_free=False))
        self.assertEqual(decision, "CONTAMINATED")

    def test_contamination_is_decided_before_undetermined_gates(self):
        gates = all_gates(True, contamination_free=False, efficiency_benefit=None)
        self.assertEqual(decide_promotion.decide(gates)[0], "CONTAMINATED")

    def test_unquarantined_confident_identity_inference_is_a_finding(self):
        result = synthetic_judge_result("run-leaky")
        result["identity_inference"] = {"inferred": True, "confidence": 0.9,
                                        "quarantined": False}
        with tempfile.TemporaryDirectory() as tmp:
            path = os.path.join(tmp, "run-leaky.result.json")
            with open(path, "w", encoding="utf-8") as fh:
                json.dump(result, fh)
            findings = check_contamination.findings_judging([path])
        self.assertEqual(len(findings), 1)
        self.assertIn("0.90", findings[0])

    def test_low_confidence_inference_is_allowed_to_score(self):
        result = synthetic_judge_result("run-ok")
        result["identity_inference"] = {"inferred": True, "confidence": 0.3,
                                        "quarantined": False}
        with tempfile.TemporaryDirectory() as tmp:
            path = os.path.join(tmp, "run-ok.result.json")
            with open(path, "w", encoding="utf-8") as fh:
                json.dump(result, fh)
            self.assertEqual(check_contamination.findings_judging([path]), [])

    def test_committed_factory_is_contamination_clean(self):
        self.assertEqual(check_contamination.findings_repo(), [])


class TestMissingTelemetryIsInsufficient(unittest.TestCase):
    """Property 8: missing telemetry becomes insufficient evidence."""

    def test_a_null_gate_is_not_a_pass(self):
        decision, rationale = decide_promotion.decide(
            all_gates(True, efficiency_benefit=None))
        self.assertEqual(decision, "INSUFFICIENT_EVIDENCE")
        self.assertIn("efficiency_benefit", rationale)

    def test_null_deciding_dimension_refuses_to_pick_a_winner(self):
        measured = synthetic_judge_result("run-m", **{"9_fresh_token_usage": 100})
        unmeasured = synthetic_judge_result("run-u", **{"9_fresh_token_usage": None})
        with self.assertRaises(score_run.InsufficientEvidence) as ctx:
            score_run.compare(measured, unmeasured)
        self.assertEqual(ctx.exception.dimension, "9_fresh_token_usage")

    def test_a_null_safety_dimension_is_not_scorable(self):
        result = synthetic_judge_result("run-x", **{"3_critical_defect": None})
        with self.assertRaises(score_run.InsufficientEvidence):
            score_run.assert_scorable(result)

    def test_new_run_records_start_null_and_name_their_unknowns(self):
        run = create_run.build_run("CAL-UB-01", "cfg", "0" * 40,
                                   anon_run_id="run-null")
        schema = ms.load_schema(os.path.join(V5, "schemas",
                                             "RUN_RECORD.schema.json"))
        self.assertEqual(ms.validate(schema, run), [])
        for field in create_run.NULLABLE_FIELDS:
            self.assertIsNone(run[field], field)
            self.assertIn(field, run["unknown_fields"])
        self.assertIsNone(run["measured_cost_usd"])


class TestProtectedPathChangesFail(unittest.TestCase):
    """Property 9: protected-path changes fail."""

    PROTECTED = ("lite/", "src/", "server.mjs", "worker.mjs", "migrations/",
                 "package.json")

    def test_every_manifest_declares_protected_paths(self):
        for path in manifest_paths():
            manifest = load(path)
            self.assertTrue(manifest["protected_paths"], path)

    def test_protected_path_violation_outranks_all_quality_and_cost(self):
        violator = synthetic_judge_result(
            "run-violator", **{"2_protected_path_violation": True,
                               "3_critical_defect": 0,
                               "10_measured_total_cost": 0.0})
        compliant = synthetic_judge_result(
            "run-compliant", **{"2_protected_path_violation": False,
                                "5_material_defect": 5,
                                "10_measured_total_cost": 100.0})
        self.assertEqual(score_run.compare(compliant, violator), -1)
        self.assertEqual(score_run.deciding_dimension(compliant, violator),
                         "2_protected_path_violation")

    def test_factory_touches_no_protected_product_path(self):
        for name in self.PROTECTED:
            self.assertFalse(
                os.path.abspath(os.path.join(REPO_ROOT, name)).startswith(V5))
        for root, _dirs, files in os.walk(V5):
            for name in files:
                rel = os.path.relpath(os.path.join(root, name), REPO_ROOT)
                self.assertTrue(rel.startswith("tools/elite-duo-apex/evals/v5"))


class TestCleanupDetection(unittest.TestCase):
    """Properties 10 and 11: residue is detected, and clean runs pass."""

    def _synthetic_repo(self, tmp):
        env = {"GIT_AUTHOR_NAME": "t", "GIT_AUTHOR_EMAIL": "t@example.invalid",
               "GIT_COMMITTER_NAME": "t", "GIT_COMMITTER_EMAIL": "t@example.invalid",
               "PATH": os.environ.get("PATH", ""), "HOME": tmp}
        run = lambda *a: subprocess.run(["git"] + list(a), cwd=tmp, env=env,
                                        capture_output=True, text=True, check=True)
        run("init", "-q", "-b", "main")
        os.makedirs(os.path.join(tmp, "work"), exist_ok=True)
        with open(os.path.join(tmp, "work", "kept.txt"), "w") as fh:
            fh.write("baseline\n")
        run("add", "-A")
        run("commit", "-q", "-m", "base")
        return tmp

    def test_clean_synthetic_tree_reports_no_findings(self):
        with tempfile.TemporaryDirectory() as tmp:
            repo = self._synthetic_repo(tmp)
            self.assertEqual(check_cleanup.check_working_tree_clean(repo), [])
            self.assertEqual(check_cleanup.check_residue(repo, "work"), [])
            code, tree, _ = check_cleanup.git(["rev-parse", "HEAD^{tree}"], cwd=repo)
            self.assertEqual(code, 0)
            self.assertEqual(check_cleanup.check_tree_hash(tree, repo), [])

    def test_untracked_residue_is_detected(self):
        with tempfile.TemporaryDirectory() as tmp:
            repo = self._synthetic_repo(tmp)
            with open(os.path.join(repo, "work", "left_behind.tmp"), "w") as fh:
                fh.write("residue\n")
            findings = check_cleanup.check_residue(repo, "work")
            self.assertEqual(len(findings), 1)
            self.assertIn("left_behind.tmp", findings[0])

    def test_modified_tracked_file_is_detected(self):
        with tempfile.TemporaryDirectory() as tmp:
            repo = self._synthetic_repo(tmp)
            with open(os.path.join(repo, "work", "kept.txt"), "w") as fh:
                fh.write("mutated\n")
            findings = check_cleanup.check_working_tree_clean(repo)
            self.assertEqual(len(findings), 1)
            self.assertIn("kept.txt", findings[0])

    def test_surviving_worktree_is_detected(self):
        with tempfile.TemporaryDirectory() as tmp:
            repo = self._synthetic_repo(tmp)
            survivor = os.path.join(repo, "work")
            self.assertTrue(check_cleanup.check_worktree_destroyed(survivor, repo))
            self.assertEqual(
                check_cleanup.check_worktree_destroyed(
                    os.path.join(repo, "gone"), repo), [])

    def test_wrong_tree_hash_is_detected(self):
        with tempfile.TemporaryDirectory() as tmp:
            repo = self._synthetic_repo(tmp)
            self.assertTrue(check_cleanup.check_tree_hash("0" * 40, repo))


class TestNoRealBenchmarkExecuted(unittest.TestCase):
    """Property 12: no real benchmark executes."""

    def test_no_run_records_exist(self):
        self.assertEqual(
            glob.glob(os.path.join(V5, "telemetry", "runs", "*.json")), [])

    def test_no_judge_results_or_promotion_decisions_exist(self):
        self.assertEqual(glob.glob(os.path.join(V5, "reports", "*.json")), [])

    def test_no_identity_map_has_been_created(self):
        self.assertFalse(os.path.exists(
            os.path.join(V5, "anonymization", "identity_map.json")))
        self.assertFalse(os.path.exists(
            os.path.join(V5, "anonymization", "SEALED_IDENTITY_MAP.json")))

    def test_held_out_tasks_are_not_scorable_yet(self):
        registry = load(os.path.join(V5, "BENCHMARK_REGISTRY.json"))
        for entry in registry["tasks"]:
            if entry["task_class"] == "CALIBRATION":
                continue
            self.assertFalse(entry["scorable_now"], entry["task_id"])
            self.assertEqual(entry["blocked_reason"], "AWAITING_VAULT_MATERIAL")

    def test_create_run_refuses_an_unscorable_task_by_default(self):
        code = create_run.main(["--task", "HLD-UB-01", "--config-hash", "cfg",
                                "--starting-commit", "0" * 40])
        self.assertEqual(code, 2)
        self.assertEqual(
            glob.glob(os.path.join(V5, "telemetry", "runs", "*.json")), [])


class TestNoFableCall(unittest.TestCase):
    """Property 13: no Fable call occurs."""

    NETWORK_MODULES = ("urllib", "requests", "httpx", "http.client", "socket",
                       "anthropic", "openai")

    def test_no_factory_script_imports_a_network_client(self):
        for path in sorted(glob.glob(os.path.join(SCRIPTS, "*.py"))):
            with open(path, encoding="utf-8") as fh:
                source = fh.read()
            for module in self.NETWORK_MODULES:
                self.assertNotIn("import %s" % module, source, path)
                self.assertNotIn("from %s" % module, source, path)

    def test_no_packet_builder_implementation_exists(self):
        """The Fable packet builder is specification-only, on purpose."""
        self.assertTrue(os.path.exists(
            os.path.join(V5, "FABLE_PACKET_BUILDER_SPEC.md")))
        for path in glob.glob(os.path.join(SCRIPTS, "*.py")):
            self.assertNotIn("fable", os.path.basename(path).lower())

    def test_no_fable_packet_artifacts_were_produced(self):
        for pattern in ("00_PACKET_MANIFEST.json", "09_REQUESTED_VERDICT.md",
                        "05_BASELINE_RESULTS.csv", "06_CANDIDATE_RESULTS.csv"):
            self.assertEqual(
                glob.glob(os.path.join(V5, "**", pattern), recursive=True), [])

    def test_spec_records_non_invocation(self):
        with open(os.path.join(V5, "FABLE_PACKET_BUILDER_SPEC.md"),
                  encoding="utf-8") as fh:
            text = " ".join(fh.read().split())  # unwrap hard-wrapped prose
        self.assertIn("Fable was not invoked", text)
        self.assertIn("no credit was consumed", text)


class TestFactoryValidatorItself(unittest.TestCase):
    """The validator an owner runs must actually pass on the committed tree."""

    def test_validate_factory_reports_no_problems(self):
        import validate_factory
        self.assertEqual(validate_factory.run_checks(), [])

    def test_promotion_vocabulary_is_exactly_four(self):
        self.assertEqual(decide_promotion.DECISIONS,
                         ("PROMOTE", "REJECT", "INSUFFICIENT_EVIDENCE",
                          "CONTAMINATED"))

    def test_promote_requires_every_gate(self):
        self.assertEqual(decide_promotion.decide(all_gates(True))[0], "PROMOTE")
        for gate in decide_promotion.GATES:
            if gate == "contamination_free":
                continue
            with self.subTest(gate=gate):
                decision, _ = decide_promotion.decide(all_gates(True, **{gate: False}))
                self.assertEqual(decision, "REJECT")

    def test_promote_document_with_a_failed_gate_fails_its_own_schema(self):
        doc = decide_promotion.build_decision(
            "syn-campaign", all_gates(True), ["evidence://synthetic"])
        self.assertEqual(doc["decision"], "PROMOTE")
        doc["gates"]["efficiency_benefit"] = False
        schema = ms.load_schema(os.path.join(V5, "schemas",
                                             "PROMOTION_DECISION.schema.json"))
        self.assertNotEqual(ms.validate(schema, doc), [])

    def test_missing_gate_is_an_error_not_a_default(self):
        gates = all_gates(True)
        del gates["held_out_repeatability"]
        with self.assertRaises(ValueError):
            decide_promotion.decide(gates)


if __name__ == "__main__":
    unittest.main()
