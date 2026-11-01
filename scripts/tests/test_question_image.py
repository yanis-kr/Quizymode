"""Tests for the curated question picture (#407) support in the seed-source tooling.

Run: python -m unittest discover -s scripts/tests -v
"""
from __future__ import annotations

import sys
import tempfile
import unittest
from pathlib import Path
from unittest import mock

SCRIPTS_DIR = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(SCRIPTS_DIR))

import process_import_inbox  # noqa: E402
import seed_source_common as common  # noqa: E402

SCOPE_PATH = Path("data/seed-source/items/geography/geography.flags.countries.001.json")
KEY_FR = "curated:flags/fr"
ALT_FR = "Three vertical bands of blue, white and red"


def make_item(
    item_id: str,
    question: str = "Which country uses this flag?",
    image: dict[str, str] | None = None,
    answer: str = "France",
) -> common.SourceItem:
    return common.SourceItem(
        item_id=item_id,
        category="geography",
        navigation_keyword1="flags",
        navigation_keyword2="countries",
        question=question,
        correct_answer=answer,
        incorrect_answers=["Italy", "Ireland"],
        explanation="Explanation",
        keywords=None,
        source=None,
        path=SCOPE_PATH,
        index=0,
        question_image=image,
    )


def image(key: str = KEY_FR, alt: str = ALT_FR) -> dict[str, str]:
    return {"key": key, "altText": alt}


ID_A = "11111111-1111-1111-1111-111111111111"
ID_B = "22222222-2222-2222-2222-222222222222"


class ValidateSourceQuestionImageTests(unittest.TestCase):
    def setUp(self) -> None:
        self._assets = tempfile.TemporaryDirectory()
        self.addCleanup(self._assets.cleanup)
        assets = Path(self._assets.name)
        (assets / "flags").mkdir()
        for name in ("fr", "it"):
            (assets / "flags" / f"{name}.webp").write_bytes(b"RIFF")
        patches = [
            mock.patch.object(common, "CURATED_ASSETS_ROOT", assets),
            mock.patch.object(
                common,
                "load_taxonomy_scopes",
                return_value={common.TaxonomyScope("geography", "flags", "countries")},
            ),
        ]
        for patcher in patches:
            patcher.start()
            self.addCleanup(patcher.stop)

    def errors(self, *items: common.SourceItem) -> list[str]:
        return common.validate_source(list(items), [])

    def test_same_question_with_different_keys_is_allowed(self) -> None:
        self.assertEqual(
            self.errors(
                make_item(ID_A, image=image("curated:flags/fr", "Vertical bands")),
                make_item(ID_B, image=image("curated:flags/it", "Green, white, red"), answer="Italy"),
            ),
            [],
        )

    def test_same_question_with_same_key_is_rejected(self) -> None:
        errors = self.errors(make_item(ID_A, image=image()), make_item(ID_B, image=image()))
        self.assertEqual(len([e for e in errors if "Duplicate question" in e]), 1)

    def test_same_question_text_only_twice_is_rejected(self) -> None:
        errors = self.errors(make_item(ID_A), make_item(ID_B))
        self.assertEqual(len([e for e in errors if "Duplicate question" in e]), 1)

    def test_text_only_and_picture_with_same_question_is_allowed(self) -> None:
        self.assertEqual(self.errors(make_item(ID_A), make_item(ID_B, image=image())), [])

    def test_missing_asset_is_rejected(self) -> None:
        errors = self.errors(make_item(ID_A, image=image("curated:flags/de", "Black, red, gold")))
        self.assertTrue(any("has no asset" in e for e in errors), errors)

    def test_bad_key_formats_are_rejected(self) -> None:
        for key in ("flags/fr", "curated:flags/FR", "curated:fr", "curated:../x", "https://evil/x.webp", "__proto__"):
            with self.subTest(key=key):
                errors = self.errors(make_item(ID_A, image=image(key)))
                self.assertTrue(any("must look like" in e for e in errors), errors)

    def test_key_over_one_hundred_characters_is_rejected(self) -> None:
        errors = self.errors(make_item(ID_A, image=image("curated:flags/" + "a" * 87)))
        self.assertTrue(any("must look like" in e for e in errors), errors)

    def test_alt_text_is_required_and_limited(self) -> None:
        for alt in ("", "x" * 301, "two\nlines", "tab\there", "c1\u0085control", "c1\u009fend", "del\x7fchar"):
            with self.subTest(alt=alt):
                errors = self.errors(make_item(ID_A, image=image(alt=alt)))
                self.assertTrue(any("altText is required" in e for e in errors), errors)

    def test_alt_text_must_not_name_the_answer(self) -> None:
        errors = self.errors(make_item(ID_A, image=image(alt="The flag of France")))
        self.assertTrue(any("must not contain the correct answer" in e for e in errors), errors)

    def test_valid_picture_item_has_no_errors(self) -> None:
        self.assertEqual(self.errors(make_item(ID_A, image=image())), [])


class QuestionImageRoundTripTests(unittest.TestCase):
    def test_canonical_payload_keeps_question_image(self) -> None:
        payload = common.canonicalize_item_payload(make_item(ID_A, image=image()))
        self.assertEqual(payload["questionImage"], {"key": KEY_FR, "altText": ALT_FR})

    def test_canonical_payload_omits_question_image_when_absent(self) -> None:
        self.assertNotIn("questionImage", common.canonicalize_item_payload(make_item(ID_A)))

    def test_parse_question_image(self) -> None:
        self.assertIsNone(common.parse_question_image(None, "x"))
        self.assertEqual(
            common.parse_question_image({"key": f" {KEY_FR} ", "altText": " alt "}, "x"),
            {"key": KEY_FR, "altText": "alt"},
        )
        with self.assertRaises(ValueError):
            common.parse_question_image("curated:flags/fr", "x")

    def test_import_inbox_payload_round_trips_to_source_item(self) -> None:
        payload = common.canonicalize_item_payload(make_item(ID_A, image=image()))
        item = process_import_inbox._payload_to_source_item(payload, SCOPE_PATH, 0)
        self.assertEqual(item.question_image, image())
        self.assertEqual(common.canonicalize_item_payload(item), payload)

    def test_import_inbox_candidate_keeps_question_image(self) -> None:
        scope = ("nature", "animals", "predators")
        raw = {
            "question": "Which predator hunts in packs on the savanna?",
            "correctAnswer": "Lion",
            "incorrectAnswers": ["Tiger", "Bear", "Wolf"],
            "explanation": "Lions hunt cooperatively in prides.",
            "keywords": ["pride"],
            "questionImage": {"key": KEY_FR, "altText": ALT_FR},
        }
        with mock.patch.object(process_import_inbox, "is_quality_item", return_value=True):
            candidate = process_import_inbox.build_candidate(Path("nature.animals.predators.json"), raw, scope)
        self.assertIsNotNone(candidate)
        self.assertEqual(candidate["questionImage"], image())

    def test_question_identity_includes_image_key(self) -> None:
        a = common.question_identity("Which  Country?", image("curated:flags/fr"))
        b = common.question_identity("which country?", image("curated:flags/it"))
        c = common.question_identity("which country?", image("curated:flags/fr"))
        d = common.question_identity("which country?", None)
        self.assertNotEqual(a, b)
        self.assertEqual(a, c)
        self.assertNotEqual(a, d)


if __name__ == "__main__":
    unittest.main()
