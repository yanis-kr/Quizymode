from __future__ import annotations

import re


_SPECIAL_ENGLISH_KEYWORDS = {
    "a half": "half",
    "a quarter": "quarter",
    "I": "i",
    "you (plural)": "you-plural",
}


CORE_STARTER_KEYWORDS = {
    "spanish": [
        ["hello"],
        ["thank-you"],
        ["please"],
        ["my-name-is"],
        ["count-1-2-3"],
        ["goodbye"],
        ["good-morning"],
        ["excuse-me", "sorry"],
        ["i-dont-understand"],
        ["water"],
    ],
    "french": [
        ["hello"],
        ["thank-you"],
        ["please"],
        ["my-name-is"],
        ["count-1-2-3"],
        ["goodbye"],
        ["excuse-me", "sorry"],
        ["yes", "no"],
        ["water"],
    ],
    "german": [
        ["hello"],
        ["thank-you"],
        ["please"],
        ["my-name-is"],
        ["count-1-2-3"],
        ["goodbye"],
        ["excuse-me", "sorry"],
        ["i-dont-understand"],
        ["water"],
    ],
    "japanese": [
        ["hello"],
        ["thank-you"],
        ["water"],
        ["yes"],
        ["no"],
        ["polite-statement"],
        ["excuse-me", "sorry"],
        ["my-name-is"],
        ["goodbye"],
        ["count-1-2-3"],
    ],
    "russian": [
        ["hello"],
        ["thank-you"],
        ["water"],
        ["yes"],
        ["no"],
        ["cases"],
        ["please"],
        ["my-name-is"],
        ["goodbye"],
        ["excuse-me", "sorry"],
    ],
    "latvian": [
        ["hello"],
        ["thank-you"],
        ["please"],
        ["yes"],
        ["goodbye"],
        ["my-name-is"],
        ["excuse-me", "sorry"],
        ["count-1-2-3"],
        ["water"],
        ["good-morning"],
    ],
}


def core_keyword_for_english(english: str) -> str:
    if english in _SPECIAL_ENGLISH_KEYWORDS:
        return _SPECIAL_ENGLISH_KEYWORDS[english]

    normalized = english.lower().replace("&", " and ")
    normalized = re.sub(r"['’]", "", normalized)
    normalized = re.sub(r"[^a-z0-9]+", "-", normalized)
    normalized = normalized.strip("-")
    if not normalized:
        raise ValueError(f"Cannot derive keyword for English gloss '{english}'")
    return normalized
