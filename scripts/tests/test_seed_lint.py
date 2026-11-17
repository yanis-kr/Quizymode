from __future__ import annotations

import sys
import unittest
from pathlib import Path

SCRIPTS = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(SCRIPTS))

import json  # noqa: E402

from lint_seed_source import (  # noqa: E402
    hard_violations,
    near_duplicates,
    select_changed_items,
    soft_violations,
    violation_key,
)
from seed_source_common import SourceItem  # noqa: E402

PROFILES = {"default": {"longestMargin": 15, "minExplanation": 25}}


def make_item(**overrides: object) -> SourceItem:
    base = dict(
        item_id="00000000-0000-0000-0000-000000000001",
        category="business",
        navigation_keyword1="accounting",
        navigation_keyword2="audit",
        question="Which report summarises assets and liabilities at a date?",
        correct_answer="Balance sheet",
        incorrect_answers=["Income statement", "Cash flow statement", "Trial balance"],
        explanation="A balance sheet lists assets, liabilities and equity at one point in time.",
        keywords=None,
        source=None,
        path=Path("x.json"),
        index=0,
    )
    base.update(overrides)
    return SourceItem(**base)  # type: ignore[arg-type]


class HardRuleTests(unittest.TestCase):
    def test_clean_item_has_no_hard_violation(self) -> None:
        self.assertEqual(hard_violations(make_item()), [])

    def test_duplicate_option_fails(self) -> None:
        item = make_item(incorrect_answers=["balance sheet", "Trial balance", "Cash"])
        self.assertIn("H1-duplicate-option", hard_violations(item))

    def test_explanation_echoing_answer_fails(self) -> None:
        item = make_item(explanation="Balance sheet")
        self.assertIn("H2-explanation-echo", hard_violations(item))

    def test_placeholder_fails(self) -> None:
        item = make_item(explanation="The best-matching choice is shown here for this item.")
        self.assertIn("H3-placeholder", hard_violations(item))

    def test_upd_marker_fails(self) -> None:
        item = make_item(explanation="A balance sheet lists assets. UPD260101 leftover marker here.")
        self.assertIn("H4-upd-marker", hard_violations(item))


class SoftRuleTests(unittest.TestCase):
    def test_clean_item_has_no_soft_violation(self) -> None:
        self.assertEqual(soft_violations(make_item(), PROFILES), [])

    def test_longest_key_is_flagged(self) -> None:
        item = make_item(correct_answer="A balance sheet that lists every asset and liability at a date", incorrect_answers=["Cash", "Trial", "Ledger"], question="Which report?")
        self.assertIn("S1-key-longest", soft_violations(item, PROFILES))

    def test_absolute_option_is_flagged(self) -> None:
        item = make_item(incorrect_answers=["All of the above", "Trial balance", "Ledger"])
        self.assertIn("S2-absolute-option", soft_violations(item, PROFILES))

    def test_short_explanation_is_flagged(self) -> None:
        item = make_item(explanation="Too short.")
        self.assertIn("S3-short-explanation", soft_violations(item, PROFILES))

    def test_key_in_stem_is_flagged(self) -> None:
        item = make_item(question="Is a balance sheet a report that summarises assets?")
        self.assertIn("S4-key-in-stem", soft_violations(item, PROFILES))

    def test_violation_key_is_item_and_rule(self) -> None:
        item = make_item()
        self.assertEqual(violation_key(item, "S3-short-explanation"), f"{item.item_id}|S3-short-explanation")


class ChangedItemTests(unittest.TestCase):
    """An edited file must not drag its untouched neighbours (with existing hard violations) into the check."""

    def test_only_the_edited_item_is_checked(self) -> None:
        clean_id = "00000000-0000-0000-0000-0000000000a1"
        edited_id = "00000000-0000-0000-0000-0000000000a2"
        bad_neighbour = {"itemId": clean_id, "question": "Old?", "correctAnswer": "x", "incorrectAnswers": ["x"], "explanation": "UPD260101 leftover marker text"}
        base = [bad_neighbour, {"itemId": edited_id, "question": "Before?", "correctAnswer": "a", "incorrectAnswers": ["b"], "explanation": "Original explanation text here."}]
        head = [bad_neighbour, {"itemId": edited_id, "question": "After?", "correctAnswer": "a", "incorrectAnswers": ["b"], "explanation": "Edited explanation text here."}]
        path = SCRIPTS.parent / "data" / "seed-source" / "items" / "exams" / "exams.test.fixture.json"
        items = [
            make_item(item_id=clean_id, path=path, question="Old?", correct_answer="x", incorrect_answers=["x"], explanation="UPD260101 leftover marker text"),
            make_item(item_id=edited_id, path=path, question="After?", correct_answer="a", incorrect_answers=["b"], explanation="Edited explanation text here."),
        ]
        rel = items[0].path.resolve().relative_to(SCRIPTS.parent).as_posix()
        selected = select_changed_items(
            items,
            {rel},
            base_text=lambda _rel: json.dumps(base),
            head_text=lambda _rel: json.dumps(head),
        )
        self.assertEqual([i.item_id for i in selected], [edited_id])

    def test_new_item_in_changed_file_is_checked(self) -> None:
        path = SCRIPTS.parent / "data" / "seed-source" / "items" / "exams" / "exams.test.fixture.json"
        new_id = "00000000-0000-0000-0000-0000000000a3"
        item = make_item(item_id=new_id, path=path)
        rel = item.path.resolve().relative_to(SCRIPTS.parent).as_posix()
        head = [{"itemId": new_id, "question": "New?", "correctAnswer": "a", "incorrectAnswers": ["b"]}]
        selected = select_changed_items([item], {rel}, base_text=lambda _rel: None, head_text=lambda _rel: json.dumps(head))
        self.assertEqual([i.item_id for i in selected], [new_id])


class NearDuplicateTests(unittest.TestCase):
    def test_similar_questions_in_one_category_are_reported(self) -> None:
        a = make_item(item_id="00000000-0000-0000-0000-00000000000a", question="What does the balance sheet report at a date?")
        b = make_item(item_id="00000000-0000-0000-0000-00000000000b", question="What does the balance sheet report at a date exactly?")
        pairs = near_duplicates([a, b])
        self.assertEqual(len(pairs), 1)
        self.assertEqual({pairs[0]["a"], pairs[0]["b"]}, {a.item_id, b.item_id})
        self.assertGreaterEqual(float(pairs[0]["similarity"]), 0.8)  # type: ignore[arg-type]

    def test_unrelated_questions_are_not_reported(self) -> None:
        a = make_item(item_id="00000000-0000-0000-0000-00000000000c", question="Which planet is largest?")
        b = make_item(item_id="00000000-0000-0000-0000-00000000000d", question="Who wrote the play Hamlet?")
        self.assertEqual(near_duplicates([a, b]), [])


if __name__ == "__main__":
    unittest.main()
