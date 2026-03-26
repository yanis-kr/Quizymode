Read this file first. Then read the category-specific prompt in `data/prompts/`.

# Seed Question Master Prompt

Work in this repo. Use the filesystem and taxonomy as the source of truth.

Your job is to create or revise seed question files that are:

- meaningful
- engaging
- factually correct
- short enough to read quickly
- written in simple, natural language
- easy to understand on first read

## Audience and intent

Write for the intended user of the category, not for an editor, researcher, or citation bot.

Use the category prompt to calibrate:

- what the audience already roughly knows
- what they would find interesting
- what kind of explanation would feel useful

Persona should improve relevance and clarity, not add fluff.

Do not roleplay. Do not become theatrical. Keep the writing natural, direct, and rigorous.

## Core quality standard

Write questions for real users, not for a database and not for a citation exercise.

Every question should feel worth asking. Favor facts, comparisons, causes, structures, roles, or outcomes that a curious user would actually enjoy learning or recalling.

Target difficulty:

- mostly easy-medium to medium
- not so easy that the answer is obvious instantly
- not so obscure that only a specialist would know it

Use one clear idea per question. Keep stems compact and easy to parse aloud.

## Language rules

- Use plain English.
- Prefer short sentences.
- Avoid jargon unless the category requires it.
- Avoid stacked clauses and overexplaining inside the stem.
- Avoid awkward source-summary phrasing.
- Avoid legalistic, academic, or article-like wording.

Bad stem style:

- "According to Britannica..."
- "The official site states..."
- "History records..."
- "The article notes..."

The `source` field is metadata only. Do not mention source names, sites, publishers, or organizations in the question or explanation unless the source itself is the topic.

## Meaningful question design

Prefer questions that test one of these:

1. a concrete fact worth knowing
2. a cause, consequence, or significance
3. a role, definition, or category
4. a comparison grounded in real information
5. a rule, format, or structure
6. a dated, stable outcome tied to a specific year, title, event, release, or edition

Avoid:

- shallow gotcha trivia
- vague wording
- trick questions unless explicitly requested
- finish-the-quote or finish-the-lyric questions unless exact wording is the learning objective
- questions whose distractors are absurd
- questions that only test recall of a slogan fragment or catchphrase

## Difficulty and engagement rules

Questions should be interesting before they are clever.

Good patterns:

- a recognizable anchor plus one specific fact
- a familiar topic asked in a slightly smarter way
- a concrete comparison
- a fact with real-world meaning

Weak patterns:

- bare dictionary-definition questions when a better angle exists
- repetitive "What is..." questions across the same set
- items that are obvious from common sense alone
- items that are technically true but not fun or useful

Within a file, vary the shape of questions so the set does not feel templated.

## Answers and distractors

Distractors must be:

- plausible
- same-domain
- clearly incorrect
- similar in type to the correct answer

Do not use joke distractors. Do not make the correct answer stand out by length, tone, or specificity.

## Explanations

Explanations must directly explain why the correct answer is right.

Keep explanations short, specific, and user-facing.

Do not pad explanations with unrelated facts. Do not repeat the stem without adding value.

## Source policy

Every included question must be verified from a credible source.

Prefer primary or official sources when practical. Use reputable secondary sources when they are better for stable background facts.

If a fact may have changed, verify it before using it.

If a claim cannot be verified confidently, omit it.

## Source diversity rule for every L2 file

Each L2 seed file must draw from multiple source domains.

Required:

- minimum 2 distinct source domains in every file

Preferred:

- 3 or more distinct source domains per file

Additional rule:

- do not let one single domain supply most of a file if credible alternatives exist
- as a practical default, keep any one domain to at most about half the items in a file

Use source diversity intentionally. Mix source types when possible, for example:

- official or primary sources
- reputable institutional or archival sources
- strong secondary reference sources

When a narrow topic has few credible sources, still try to use at least 2 distinct domains.

## Stability rules

If a topic is unstable, fast-moving, or likely to change, anchor the question to:

- a specific year
- a specific season
- a specific edition
- a specific release
- a specific version
- a clearly dated event

Never rely on undated "current" status unless the user explicitly asks for current-only content and you verify it during the run.

## JSON output rules

Each JSON file must contain a raw JSON array only.

Each item must use this shape unless the category prompt says otherwise:

```json
[
  {
    "category": "<category>",
    "navigationKeyword1": "<L1>",
    "navigationKeyword2": "<L2>",
    "question": "Short question?",
    "correctAnswer": "Correct answer",
    "incorrectAnswers": ["Wrong 1", "Wrong 2", "Wrong 3"],
    "explanation": "Short explanation.",
    "keywords": ["reusable-tag-1", "reusable-tag-2"],
    "source": "https://..."
  }
]
```

## Working rules

- Read `docs/quizymode_taxonomy.yaml`.
- Inspect the target seed folder before creating files.
- Use the filesystem as the source of truth for what already exists.
- Do not overwrite an existing file unless explicitly asked.
- Avoid duplicates and near-duplicates.
- Reuse a small stable keyword set per file when reasonable.
- Use lowercase hyphenated keywords unless the category strongly requires another convention.

## Required review and regeneration pass

After drafting a file, stop and critically review the generated questions as an editor.

Do not assume the first draft is good enough.

Check each item for:

1. clarity on first read
2. factual confidence
3. whether the question is actually worth asking
4. whether the answer is too obvious, too obscure, or awkwardly phrased
5. whether distractors are plausible and same-domain
6. whether the set feels repetitive or templated

If an item is weak, fix it before writing the file.

Preferred order:

1. revise the weak item to meet the quality bar
2. if revision still leaves it flat, low-signal, repetitive, or low-confidence, regenerate and replace it
3. if you cannot get the item to quality, remove it and write a stronger replacement

Never keep a low-quality question just to preserve count or finish faster.

## Final self-check before writing a file

Confirm all of the following:

1. the questions are easy to understand on first read
2. the set is not dominated by obvious gimmes
3. the wording does not mention source names in player-facing text
4. every item is factually checkable
5. distractors are plausible
6. explanations directly explain the answer
7. the file uses at least 2 source domains, preferably 3+
8. no single source domain dominates the file without good reason
9. you critically reviewed the full set after drafting it
10. any low-quality, repetitive, obvious, awkward, or low-confidence item was revised or regenerated before acceptance
