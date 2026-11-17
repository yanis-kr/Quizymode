"""Fetcher, tiers, link report and risk-ordered queue (#769). No network: transports are stubs."""
from __future__ import annotations

import json
import sys
import tempfile
import unittest
from datetime import datetime, timedelta, timezone
from pathlib import Path

SCRIPTS = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(SCRIPTS))
sys.path.insert(0, str(SCRIPTS / "content_quality"))

from fetcher import (  # noqa: E402
    fetch_run,
    write_entry,
    is_bare_homepage,
    link_report,
    read_entry,
    tier_for_url,
    wikipedia_api_url,
)
from quality_lib import content_hash, risk_queue  # noqa: E402
from seed_source_common import SourceItem  # noqa: E402

TIERS = {
    "defaultTier": "T4",
    "unfetchableTier": "T5",
    "domains": {"docs.aws.amazon.com": "T1", "wikipedia.org": "T3", "github.com": "T5"},
}
PROFILES = {
    "default": {"longestMargin": 15, "minExplanation": 25, "stakes": 1, "minTier": "T4", "reviewIntervalDays": 365},
    "exams": {"longestMargin": 15, "minExplanation": 40, "stakes": 3, "minTier": "T2", "reviewIntervalDays": 180},
}
NOW = datetime(2026, 11, 17, tzinfo=timezone.utc)
NO_CACHE = Path(tempfile.gettempdir()) / "content-quality-test-none"


class Recorder:
    """Transport stub: canned responses per URL (unknown URLs answer 404), and every URL requested is recorded."""

    def __init__(self, responses: dict) -> None:
        self.responses = responses
        self.calls: list[str] = []

    def __call__(self, url: str) -> tuple[int, str]:
        self.calls.append(url)
        result = self.responses.get(url, (404, ""))
        if isinstance(result, Exception):
            raise result
        return result


def no_sleep(_: float) -> None:
    return None


def fake_clock():
    now = [0.0]

    def clock() -> float:
        return now[0]

    return clock


def make_item(item_id: str, category: str, source: str | None) -> SourceItem:
    return SourceItem(
        item_id=item_id,
        category=category,
        navigation_keyword1="x",
        navigation_keyword2="",
        question=f"Question {item_id}?",
        correct_answer="Right",
        incorrect_answers=["A", "B", "C"],
        explanation="An explanation that is long enough to count.",
        keywords=None,
        source=source,
        path=Path("x.json"),
        index=0,
    )


class FetcherTests(unittest.TestCase):
    def setUp(self) -> None:
        self.tmp = tempfile.TemporaryDirectory()
        self.cache = Path(self.tmp.name)

    def tearDown(self) -> None:
        self.tmp.cleanup()

    def test_one_request_per_url_per_run_even_when_listed_twice(self) -> None:
        page = "https://docs.example.com/a"
        transport = Recorder({page: (200, "<html><body><p>Some page text here.</p></body></html>")})
        summary = fetch_run([page, page, page], cache_root=self.cache, transport=transport, sleep=no_sleep, clock=fake_clock(), now=NOW)
        self.assertEqual(transport.calls.count(page), 1)
        self.assertEqual(summary.skipped_duplicate, 2)
        self.assertEqual(summary.ok, 1)

    def test_robots_disallow_is_recorded_as_unfetchable_without_fetching_the_page(self) -> None:
        page = "https://blocked.example.com/private/x"
        transport = Recorder({
            "https://blocked.example.com/robots.txt": (200, "User-agent: *\nDisallow: /private/"),
            page: (200, "<p>secret</p>"),
        })
        summary = fetch_run([page], cache_root=self.cache, transport=transport, sleep=no_sleep, clock=fake_clock(), now=NOW)
        self.assertNotIn(page, transport.calls)
        entry = read_entry(page, self.cache)
        self.assertEqual(entry["status"], "unfetchable")
        self.assertEqual(entry["reason"], "robots-disallowed")
        self.assertEqual(summary.reasons, {"robots-disallowed": 1})

    def test_a_failure_is_recorded_once_with_no_retry(self) -> None:
        page = "https://flaky.example.com/a"
        transport = Recorder({page: OSError("timeout")})
        summary = fetch_run([page], cache_root=self.cache, transport=transport, sleep=no_sleep, clock=fake_clock(), now=NOW)
        self.assertEqual(transport.calls.count(page), 1)
        self.assertEqual(read_entry(page, self.cache)["reason"], "error:OSError")
        self.assertEqual(summary.unfetchable, 1)

    def test_a_429_raises_the_domain_delay_and_is_not_retried(self) -> None:
        first, second = "https://busy.example.com/a", "https://busy.example.com/b"
        transport = Recorder({first: (429, ""), second: (200, "<p>Second page with text.</p>")})
        sleeps: list[float] = []
        fetch_run([first, second], cache_root=self.cache, transport=transport, sleep=sleeps.append, clock=fake_clock(), now=NOW)
        self.assertEqual(transport.calls.count(first), 1)
        self.assertEqual(read_entry(first, self.cache)["reason"], "429")
        self.assertTrue(sleeps and max(sleeps) >= 2.0, "the next request to the domain waits at least the doubled delay")

    def test_cached_fresh_entries_are_skipped(self) -> None:
        page = "https://docs.example.com/cached"
        transport = Recorder({page: (200, "<p>Text.</p>")})
        fetch_run([page], cache_root=self.cache, transport=transport, sleep=no_sleep, clock=fake_clock(), now=NOW)
        again = Recorder({})
        summary = fetch_run([page], cache_root=self.cache, transport=again, sleep=no_sleep, clock=fake_clock(), now=NOW)
        self.assertEqual(again.calls, [])
        self.assertEqual(summary.skipped_cached, 1)

    def test_wikipedia_uses_the_api_with_plain_text_and_revision_id(self) -> None:
        page = "https://en.wikipedia.org/wiki/Quadratic_formula"
        api = wikipedia_api_url(page)
        self.assertIn("/w/api.php?", api)
        self.assertIn("explaintext=1", api)
        body = json.dumps({"query": {"pages": [{"title": "Quadratic formula", "extract": "x = ...", "lastrevid": 12345}]}})
        transport = Recorder({"https://en.wikipedia.org/robots.txt": (404, ""), api: (200, body)})
        fetch_run([page], cache_root=self.cache, transport=transport, sleep=no_sleep, clock=fake_clock(), now=NOW)
        entry = read_entry(page, self.cache)
        self.assertEqual(entry["status"], "ok")
        self.assertEqual(entry["revisionId"], "12345")
        self.assertEqual(entry["text"], "x = ...")


    def test_any_exception_is_recorded_as_unfetchable_and_the_run_continues(self) -> None:
        bad, good = "https://odd.example.com/bad", "https://odd.example.com/good"
        transport = Recorder({bad: ValueError("unexpected body"), good: (200, "<p>Still fetched.</p>")})
        summary = fetch_run([bad, good], cache_root=self.cache, transport=transport, sleep=no_sleep, clock=fake_clock(), now=NOW)
        self.assertEqual(read_entry(bad, self.cache)["reason"], "error:ValueError")
        self.assertEqual(read_entry(good, self.cache)["status"], "ok")
        self.assertEqual(summary.ok, 1)

    def test_entries_from_an_older_fetcher_version_are_fetched_again(self) -> None:
        page = "https://docs.example.com/versioned"
        write_entry(page, {"url": page, "status": "ok", "text": "old", "fetchedAt": NOW.isoformat()}, self.cache)
        transport = Recorder({page: (200, "<p>New text.</p>")})
        fetch_run([page], cache_root=self.cache, transport=transport, sleep=no_sleep, clock=fake_clock(), now=NOW)
        self.assertEqual(transport.calls.count(page), 1)
        self.assertEqual(read_entry(page, self.cache)["text"], "New text.")

    def test_wikipedia_robots_are_checked_for_the_api_url_actually_requested(self) -> None:
        page = "https://en.wikipedia.org/wiki/Blocked_title"
        api = wikipedia_api_url(page)
        disallow = "User-agent: *" + chr(10) + "Disallow: /w/"
        transport = Recorder({"https://en.wikipedia.org/robots.txt": (200, disallow), api: (200, "{}")})
        fetch_run([page], cache_root=self.cache, transport=transport, sleep=no_sleep, clock=fake_clock(), now=NOW)
        self.assertNotIn(api, transport.calls)
        self.assertEqual(read_entry(page, self.cache)["reason"], "robots-disallowed")

class TierAndReportTests(unittest.TestCase):
    def test_tier_follows_the_parent_domain_and_defaults_otherwise(self) -> None:
        self.assertEqual(tier_for_url("https://docs.aws.amazon.com/x", TIERS), "T1")
        self.assertEqual(tier_for_url("https://en.wikipedia.org/wiki/X", TIERS), "T3")
        self.assertEqual(tier_for_url("https://random.blog.example/x", TIERS), "T4")

    def test_bare_homepage_detection(self) -> None:
        self.assertTrue(is_bare_homepage("https://example.com"))
        self.assertTrue(is_bare_homepage("https://example.com/"))
        self.assertFalse(is_bare_homepage("https://example.com/guide"))

    def test_link_report_counts_status_tier_domain_and_flags_bare_homepages(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            cache = Path(tmp)
            ok_url = "https://docs.aws.amazon.com/guide"
            bad_url = "https://github.com/dump/repo/blob/x.json"
            home_url = "https://example.com/"
            transport = Recorder({
                ok_url: (200, "<p>Guide text.</p>"),
                bad_url: (404, ""),
                home_url: (200, "<p>Home.</p>"),
                "https://github.com/robots.txt": (404, ""),
                "https://example.com/robots.txt": (404, ""),
                "https://docs.aws.amazon.com/robots.txt": (404, ""),
            })
            fetch_run([ok_url, bad_url, home_url], cache_root=cache, transport=transport, sleep=no_sleep, clock=fake_clock(), now=NOW)
            report = link_report({"a": ok_url, "b": bad_url, "c": home_url}, TIERS, cache)
        self.assertEqual(report["byStatus"]["200"], 2)
        self.assertEqual(report["byStatus"]["404"], 1)
        self.assertEqual(report["byTier"]["T1"], 1)
        self.assertEqual(report["byTier"]["T5"], 1)
        self.assertEqual(report["byDomain"]["github.com"], 1)
        self.assertEqual(report["bareHomepages"], [home_url])
        self.assertEqual(report["itemsWithSourceText"], 2)


class RiskQueueTests(unittest.TestCase):
    def test_orders_by_tier_and_stakes_and_gives_a_reason_per_item(self) -> None:
        exam_dump = make_item("e1", "exams", "https://github.com/dump/x")
        exam_docs = make_item("e2", "exams", "https://docs.aws.amazon.com/y")
        default_blog = make_item("d1", "languages", "https://blog.example.com/z")
        ranked = risk_queue([default_blog, exam_docs, exam_dump], [], "L1", 10, TIERS, PROFILES, NOW, cache_root=NO_CACHE)
        self.assertEqual([item.item_id for item, _, _ in ranked], ["e1", "d1", "e2"])
        for _, reason, _ in ranked:
            self.assertIn("no ledger row", reason)
            self.assertIn("source tier", reason)

    def test_an_item_with_a_current_row_is_omitted_and_a_stale_one_is_queued_again(self) -> None:
        item = make_item("e3", "exams", None)
        current = {
            "itemId": "e3", "contentHash": content_hash(item), "rubricVersion": "1", "level": "L1",
            "status": "lint-clean", "sourceUrl": None, "sourceTextHash": None, "checkedAt": NOW.isoformat(),
        }
        self.assertEqual(risk_queue([item], [current], "L1", 5, TIERS, PROFILES, NOW, cache_root=NO_CACHE), [])
        old = dict(current, checkedAt=(NOW - timedelta(days=200)).isoformat())
        queued = risk_queue([item], [old], "L1", 5, TIERS, PROFILES, NOW, cache_root=NO_CACHE)
        self.assertEqual(len(queued), 1)
        self.assertIn("review interval passed", queued[0][1])

    def test_a_changed_source_text_queues_the_citing_item(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            cache = Path(tmp)
            url = "https://docs.aws.amazon.com/changing"
            transport = Recorder({url: (200, "<p>Version one of the text.</p>"), "https://docs.aws.amazon.com/robots.txt": (404, "")})
            fetch_run([url], cache_root=cache, transport=transport, sleep=no_sleep, clock=fake_clock(), now=NOW)
            item = make_item("e4", "exams", url)
            row = {
                "itemId": "e4", "contentHash": content_hash(item), "rubricVersion": "1", "level": "L1",
                "status": "source-verified", "sourceUrl": url, "sourceTextHash": "0" * 64, "checkedAt": NOW.isoformat(),
            }
            queued = risk_queue([item], [row], "L1", 5, TIERS, PROFILES, NOW, cache_root=cache)
        self.assertEqual(len(queued), 1)
        self.assertIn("source text changed", queued[0][1])


if __name__ == "__main__":
    unittest.main()
