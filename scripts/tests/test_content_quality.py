from __future__ import annotations

import json
import sys
import tempfile
import unittest
from pathlib import Path

SCRIPTS = Path(__file__).resolve().parents[1]
ROOT = SCRIPTS.parent
sys.path.insert(0, str(SCRIPTS))
sys.path.insert(0, str(SCRIPTS / "content_quality"))

from quality_lib import (  # noqa: E402
    RUBRIC_VERSION,
    append_rows,
    best_passage,
    compact,
    content_hash,
    ingest,
    legacy_rows,
    packet,
    queue,
    read_rows,
)
from seed_source_common import SourceItem  # noqa: E402

FIXTURE_CACHE = SCRIPTS / "tests" / "fixtures" / "content_quality" / "cache"
FIXTURE_URL = "https://docs.example.test/vpc-basics"
ITEM_ID = "00000000-0000-0000-0000-000000000101"


def make_item(**overrides: object) -> SourceItem:
    base = dict(
        item_id=ITEM_ID,
        category="exams",
        navigation_keyword1="aws",
        navigation_keyword2="vpc",
        question="What does a subnet represent in a VPC?",
        correct_answer="A range of IP addresses in the VPC",
        incorrect_answers=["A billing account", "A DNS zone", "A load balancer"],
        explanation="A subnet is a range of IP addresses in your VPC.",
        keywords=["networking"],
        source=FIXTURE_URL,
        path=Path("x.json"),
        index=0,
    )
    base.update(overrides)
    return SourceItem(**base)  # type: ignore[arg-type]


class ContentHashTests(unittest.TestCase):
    def test_stable_across_order_and_whitespace(self) -> None:
        a = make_item(incorrect_answers=["A billing account", "A DNS zone", "A load balancer"])
        b = make_item(question="What  does a subnet represent in a VPC?", incorrect_answers=["A load balancer", "A DNS zone", "A billing account"])
        self.assertEqual(content_hash(a), content_hash(b))

    def test_changes_with_question_answer_explanation_or_source(self) -> None:
        base = content_hash(make_item())
        self.assertNotEqual(base, content_hash(make_item(question="Another question?")))
        self.assertNotEqual(base, content_hash(make_item(correct_answer="Something else")))
        self.assertNotEqual(base, content_hash(make_item(explanation="Different explanation text.")))
        self.assertNotEqual(base, content_hash(make_item(source="https://other.example.test/")))

    def test_ignores_keywords(self) -> None:
        self.assertEqual(content_hash(make_item(keywords=["a"])), content_hash(make_item(keywords=["b"])))


class QueueTests(unittest.TestCase):
    def test_current_row_is_skipped_and_changed_content_requeues(self) -> None:
        item = make_item()
        row = {"itemId": ITEM_ID, "contentHash": content_hash(item), "rubricVersion": RUBRIC_VERSION, "level": "L1"}
        self.assertEqual(queue([item], [row], "L1", 10), [])

        changed = make_item(explanation="Changed explanation text here.")
        self.assertEqual(len(queue([changed], [row], "L1", 10)), 1)

    def test_other_level_still_queued(self) -> None:
        item = make_item()
        row = {"itemId": ITEM_ID, "contentHash": content_hash(item), "rubricVersion": RUBRIC_VERSION, "level": "L1"}
        self.assertEqual(len(queue([item], [row], "L2", 10)), 1)


class PacketTests(unittest.TestCase):
    def test_l1_has_no_key_marker_or_explanation_and_records_seed(self) -> None:
        body = packet(make_item(), "L1", "seed-1", cache_root=FIXTURE_CACHE)
        self.assertNotIn("explanation", body)
        self.assertNotIn("correctAnswer", body)
        self.assertEqual(body["shuffleSeed"], "seed-1")
        self.assertEqual(sorted(body["options"]), sorted(make_item().incorrect_answers + [make_item().correct_answer]))

    def test_l2_passage_is_at_most_800_tokens_not_full_page(self) -> None:
        long_text = " ".join(f"word{i}" for i in range(5000))
        passage = best_passage(long_text, make_item())
        self.assertLessEqual(len(passage.split()) * 1.33, 800)
        self.assertLess(len(passage.split()), 5000)

    def test_l2_packet_carries_passage_from_cache(self) -> None:
        body = packet(make_item(), "L2", "seed-1", cache_root=FIXTURE_CACHE)
        self.assertIn("passage", body)
        self.assertIn("subnet", body["passage"].lower())


class IngestTests(unittest.TestCase):
    def test_rejects_quote_not_in_cache_and_accepts_one_in_cache(self) -> None:
        item = make_item()
        items = {item.item_id: item}
        good = {"itemId": ITEM_ID, "level": "L2", "status": "source-verified", "quote": "A subnet is a range of IP addresses in your VPC.", "sourceUrl": FIXTURE_URL, "checker": "owner"}
        bad = dict(good, quote="This sentence is not in the source at all.")
        accepted, rejected = ingest([good, bad], items, cache_root=FIXTURE_CACHE)
        self.assertEqual(len(accepted), 1)
        self.assertEqual(len(rejected), 1)
        self.assertIn("quote not found", rejected[0])


class LegacyAndCompactTests(unittest.TestCase):
    def test_legacy_import_is_idempotent(self) -> None:
        item = make_item()
        checks = {ITEM_ID: [{"factChecker": "cursor", "checked": "2026-04-11T15:07:15Z", "conclusion": "correct", "source": FIXTURE_URL}]}
        first = legacy_rows([item], checks, [])
        self.assertEqual(len(first), 1)
        self.assertEqual(first[0]["status"], "legacy-unverified")
        self.assertEqual(legacy_rows([item], checks, first), [])

    def test_compact_keeps_latest_row_per_item_level_and_rubric(self) -> None:
        old = {"itemId": ITEM_ID, "level": "L1", "rubricVersion": RUBRIC_VERSION, "status": "flagged"}
        new = dict(old, status="lint-clean")
        self.assertEqual(compact([old, new]), [new])

    def test_append_and_read_round_trip(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "exams.jsonl"
            append_rows(path, [{"itemId": ITEM_ID, "level": "L1", "rubricVersion": RUBRIC_VERSION, "status": "lint-clean"}])
            self.assertEqual(len(read_rows(path)), 1)
            self.assertEqual(json.loads(path.read_text(encoding="utf-8").strip())["status"], "lint-clean")


class RepoContractTests(unittest.TestCase):
    def test_source_cache_is_gitignored(self) -> None:
        self.assertIn(".cache/content-quality/", (ROOT / ".gitignore").read_text(encoding="utf-8"))


if __name__ == "__main__":
    unittest.main()
