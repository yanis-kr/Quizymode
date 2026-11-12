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
from flag_country_data import COUNTRIES, KEPT_COUNTRIES, STARTER  # noqa: E402

MANIFEST = json.loads(emit_flag_items.MANIFEST_PATH.read_text(encoding="utf-8"))
REGIONS = {"africa", "asia", "europe", "north-america", "south-america", "oceania"}


def flag_files() -> list[Path]:
    # Sorted by name: countries.json sorts before mixed.NNN.json, matching build_flag_items() order.
    return sorted([*emit_flag_items.SCOPE_DIR.glob("geography.flags.countries*.json"), *emit_flag_items.SCOPE_DIR.glob("geography.flags.mixed*.json")])


def load_emitted_flag_items() -> list[dict]:
    items: list[dict] = []
    for path in flag_files():
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
            self.assertTrue(item["source"].startswith(("https://en.wikipedia.org/wiki/Flag_of_", "https://www.britannica.com/topic/flag-of-")), answer)
            self.assertIn(item["questionImage"]["key"].removeprefix("curated:flags/"), names)
            self.assertTrue(item["explanation"].strip(), answer)
            self.assertNotIn("This is the flag of", item["explanation"], answer)

    def test_countries_and_mixed_split_by_the_kept_list(self) -> None:
        by_file = {path.name: json.loads(path.read_text(encoding="utf-8")) for path in flag_files()}
        countries = by_file["geography.flags.countries.json"]
        mixed = [item for name, items in by_file.items() if "mixed" in name for item in items]
        self.assertEqual(67, len(KEPT_COUNTRIES))
        self.assertEqual(67, len(countries))
        self.assertEqual(128, len(mixed))
        self.assertTrue(all(item["navigationKeyword2"] == "countries" for item in countries))
        self.assertTrue(all(item["navigationKeyword2"] == "mixed" for item in mixed))
        self.assertEqual({"United States", "Türkiye", "Japan", "Switzerland", "Canada"} - {item["correctAnswer"] for item in countries}, set())

    def test_no_trivia_items_remain_in_the_flags_scope(self) -> None:
        for path in flag_files():
            for item in json.loads(path.read_text(encoding="utf-8")):
                self.assertIn("questionImage", item, path.name)
                self.assertEqual("Which country's flag is this?", item["question"])

    def test_starter_pool_flags_are_well_known_countries(self) -> None:
        starters = {item["correctAnswer"] for item in load_emitted_flag_items() if "starterWorld" in item}
        self.assertEqual({"Nepal", "Switzerland", "Brazil", "Canada", "Denmark", "India", "Japan", "United States"}, starters)
        self.assertEqual({"np", "ch", "br", "ca", "dk", "in", "jp", "us"}, set(STARTER))

    def test_contested_flags_explain_the_pictured_flag(self) -> None:
        by_answer = {item["correctAnswer"]: item for item in load_emitted_flag_items()}
        afghanistan = by_answer["Afghanistan"]["explanation"]
        self.assertIn("2013", afghanistan)
        self.assertIn("Taliban", afghanistan)
        self.assertIn("mihrab", afghanistan)
        syria = by_answer["Syria"]["explanation"]
        self.assertIn("2025", syria)
        self.assertIn("two green stars", syria)


if __name__ == "__main__":
    unittest.main()
