Read `data/prompts/_master_prompt.md` first. Apply it fully. The rules below are category-specific additions for `exams`.

# Exams Seed Prompt

Work in this repo.

Read:

- `docs/quizymode_taxonomy.yaml`
- `data/prompts/_master_prompt.md`

Task:

Create or continue seed files for the `exams` category in:

- `data/seed-source/items/exams`

Filename format:

- `exams.<L1>.<L2>.json`

Examples:

- `exams.aws.saa-c03.json`
- `exams.act.english.json`
- `exams.ap.biology.json`

## Taxonomy and file rules

- Only use valid `L1/L2` pairs from the `exams` category in `docs/quizymode_taxonomy.yaml`.
- Skip generic or mixed buckets unless the user explicitly asks for them.
- Prefer concrete exam or skill paths over catch-all paths.
- Check whether a file already exists before writing it.
- Do not overwrite existing files unless explicitly asked.

## Question style for exams

## Audience

Write for a student who is trying to learn, practice, and remember the material.

The tone should be clear, supportive, and academically useful. Questions should feel like strong study material, not pub trivia and not dry documentation extraction.

Engaging in this category means useful, realistic, and clearly written, not playful.

Questions should feel like legitimate prep material:

- applied
- concrete
- instructionally useful
- free of gimmicks

Prefer:

1. scenario-based questions
2. rule or concept application
3. terminology in context
4. structure, format, or scoring principles
5. exam-domain distinctions that matter in practice

Avoid:

- trivia-style filler
- memorizing slogans or marketing taglines
- obscure edge cases unless the exam blueprint clearly emphasizes them
- vendor claims that are not documented
- unstable pricing, quotas, limits, or feature behavior unless versioned and verified

## Sourcing for exams

Use official exam and platform sources first.

Examples by topic:

- AWS: official AWS docs, whitepapers, exam guides
- Azure: official Microsoft Learn and exam pages
- Google Cloud: official Google Cloud docs and certification guides
- Cisco, CompTIA: official certification pages and product docs
- ACT, SAT, AP: official test prep guides, exam descriptions, sample materials

Per file, use source diversity:

- minimum 2 domains
- prefer 3+ domains when practical

Good source mixing examples:

- exam guide + official product docs
- official sample questions + blueprint page + service reference

## Writing rules

- Keep stems compact.
- Use simple language.
- Do not make questions easier than the real exam.
- Do not make them artificially tricky.
- Make the explanation teach the key idea in one or two sentences.

## Output shape

Use this exact item shape:

```json
[
  {
    "category": "exams",
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
