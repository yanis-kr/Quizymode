"""Tests for the curated explanation picture (#403) support in the seed-source tooling.

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

SCOPE_PATH = Path("data/seed-source/items/science/science.geometry.triangles.json")
KEY = "curated:diagrams/pythagorean-theorem"
ALT = "A right triangle with legs a and b and hypotenuse c, so a squared plus b squared equals c squared"
ID_A = "33333333-3333-3333-3333-333333333333"


def make_item(
    explanation: str | None = "The equation relates the legs and hypotenuse of a right triangle.",
    explanation_image: dict[str, str] | None = None,
    question_image: dict[str, str] | None = None,
) -> common.SourceItem:
    return common.SourceItem(
        item_id=ID_A,
        category="science",
        navigation_keyword1="geometry",
        navigation_keyword2="triangles",
        question="To which triangles does the Pythagorean theorem apply?",
        correct_answer="Right triangles",
        incorrect_answers=["All triangles", "Only equilateral triangles"],
        explanation=explanation,
        keywords=None,
        source=None,
        path=SCOPE_PATH,
        index=0,
        question_image=question_image,
        explanation_image=explanation_image,
    )


def image(key: str = KEY, alt: str = ALT) -> dict[str, str]:
    return {"key": key, "altText": alt}


class ValidateExplanationImageTests(unittest.TestCase):
    def setUp(self) -> None:
        self._assets = tempfile.TemporaryDirectory()
        self.addCleanup(self._assets.cleanup)
        assets = Path(self._assets.name)
        (assets / "diagrams").mkdir()
        (assets / "diagrams" / "pythagorean-theorem.webp").write_bytes(b"RIFF")
        patches = [
            mock.patch.object(common, "CURATED_ASSETS_ROOT", assets),
            mock.patch.object(
                common,
                "load_taxonomy_scopes",
                return_value={common.TaxonomyScope("science", "geometry", "triangles")},
            ),
        ]
        for patcher in patches:
            patcher.start()
            self.addCleanup(patcher.stop)

    def errors(self, item: common.SourceItem) -> list[str]:
        return common.validate_source([item], [])

    def test_valid_explanation_image_has_no_errors(self) -> None:
        self.assertEqual(self.errors(make_item(explanation_image=image())), [])

    def test_alt_text_may_name_the_answer(self) -> None:
        alt = "Right triangles: the two legs meet at a right angle"
        self.assertEqual(self.errors(make_item(explanation_image=image(alt=alt))), [])

    def test_question_image_alt_still_must_not_name_the_answer(self) -> None:
        errors = self.errors(make_item(question_image=image(alt="Right triangles diagram")))
        self.assertTrue(any("must not contain the correct answer" in e for e in errors), errors)

    def test_missing_asset_is_rejected(self) -> None:
        errors = self.errors(make_item(explanation_image=image("curated:diagrams/missing")))
        self.assertTrue(any("explanationImage.key" in e and "has no asset" in e for e in errors), errors)

    def test_bad_key_formats_are_rejected(self) -> None:
        for key in ("diagrams/x", "curated:diagrams/X", "curated:x", "curated:../x", "https://evil/x.webp", "__proto__"):
            with self.subTest(key=key):
                errors = self.errors(make_item(explanation_image=image(key)))
                self.assertTrue(any("explanationImage.key" in e and "must look like" in e for e in errors), errors)

    def test_alt_text_is_required_and_limited(self) -> None:
        for alt in ("", "x" * 301, "two\nlines", "tab\there", "del\x7fchar"):
            with self.subTest(alt=alt):
                errors = self.errors(make_item(explanation_image=image(alt=alt)))
                self.assertTrue(any("explanationImage.altText is required" in e for e in errors), errors)

    def test_explanation_text_is_required_with_an_explanation_image(self) -> None:
        for explanation in (None, "", "   "):
            with self.subTest(explanation=explanation):
                errors = self.errors(make_item(explanation=explanation, explanation_image=image()))
                self.assertTrue(any("requires a non-empty explanation" in e for e in errors), errors)

    def test_item_without_explanation_image_needs_no_explanation(self) -> None:
        self.assertEqual(self.errors(make_item(explanation=None)), [])


class ExplanationImageRoundTripTests(unittest.TestCase):
    def test_canonical_payload_keeps_explanation_image(self) -> None:
        payload = common.canonicalize_item_payload(make_item(explanation_image=image()))
        self.assertEqual(payload["explanationImage"], {"key": KEY, "altText": ALT})

    def test_canonical_payload_omits_explanation_image_when_absent(self) -> None:
        self.assertNotIn("explanationImage", common.canonicalize_item_payload(make_item()))

    def test_parse_explanation_image(self) -> None:
        self.assertIsNone(common.parse_explanation_image(None, "x"))
        self.assertEqual(
            common.parse_explanation_image({"key": f" {KEY} ", "altText": " alt "}, "x"),
            {"key": KEY, "altText": "alt"},
        )
        with self.assertRaises(ValueError) as raised:
            common.parse_explanation_image(KEY, "x")
        self.assertIn("explanationImage", str(raised.exception))

    def test_import_inbox_payload_round_trips_to_source_item(self) -> None:
        payload = common.canonicalize_item_payload(make_item(explanation_image=image()))
        item = process_import_inbox._payload_to_source_item(payload, SCOPE_PATH, 0)
        self.assertEqual(item.explanation_image, image())
        self.assertEqual(common.canonicalize_item_payload(item), payload)

    def test_import_inbox_candidate_keeps_explanation_image(self) -> None:
        scope = ("science", "geometry", "triangles")
        raw = {
            "question": "To which triangles does the Pythagorean theorem apply?",
            "correctAnswer": "Right triangles",
            "incorrectAnswers": ["All triangles", "Only equilateral triangles", "Only isosceles triangles"],
            "explanation": "The equation relates the legs and hypotenuse of a right triangle.",
            "keywords": ["pythagorean"],
            "explanationImage": {"key": KEY, "altText": ALT},
        }
        with mock.patch.object(process_import_inbox, "is_quality_item", return_value=True):
            candidate = process_import_inbox.build_candidate(Path("science.geometry.triangles.json"), raw, scope)
        self.assertIsNotNone(candidate)
        self.assertEqual(candidate["explanationImage"], image())

    def test_import_inbox_rejects_a_malformed_explanation_image(self) -> None:
        scope = ("science", "geometry", "triangles")
        raw = {
            "question": "To which triangles does the Pythagorean theorem apply?",
            "correctAnswer": "Right triangles",
            "incorrectAnswers": ["All triangles", "Only equilateral triangles", "Only isosceles triangles"],
            "explanation": "The equation relates the legs and hypotenuse of a right triangle.",
            "keywords": ["pythagorean"],
            "explanationImage": KEY,
        }
        with mock.patch.object(process_import_inbox, "is_quality_item", return_value=True):
            self.assertIsNone(process_import_inbox.build_candidate(Path("science.geometry.triangles.json"), raw, scope))

    def test_explanation_image_does_not_change_question_identity(self) -> None:
        plain = common.question_identity("Which triangles?", None)
        self.assertEqual(plain, common.question_identity("which  triangles?", None))


class ShippedDiagramsTests(unittest.TestCase):
    """The curated diagrams referenced by the real seed items exist and the real seed source validates."""

    def test_seed_source_with_diagrams_validates(self) -> None:
        items = common.load_source_items()
        with_diagrams = [item for item in items if item.explanation_image]
        self.assertGreaterEqual(len(with_diagrams), 3)
        self.assertEqual(common.validate_source(items, common.load_public_collections()), [])
        for item in with_diagrams:
            self.assertTrue(item.explanation_image["key"].startswith("curated:diagrams/"))
            self.assertTrue(common.curated_asset_path(item.explanation_image["key"]).is_file())


if __name__ == "__main__":
    unittest.main()
