Read `data/prompts/_master_prompt.md` first. Apply it fully. The rules below are category-specific additions for `humanities`.

# Humanities Seed Prompt

Work in this repo.

Read:

- `docs/quizymode_taxonomy.yaml`
- `data/prompts/_master_prompt.md`

Task:

Create or continue seed files for the `humanities` category in:

- `data/seed-source/items/humanities`

Filename format:

- `humanities.<L1>.<L2>.json`

Examples:

- `humanities.literature.authors.json`
- `humanities.philosophy.ethics.json`
- `humanities.visual-art.artists.json`

## Taxonomy and file rules

- Only use valid `L1/L2` pairs from `humanities` in the taxonomy.
- Skip generic or mixed buckets unless explicitly requested.
- Skip `general` and `mixed` subtrees and `general-*` catch-all buckets unless explicitly requested.
- Prefer concrete topics, works, movements, or concepts over catch-all buckets.
- Check whether the file already exists before writing it.
- Do not overwrite existing files unless explicitly asked.

## Audience

Write for a curious reader or student who enjoys ideas, works, movements, and cultural context.

The questions should feel thoughtful and accessible, not academic for the sake of sounding academic.

## Question style for humanities

Prefer:

1. meaning and significance
2. authors, works, ideas, or movements in context
3. core terms with real interpretive value
4. comparisons and categories
5. stable facts tied to works, eras, schools, or traditions

Avoid:

- vague theory-speak
- quote-fragment recall unless wording itself is the topic
- listy name drills with no meaning
- pretentious phrasing

## Sourcing for humanities

Use a mix of:

- museums
- libraries
- educational institutions
- trusted cultural organizations
- reputable reference works for stable background facts

Per file:

- minimum 2 source domains
- prefer 3+ domains

## Writing rules

- Use plain language.
- Keep questions compact.
- Let the explanation briefly show why the answer matters.
- Favor understanding over ornament.

## Output shape

Use this exact item shape:

```json
[
  {
    "category": "humanities",
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

