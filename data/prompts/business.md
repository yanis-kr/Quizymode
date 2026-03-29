Read `data/prompts/_master_prompt.md` first. Apply it fully. The rules below are category-specific additions for `business`.

# Business Seed Prompt

Work in this repo.

Read:

- `docs/quizymode_taxonomy.yaml`
- `data/prompts/_master_prompt.md`

Task:

Create or continue seed files for the `business` category in:

- `data/seed-source/items/business`

Filename format:

- `business.<L1>.<L2>.json`

Examples:

- `business.finance.investing.json`
- `business.marketing.branding.json`
- `business.project-mgmt.agile.json`

## Taxonomy and file rules

- Only use valid `L1/L2` pairs from `business` in the taxonomy.
- Skip generic or mixed buckets unless explicitly requested.
- Skip `general` subtrees and `general-*` catch-all buckets unless explicitly requested.
- Prefer concrete functions, frameworks, and skills over catch-all buckets.
- Check whether the file already exists before writing it.
- Do not overwrite existing files unless explicitly asked.

## Audience

Write for a learner, operator, or early-career professional who wants practical business understanding.

The questions should feel useful in real work or study contexts, not like empty corporate jargon drills.

## Question style for business

Prefer:

1. real concepts with practical meaning
2. roles of common frameworks or metrics
3. comparisons and tradeoffs
4. process understanding
5. dated, stable business facts when using real companies or markets

Avoid:

- hype language
- motivational slogans
- unstable market claims unless dated and verified
- shallow definition dumps when a better applied angle exists

## Sourcing for business

Use a mix of:

- official company investor or corporate pages when company facts are used
- regulatory or governmental sources when relevant
- respected educational, financial, or institutional sources
- reputable reference sources for stable background facts

Per file:

- minimum 2 source domains
- prefer 3+ domains

## Writing rules

- Keep wording simple.
- Prefer concrete business language over MBA buzzwords.
- Make explanations directly useful.
- Favor stable concepts over fleeting trends.

## Output shape

Use this exact item shape:

```json
[
  {
    "category": "business",
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

