from __future__ import annotations

import argparse
import json
import sys
import tempfile
import unittest
from pathlib import Path
from urllib.parse import urlparse
from unittest.mock import patch

SCRIPTS = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(SCRIPTS))
sys.path.insert(0, str(SCRIPTS / "content_quality"))

import calibration_cli  # noqa: E402
from fixture_tools import EXPECTED_COUNTS, FIXTURE_PATH, read_jsonl, source_item, validate_fixture  # noqa: E402
from model_review import _parse_events, _validate_packets, run_packets  # noqa: E402
from quality_lib import QUALITY_ROOT, RUBRIC_VERSION, content_hash, packet  # noqa: E402
from review_reports import calibration_report, pilot_gate, pilot_report, recheck_sample, validate_pr_batch  # noqa: E402


class PacketCallTests(unittest.TestCase):
    def test_l1_rejects_key_or_explanation_leak(self) -> None:
        packet = {"itemId": "a", "level": "L1", "question": "Q?", "options": ["A", "B"], "shuffleSeed": "1", "correctAnswer": "A"}
        with self.assertRaisesRegex(ValueError, "contains key or explanation"):
            _validate_packets("L1", [packet], 1)

    def test_requested_budget_is_a_hard_limit(self) -> None:
        packets = [{"itemId": str(i), "level": "L1", "question": "Q?", "options": ["A", "B"], "shuffleSeed": "1"} for i in range(2)]
        with self.assertRaisesRegex(ValueError, "exceeds requested budget"):
            _validate_packets("L1", packets, 1)
        with self.assertRaisesRegex(ValueError, "between 0 and 25"):
            _validate_packets("L1", [], 26)

    def test_cli_events_capture_usage(self) -> None:
        output = '\n'.join([
            '{"type":"item.completed","item":{"type":"agent_message","text":"[{\\"itemId\\":\\"a\\"}]"}}',
            '{"type":"turn.completed","usage":{"input_tokens":20,"output_tokens":3}}',
        ])
        rows, usage = _parse_events(output)
        self.assertEqual(rows, [{"itemId": "a"}])
        self.assertEqual(usage["input_tokens"], 20)

    def test_usage_is_recorded_per_call_and_unavailable_is_explicit(self) -> None:
        packets = [{"itemId": "a", "level": "L1", "question": "Q?", "options": ["A", "B"], "shuffleSeed": "1"}]
        with patch("model_review._run_call", return_value=([{"itemId": "a", "answer": "A"}], {"input_tokens": 100, "output_tokens": 4})):
            rows = run_packets("L1", packets, "gpt-6-luna", 1)
        self.assertEqual(rows[0]["inputTokens"], 100)
        self.assertTrue(rows[0]["usageAvailable"])
        with patch("model_review._run_call", return_value=([{"itemId": "a", "answer": "A"}], None)):
            rows = run_packets("L1", packets, "gpt-6-luna", 1)
        self.assertIsNone(rows[0]["inputTokens"])
        self.assertFalse(rows[0]["usageAvailable"])


class ReviewReportTests(unittest.TestCase):
    def test_calibration_requires_supported_l2_findings_for_combined_gate(self) -> None:
        labels = [
            {"itemId": "bad", "label": "historical-wrong-key", "requiresQuote": True},
            {"itemId": "good", "label": "known-good", "requiresQuote": True},
            {"itemId": "seed", "label": "seeded-wrong-key", "requiresQuote": True},
        ]
        l1 = [{"itemId": "bad", "level": "L1", "answer": "correct", "verdict": "key-mismatch"}]
        l2 = [
            {"itemId": "bad", "level": "L2", "verdict": "key-mismatch", "quote": "quote", "sourceTextHash": "hash", "inputTokens": 100, "outputTokens": 20, "callId": "c1"},
            {"itemId": "good", "level": "L2", "verdict": "source-verified", "quote": "quote", "sourceTextHash": "hash", "inputTokens": 100, "outputTokens": 20, "callId": "c1"},
            {"itemId": "seed", "level": "L2", "verdict": "key-mismatch", "quote": "quote", "sourceTextHash": "hash", "inputTokens": 100, "outputTokens": 20, "callId": "c1"},
        ]
        report = calibration_report(labels, l1, l2, "2", {"L1": "gpt-6-luna", "L2": "gpt-6-sol"})
        self.assertTrue(report["combined"]["go"])
        self.assertEqual(report["levels"]["L2"]["usage"]["inputTokens"], 100)
        l2[0]["quote"] = None
        report = calibration_report(labels, l1, l2, "2", {"L1": "gpt-6-luna", "L2": "gpt-6-sol"})
        self.assertFalse(report["combined"]["go"])

    def test_pilot_report_states_when_usage_is_unavailable(self) -> None:
        report = pilot_report([{"itemId": "a", "level": "L2", "status": "unverified"}], "exam-a")
        self.assertFalse(report["levels"]["L2"]["usage"]["available"])
        self.assertIsNone(report["levels"]["L2"]["usage"]["inputTokens"])
        self.assertEqual(report["levels"]["L2"]["sourceGaps"], 1)


def _fixture_item_row(item_id: str, question: str = "What is a subnet?") -> dict:
    return {
        "itemId": item_id,
        "sourcePath": "x.json",
        "sourceIndex": 0,
        "item": {
            "category": "exams", "navigationKeyword1": "gcp", "navigationKeyword2": "vpc",
            "question": question, "correctAnswer": "A range of IPs", "incorrectAnswers": ["A DNS zone", "A bill", "A disk"],
            "explanation": "A subnet is a range of IP addresses.", "source": "https://docs.example.test/x",
        },
    }


class CalibrationFixtureTests(unittest.TestCase):
    def test_committed_fixture_has_required_counts_labels_and_origin_commits(self) -> None:
        rows = read_jsonl(FIXTURE_PATH)
        summary = validate_fixture(rows)
        self.assertEqual(summary["counts"], dict(sorted(EXPECTED_COUNTS.items())))
        self.assertEqual(summary["total"], 591)
        self.assertTrue(all(row["originCommit"] and row["labelSource"] and row["contentHash"] for row in rows))
        stored = json.loads((QUALITY_ROOT / "calibration-fixture-summary.json").read_text(encoding="utf-8"))
        self.assertEqual(stored, summary)

    def test_fixture_validation_rejects_duplicate_ids_and_wrong_counts(self) -> None:
        base = {"itemId": "a", "label": "known-good", "originCommit": "c", "labelSource": "s", "expectedAnswer": "x", "contentHash": "h", "requiresQuote": True}
        with self.assertRaisesRegex(ValueError, "unique"):
            validate_fixture([base, dict(base)], {"known-good": 2})
        with self.assertRaisesRegex(ValueError, "expected 2 known-good"):
            validate_fixture([base], {"known-good": 2})
        with self.assertRaisesRegex(ValueError, "seededAnswer"):
            validate_fixture([dict(base, label="seeded-wrong-key")], {"seeded-wrong-key": 1})

    def test_reviewer_packets_never_carry_labels_or_expected_answers(self) -> None:
        body = packet(source_item(_fixture_item_row("a")), "L1", "seed")
        leaked = {"label", "expectedAnswer", "correctedAnswer", "seededAnswer", "correctAnswer", "explanation"} & set(body)
        self.assertEqual(leaked, set())

    def test_seeded_label_does_not_accept_baseline_review_row(self) -> None:
        labels = [{"itemId": "s", "label": "seeded-wrong-key", "contentHash": "seeded-hash", "requiresQuote": True}]
        baseline = {"itemId": "s", "level": "L2", "contentHash": "original-hash", "verdict": "key-mismatch", "quote": "q", "sourceTextHash": "h"}
        report = calibration_report(labels, [], [baseline], "1", {"L1": "a", "L2": "b"})
        self.assertEqual(report["combined"]["seededErrorCatchRate"]["caught"], 0)
        self.assertEqual(report["combined"]["notRun"], 1)
        matching = dict(baseline, contentHash="seeded-hash")
        report = calibration_report(labels, [], [baseline, matching], "1", {"L1": "a", "L2": "b"})
        self.assertEqual(report["combined"]["seededErrorCatchRate"]["caught"], 1)


class PilotGateTests(unittest.TestCase):
    def _report(self, **combined: object) -> dict:
        base = {"complete": True, "notRun": 0, "go": True, "historicalWrongKeys": {"rate": 0.95}, "knownGoodFalseFlags": {"rate": 0.1}}
        base.update(combined)
        return {"rubricVersion": "1", "models": {"L1": "a", "L2": "b"}, "combined": base}

    def test_gate_passes_only_with_bar_met_complete_run_and_current_rubric(self) -> None:
        self.assertEqual(pilot_gate(self._report(), "1"), [])
        self.assertTrue(pilot_gate(self._report(), "2"))
        self.assertTrue(pilot_gate(self._report(complete=False, notRun=3), "1"))
        self.assertTrue(pilot_gate(self._report(historicalWrongKeys={"rate": 0.84}), "1"))
        self.assertEqual(pilot_gate(self._report(historicalWrongKeys={"rate": 0.85}), "1"), [])
        self.assertTrue(pilot_gate(self._report(knownGoodFalseFlags={"rate": 0.2}), "1"))

    def test_committed_report_matches_its_own_gate_at_the_current_rubric(self) -> None:
        # AC 7.15.19: the committed report is complete, current, and its go flag agrees with pilot_gate.
        from quality_lib import RUBRIC_VERSION
        report = json.loads((QUALITY_ROOT / "calibration-report.json").read_text(encoding="utf-8"))
        self.assertEqual(report["rubricVersion"], RUBRIC_VERSION)
        self.assertTrue(report["combined"]["complete"])
        self.assertEqual(report["combined"]["go"], pilot_gate(report, RUBRIC_VERSION) == [])


class FalseFlagDefinitionTests(unittest.TestCase):
    """AC 7.15.18: a known-good item is a false flag only for key-mismatch or ambiguous; content-fix is reported apart."""

    def test_content_fix_on_a_known_good_item_is_reported_but_not_counted(self) -> None:
        labels = [{"itemId": f"g{i}", "label": "known-good", "requiresQuote": True} for i in range(3)]
        verdicts = {"g0": "key-mismatch", "g1": "content-fix", "g2": "source-verified"}
        l2 = [{"itemId": i, "level": "L2", "verdict": v, "quote": "q", "sourceTextHash": "h"} for i, v in verdicts.items()]
        report = calibration_report(labels, [], l2, "2", {"L2": "m"})
        flags = report["combined"]["knownGoodFalseFlags"]
        self.assertEqual(flags["count"], 1)
        self.assertEqual(flags["contentFixFlags"], 1)
        self.assertEqual(flags["strictCount"], 2)


class SourceExpansionTests(unittest.TestCase):
    """AC 7.15.23: passages match every option, and extra pages must be eligible https URLs, at most three."""

    def test_eligible_urls_keep_only_tier_one_https_unique_and_cap_three(self) -> None:
        import source_expansion
        tiers = {"T1": ["docs.aws.amazon.com"]}
        with patch.object(source_expansion, "tier_for_url", lambda url, _t: "T1" if urlparse(url).hostname == "docs.aws.amazon.com" else "T5"):
            urls = [
                "http://docs.aws.amazon.com/a", "https://docs.aws.amazon.com/a", "https://docs.aws.amazon.com/a",
                "https://blog.example.com/x", "https://docs.aws.amazon.com/b", "https://docs.aws.amazon.com/c",
                "https://docs.aws.amazon.com/d", 7,
            ]
            self.assertEqual(source_expansion.eligible_urls(urls, "T1", tiers), [
                "https://docs.aws.amazon.com/a", "https://docs.aws.amazon.com/b", "https://docs.aws.amazon.com/c"])

    def test_passage_follows_the_option_text_not_only_the_stored_key(self) -> None:
        from quality_lib import best_passage_scored
        item = source_item({"itemId": "x", "item": {"category": "exams", "correctAnswer": "wrong stored answer", "explanation": "",
                            "question": "Which service caches content near users", "incorrectAnswers": ["CloudFront edge caching"]}})
        filler = " ".join(["lorem"] * 400)
        text = f"{filler} CloudFront edge caching serves content near users {filler}"
        score, passage = best_passage_scored(text, item)
        self.assertGreater(score, 0)
        self.assertIn("CloudFront", passage)


class FixPrShapeTests(unittest.TestCase):
    def _changes(self, count: int, **extra: object) -> list[dict]:
        return [dict({"itemId": str(i), "set": "exams.gcp.ace", "changeClass": "A"}, **extra) for i in range(count)]

    def test_accepts_one_set_one_class_within_cap_and_item_paths(self) -> None:
        paths = ["data/seed-source/items/exams/exams.gcp.ace.json", "data/seed-source/_registry/quality/exams.jsonl"]
        result = validate_pr_batch(self._changes(25), paths)
        self.assertTrue(result["ok"])
        self.assertFalse(result["ownerReviewRequired"])

    def test_rejects_mixed_sets_classes_cap_and_other_paths(self) -> None:
        mixed = self._changes(2)
        mixed[1]["set"] = "exams.azure.az900"
        self.assertFalse(validate_pr_batch(mixed, [])["ok"])
        mixed = self._changes(2)
        mixed[1]["changeClass"] = "B"
        self.assertFalse(validate_pr_batch(mixed, [])["ok"])
        self.assertFalse(validate_pr_batch(self._changes(26), [])["ok"])
        self.assertFalse(validate_pr_batch(self._changes(1), ["src/Quizymode.Api/Program.cs"])["ok"])
        self.assertTrue(validate_pr_batch(self._changes(1, changeClass="B"), [])["ownerReviewRequired"])

    def test_recheck_sample_caps_at_30_and_reports_shortfall(self) -> None:
        ids = [f"id{i}" for i in range(40)]
        self.assertEqual(len(recheck_sample(ids, "s")["selected"]), 30)
        short = recheck_sample(ids[:12], "s")
        self.assertEqual((len(short["selected"]), short["shortfall"]), (12, 18))
        self.assertEqual(recheck_sample(ids, "s"), recheck_sample(ids, "s"))


class ResumeAndBudgetTests(unittest.TestCase):
    def _rows(self, count: int) -> list[dict]:
        return [_fixture_item_row(f"id{i}", f"Question {i}?") for i in range(count)]

    def _ledger(self, count: int) -> list[dict]:
        return [
            {"itemId": f"id{i}", "level": "L1", "rubricVersion": RUBRIC_VERSION, "contentHash": content_hash(source_item(row))}
            for i, row in enumerate(self._rows(count))
        ]

    def _run(self, tmp: Path, budget: int, count: int, ledger_rows: list[dict] | None = None) -> tuple[int, list[int]]:
        items = tmp / "items.jsonl"
        items.write_text("".join(json.dumps(row) + "\n" for row in self._rows(count)), encoding="utf-8")
        ledger = tmp / "calibration.jsonl"
        if ledger_rows:
            ledger.write_text("".join(json.dumps(r) + "\n" for r in ledger_rows), encoding="utf-8")
        sizes: list[int] = []

        def fake_run(level: str, packets: list[dict], model: str, batch_limit: int) -> list[dict]:
            sizes.append(len(packets))
            return [
                {"itemId": p["itemId"], "level": level, "answer": "A range of IPs", "multipleDefensibleAnswers": False,
                 "difficulty": "easy", "modelId": model, "callId": f"c{len(sizes)}", "checkedAt": "2026-01-01T00:00:00+00:00",
                 "inputTokens": 1, "outputTokens": 1, "usageAvailable": True}
                for p in packets
            ]

        args = argparse.Namespace(items=items, level="L1", budget=budget, seed="1", model=None, output=tmp / "out" / "l1.jsonl")
        with patch.object(calibration_cli, "CALIBRATION_LEDGER", ledger), patch.object(calibration_cli, "run_packets", fake_run), patch("builtins.print"):
            code = calibration_cli.cmd_run_fixture(args)
        return code, sizes

    def test_run_never_starts_more_items_than_the_requested_budget(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            code, sizes = self._run(Path(tmp), budget=30, count=60)
        self.assertEqual(code, 0)
        self.assertEqual(sum(sizes), 30)
        self.assertTrue(all(size <= 25 for size in sizes))

    def test_unchanged_rerun_makes_zero_calls_for_current_reviews(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            code, sizes = self._run(Path(tmp), budget=25, count=5, ledger_rows=self._ledger(5))
        self.assertEqual((code, sizes), (0, []))

    def test_changed_item_is_reviewed_again_but_only_that_item(self) -> None:
        ledger = self._ledger(5)
        ledger[2]["contentHash"] = "stale"
        with tempfile.TemporaryDirectory() as tmp:
            _, sizes = self._run(Path(tmp), budget=25, count=5, ledger_rows=ledger)
        self.assertEqual(sizes, [1])


if __name__ == "__main__":
    unittest.main()


class PilotRunTests(unittest.TestCase):
    """AC 7.15.24: the pilot picks the cached page that matches the question and options; uncached pages never win."""

    def _item(self):
        return source_item({"itemId": "p", "item": {"category": "exams", "correctAnswer": "alpha", "explanation": "",
                            "question": "Which feature caches content near users", "incorrectAnswers": ["edge caching network"]}})

    def test_choose_page_prefers_the_page_that_mentions_the_options_and_skips_uncached(self) -> None:
        import pilot_run
        filler = " ".join(["lorem"] * 300)
        pages = {
            "https://a.example/one": {"status": "ok", "text": f"{filler} unrelated topic {filler}"},
            "https://a.example/two": {"status": "ok", "text": f"{filler} edge caching network caches content near users {filler}"},
            "https://a.example/three": {"status": "unfetchable", "text": ""},
        }
        with patch.object(pilot_run, "read_cache", lambda url: pages.get(url)):
            self.assertEqual(pilot_run.choose_page(self._item(), list(pages)), "https://a.example/two")
            self.assertIsNone(pilot_run.choose_page(self._item(), ["https://a.example/three", "https://a.example/missing"]))

    def test_own_cited_page_is_fetched_when_not_cached(self) -> None:
        import pilot_run
        item = self._item()
        fetched: list[list[str]] = []
        with patch.object(pilot_run, "eligible_source_url", lambda i, t, m: "https://a.example/cited"),                 patch.object(pilot_run, "read_cache", lambda url: None),                 patch.object(pilot_run, "fetch_run", lambda urls, base_delay: fetched.append(list(urls))):
            self.assertEqual(pilot_run.fetch_own_sources([item], {}, "T1", 0), ["https://a.example/cited"])
        self.assertEqual(fetched, [["https://a.example/cited"]])
        with patch.object(pilot_run, "eligible_source_url", lambda i, t, m: "https://a.example/cited"),                 patch.object(pilot_run, "read_cache", lambda url: {"status": "ok", "text": "x"}),                 patch.object(pilot_run, "fetch_run", lambda urls, base_delay: fetched.append(list(urls))):
            self.assertEqual(pilot_run.fetch_own_sources([item], {}, "T1", 0), [])
        self.assertEqual(len(fetched), 1)

    def test_ledger_pages_lists_the_pages_earlier_l2_rows_used(self) -> None:
        import pilot_run
        with tempfile.TemporaryDirectory() as tmp:
            ledger = Path(tmp) / "exams.jsonl"
            rows = [
                {"itemId": "a", "level": "L1", "sourceUrl": "https://a.example/l1"},
                {"itemId": "a", "level": "L2", "sourceUrl": "https://a.example/one"},
                {"itemId": "a", "level": "L2", "sourceUrl": "https://a.example/two"},
                {"itemId": "b", "level": "L2", "sourceUrl": None},
            ]
            ledger.write_text("\n".join(json.dumps(r) for r in rows) + "\n", encoding="utf-8")
            with patch.object(pilot_run, "ledger_path", lambda category: ledger):
                self.assertEqual(pilot_run.ledger_pages("exams"), {"a": ["https://a.example/one", "https://a.example/two"]})
            with patch.object(pilot_run, "ledger_path", lambda category: Path(tmp) / "missing.jsonl"):
                self.assertEqual(pilot_run.ledger_pages("exams"), {})
