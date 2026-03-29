# -*- coding: utf-8 -*-
"""Emit remaining trivia bulk-seed JSON files (44 pairs) with source-backed items."""
from __future__ import annotations

import json
from pathlib import Path

from seed_progress_paths import category_progress_file, ensure_category_progress_dir

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "data" / "bulk-seed" / "trivia"
PROGRESS = category_progress_file("trivia", "_progress.md")


def mk(
    l1: str,
    l2: str,
    question: str,
    correct: str,
    wrong: list[str],
    explanation: str,
    keywords: list[str],
    source: str,
) -> dict:
    return {
        "category": "trivia",
        "navigationKeyword1": l1,
        "navigationKeyword2": l2,
        "question": question,
        "correctAnswer": correct,
        "incorrectAnswers": wrong,
        "explanation": explanation,
        "keywords": keywords,
        "source": source,
    }


def write_pair(l1: str, l2: str, items: list[dict]) -> None:
    path = OUT / f"trivia.{l1}.{l2}.json"
    path.write_text(json.dumps(items, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def brands_companies() -> list[dict]:
    src_ms = "https://news.microsoft.com/source/features/corporate-timeline/"
    src_apple = "https://www.apple.com/newsroom/2016/12/apple-celebrates-40-years-of-innovation/"
    # Microsoft timeline: founded 1975; Apple newsroom 40 years references April 1, 1976 founding
    return [
        mk(
            "brands",
            "companies",
            "Microsoft’s corporate timeline states the company was founded in which year?",
            "1975",
            ["1976", "1981", "1984"],
            "Microsoft’s official corporate timeline lists 1975 as the founding year.",
            ["tech", "founding-dates"],
            src_ms,
        ),
        mk(
            "brands",
            "companies",
            "Apple’s 2016 newsroom feature marking a major anniversary cites which date as Apple’s founding?",
            "April 1, 1976",
            ["April 1, 1975", "June 6, 1984", "January 9, 2007"],
            "Apple’s newsroom article on its anniversary references April 1, 1976 as the founding date.",
            ["tech", "founding-dates"],
            src_apple,
        ),
        mk(
            "brands",
            "companies",
            "IBM’s history overview states the Computing-Tabulating-Recording Company was incorporated in which state in 1911?",
            "New York",
            ["California", "Texas", "New Jersey"],
            "IBM traces its roots to CTR’s 1911 incorporation in New York.",
            ["enterprise", "history"],
            "https://www.ibm.com/ibm/history/ibm100/us/en/icons/ctr/",
        ),
        mk(
            "brands",
            "companies",
            "Coca-Cola’s company history page dates the first serving of Coca‑Cola at Jacobs’ Pharmacy to which year?",
            "1886",
            ["1905", "1923", "1899"],
            "Coca-Cola’s official history places the first serving in Atlanta in 1886.",
            ["beverages", "history"],
            "https://www.coca-colacompany.com/about-us/history",
        ),
        mk(
            "brands",
            "companies",
            "Ford’s heritage article dates the founding of Ford Motor Company to which year?",
            "1903",
            ["1913", "1896", "1925"],
            "Ford’s official heritage materials cite 1903 for incorporation of Ford Motor Company.",
            ["automotive", "history"],
            "https://corporate.ford.com/articles/history/milestones.html",
        ),
        mk(
            "brands",
            "companies",
            "Samsung’s global about page states Samsung was founded in which year?",
            "1938",
            ["1969", "1975", "1988"],
            "Samsung’s corporate overview lists 1938 as the founding year.",
            ["tech", "history"],
            "https://www.samsung.com/global/about-us/company-overview/",
        ),
        mk(
            "brands",
            "companies",
            "Toyota’s global company overview states the company was founded in which year?",
            "1937",
            ["1950", "1926", "1948"],
            "Toyota’s corporate overview cites 1937 as the founding year.",
            ["automotive", "history"],
            "https://global.toyota/en/company/profile/overview/",
        ),
        mk(
            "brands",
            "companies",
            "Nike’s company overview identifies Nike, Inc. as originally founded under which earlier name in 1964?",
            "Blue Ribbon Sports",
            ["Athletic Footwear Group", "Oregon Running Co.", "Swoosh Sports"],
            "Nike’s corporate profile notes the business began as Blue Ribbon Sports in 1964.",
            ["apparel", "history"],
            "https://about.nike.com/en/company",
        ),
        mk(
            "brands",
            "companies",
            "According to Adobe’s company timeline, Adobe was founded in which year?",
            "1982",
            ["1993", "1976", "1989"],
            "Adobe’s official timeline lists 1982 as the founding year.",
            ["software", "history"],
            "https://www.adobe.com/about-adobe.html",
        ),
        mk(
            "brands",
            "companies",
            "Intel’s company timeline places Intel’s founding in which year?",
            "1968",
            ["1971", "1981", "1957"],
            "Intel’s official history cites 1968 as the founding year.",
            ["semiconductors", "history"],
            "https://www.intel.com/content/www/us/en/history/history-of-intel.html",
        ),
    ]


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    ensure_category_progress_dir("trivia")
    write_pair("brands", "companies", brands_companies())
    # Additional pairs appended in follow-up patches to this script.


if __name__ == "__main__":
    main()
