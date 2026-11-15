"""Tests for the `funny` keyword rule (AC 3.36.2, 3.36.3)."""
from __future__ import annotations

import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import seed_source_common as common  # noqa: E402


GOOD_QUESTION = "What does the French idiom 'x' (literally: \"to tell salads\") actually mean?"


def make_item(keyword2: str, keywords: list[str], question: str = GOOD_QUESTION) -> common.SourceItem:
    return common.SourceItem(
        item_id="00000000-0000-0000-0000-000000000001",
        category="languages",
        navigation_keyword1="french",
        navigation_keyword2=keyword2,
        question=question,
        correct_answer="A",
        incorrect_answers=["B"],
        explanation=None,
        keywords=keywords,
        source=None,
        path=Path("data/seed-source/items/languages/languages.french.idioms.json"),
        index=1,
    )


class FunnyKeywordTests(unittest.TestCase):
    def test_primary_idioms_item_may_be_funny(self) -> None:
        self.assertEqual(common.validate_funny_keyword(make_item("idioms", ["funny"])), [])

    def test_practice_item_may_not_be_funny(self) -> None:
        self.assertEqual(len(common.validate_funny_keyword(make_item("idioms", ["funny", "idiom-practice"]))), 1)
        self.assertEqual(len(common.validate_funny_keyword(make_item("vocabulary", ["funny"]))), 1)

    def test_funny_question_must_show_literal_and_ask_mean(self) -> None:
        for bad in ("What does the French idiom 'x' most naturally mean?", "What does the French idiom 'x' (literally: \"y\") mean?", "What does the French idiom 'x' (literally: \"y\") express?"):
            self.assertEqual(len(common.validate_funny_keyword(make_item("idioms", ["funny"], bad))), 1)

    def test_items_without_funny_are_ignored(self) -> None:
        self.assertEqual(common.validate_funny_keyword(make_item("vocabulary", ["x"])), [])


if __name__ == "__main__":
    unittest.main()
