"""Tests for the flag picture set (#407 PR 2): data integrity, naming and alt text rules.

Run: python -m unittest discover -s scripts/tests -v
"""
from __future__ import annotations

import json
import sys
import unittest
import uuid
from pathlib import Path

SCRIPTS_DIR = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(SCRIPTS_DIR))

import emit_flag_items  # noqa: E402
import seed_source_common as common  # noqa: E402
from flag_country_data import COUNTRIES, EXTRA_EXPLANATION  # noqa: E402

MANIFEST = json.loads(emit_flag_items.MANIFEST_PATH.read_text(encoding="utf-8"))
REGIONS = {"africa", "asia", "europe", "north-america", "south-america", "oceania"}


def load_emitted_flag_items() -> list[dict]:
    items: list[dict] = []
    for path in sorted(emit_flag_items.SCOPE_DIR.glob("geography.flags.countries.*.json")):
        items.extend(item for item in json.loads(path.read_text(encoding="utf-8")) if "questionImage" in item)
    return items


class AltTextAnswerCheckTests(unittest.TestCase):
    def test_demonym_that_starts_with_the_answer_is_rejected(self) -> None:
        self.assertTrue(common.answer_in_alt_text("Oman", "An Omani dagger"))
        self.assertTrue(common.answer_in_alt_text("Cuba", "A Cuban star"))
        self.assertTrue(common.answer_in_alt_text("Chad", "A Chadian stripe"))

    def test_whole_word_match_is_rejected(self) -> None:
        self.assertTrue(common.answer_in_alt_text("Oman", "The flag of Oman has three bands"))
        self.assertTrue(common.answer_in_alt_text("Saudi Arabia", "A green flag of saudi arabia"))

    def test_substring_inside_another_word_is_allowed(self) -> None:
        self.assertFalse(common.answer_in_alt_text("Oman", "A Roman numeral on a red field"))
        self.assertFalse(common.answer_in_alt_text("Chad", "A flag with a Michad stripe"))

    def test_punctuation_counts_as_a_boundary(self) -> None:
        self.assertTrue(common.answer_in_alt_text("Chad", "Looks like Chad, blue yellow red."))

    def test_empty_answer_never_matches(self) -> None:
        self.assertFalse(common.answer_in_alt_text("", "anything"))


class FlagSetTests(unittest.TestCase):
    def test_set_is_193_un_members_plus_two_observers(self) -> None:
        self.assertEqual(195, len(COUNTRIES))
        self.assertEqual(195, len({row[0] for row in COUNTRIES}))
        self.assertEqual(195, len({row[1] for row in COUNTRIES}))
        self.assertIn("Vatican City", {row[1] for row in COUNTRIES})
        self.assertIn("Palestine", {row[1] for row in COUNTRIES})
        self.assertEqual(REGIONS, {row[2] for row in COUNTRIES})

    def test_manifest_matches_country_data(self) -> None:
        entries = {entry["iso2"]: entry for entry in MANIFEST["entries"]}
        self.assertEqual({row[0] for row in COUNTRIES}, set(entries))
        for iso2, name, region, _file, _design in COUNTRIES:
            self.assertEqual(name, entries[iso2]["country"])
            self.assertEqual(region, entries[iso2]["region"])
            self.assertLessEqual(entries[iso2]["outputBytes"], 102400)

    def test_item_ids_are_stable_uuid5(self) -> None:
        self.assertEqual(
            str(uuid.uuid5(emit_flag_items.FLAG_NAMESPACE, "flag-country:fr")),
            emit_flag_items.item_id_for("fr"),
        )
        first = emit_flag_items.build_flag_items()
        second = emit_flag_items.build_flag_items()
        self.assertEqual(first, second)

    def test_emitted_files_match_a_fresh_emit(self) -> None:
        self.assertEqual(emit_flag_items.build_flag_items(), load_emitted_flag_items())

    def test_every_item_follows_the_rules(self) -> None:
        names = {row[0]: row[1] for row in COUNTRIES}
        regions = {row[1]: row[2] for row in COUNTRIES}
        items = load_emitted_flag_items()
        self.assertEqual(195, len(items))
        for item in items:
            answer = item["correctAnswer"]
            self.assertEqual("Which country's flag is this?", item["question"])
            self.assertEqual([regions[answer]], item["keywords"])
            self.assertEqual(3, len(item["incorrectAnswers"]))
            self.assertEqual(3, len(set(item["incorrectAnswers"])))
            self.assertNotIn(answer, item["incorrectAnswers"])
            for wrong in item["incorrectAnswers"]:
                self.assertEqual(regions[answer], regions[wrong], f"{answer}: {wrong} is from another region")
            alt = item["questionImage"]["altText"]
            self.assertFalse(common.answer_in_alt_text(answer, alt), answer)
            self.assertLessEqual(len(alt), common.QUESTION_IMAGE_ALT_MAX)
            self.assertTrue(item["source"].startswith("https://commons.wikimedia.org/wiki/File:"))
            self.assertIn(item["questionImage"]["key"].removeprefix("curated:flags/"), names)

    def test_contested_flags_mention_the_other_flag(self) -> None:
        by_answer = {item["correctAnswer"]: item for item in load_emitted_flag_items()}
        afghanistan = by_answer["Afghanistan"]["explanation"]
        self.assertIn("black, red and green", afghanistan)
        self.assertIn("Taliban", afghanistan)
        self.assertIn("Shahada", afghanistan)
        syria = by_answer["Syria"]["explanation"]
        self.assertIn("2025", syria)
        self.assertIn("two green stars", syria)
        self.assertEqual({"af", "sy"}, set(EXTRA_EXPLANATION))

    def test_existing_trivia_items_keep_their_ids(self) -> None:
        path = emit_flag_items.SCOPE_DIR / "geography.flags.countries.001.json"
        first = json.loads(path.read_text(encoding="utf-8"))
        self.assertEqual("3f50c714-5763-4739-9e3b-bb2db846eec2", first[0]["itemId"])
        self.assertEqual("9e2eb19e-66fe-4f36-9ea1-a519d3b01aa9", first[10]["itemId"])
        self.assertNotIn("questionImage", first[10])


if __name__ == "__main__":
    unittest.main()
