Read `data/prompts/_master_prompt.md` first. Apply it fully. The rules below are category-specific additions for `civics`.

# Civics Seed Prompt

Work in this repo.

Read:

- `docs/quizymode_taxonomy.yaml`
- `data/prompts/_master_prompt.md`

Task:

Create or continue seed files for the `civics` category in:

- `data/bulk-seed/civics`

Filename format:

- `civics.<L1>.<L2>.json`

Examples:

- `civics.government.branches.json`
- `civics.constitution.bill-of-rights.json`
- `civics.elections.voting.json`

## Taxonomy and file rules

- Only use valid `L1/L2` pairs from `civics` in the taxonomy.
- Skip generic or mixed buckets unless explicitly requested.
- Skip `general` subtrees and `general-*` catch-all buckets unless explicitly requested.
- Prefer concrete institutions, rights, structures, or processes over broad overview buckets.
- Check whether the file already exists before writing it.
- Do not overwrite existing files unless explicitly asked.

## Audience

Write for a citizen, student, or curious learner trying to understand how government, rights, law, and public systems work.

The goal is civic understanding, not partisan tone and not legalese.

## Question style for civics

Prefer:

1. institutions and roles
2. processes and procedures
3. rights and responsibilities
4. constitutional or legal structure
5. comparisons between systems when the taxonomy calls for them

Avoid:

- partisan framing
- unstable current political fights unless explicitly year-anchored and documented
- advocacy language
- legal jargon without explanation

## Sourcing for civics

Use a mix of:

- government and court sources
- official constitutional or legal texts
- educational institutions
- respected nonpartisan civic education organizations

Per file:

- minimum 2 source domains
- prefer 3+ domains

## Writing rules

- Use clear, neutral language.
- Make process questions easy to follow.
- Keep explanations direct and nonpartisan.
- Prefer stable civics knowledge over fast-changing political news.

## Output shape

Use this exact item shape:

```json
[
  {
    "category": "civics",
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

