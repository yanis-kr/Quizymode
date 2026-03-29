Read `data/prompts/_master_prompt.md` first. Apply it fully. The rules below are category-specific additions for `sports`.

# Sports Seed Prompt

Work in this repo.

Read:

- `docs/quizymode_taxonomy.yaml`
- `data/prompts/_master_prompt.md`

Task:

Create or continue seed files for the `sports` category in:

- `data/seed-source/items/sports`

Filename format:

- `sports.<L1>.<L2>.json`

Examples:

- `sports.tennis.grand-slams.json`
- `sports.soccer.world-cup.json`
- `sports.basketball.nba.json`

## Taxonomy and file rules

- Only use valid `L1/L2` pairs from `sports` in the taxonomy.
- Skip generic or mixed buckets unless explicitly requested.
- Skip `general` subtrees and `general-*` catch-all buckets unless explicitly requested.
- Prefer concrete leagues, tournaments, positions, rules, or event types over broad overview buckets.
- Check whether the file already exists before writing it.
- Do not overwrite existing files unless explicitly asked.

## Question style for sports

## Audience

Write for a sports fan who enjoys fair, smart, well-aimed questions about competition, rules, structure, and memorable documented moments.

The tone should feel informed and energetic without becoming fan-fiction, hype copy, or insider-only jargon.

Sports questions should feel like good broadcast or quiz-night material:

- quick to parse
- factually solid
- not gimmicky

Prefer:

1. rules and scoring
2. roles and positions
3. tournament or league structure
4. dated outcomes tied to a season or event
5. records or achievements that are stable and well documented

Avoid:

- unstable current rankings unless dated and verified
- disputed records without careful sourcing
- empty fan-service questions with no learning value
- commentary catchphrase recall

## Sourcing for sports

Prefer official governing bodies, leagues, tournaments, and athlete or team records when practical.

Examples:

- FIFA, UEFA, IFAB
- NBA, WNBA, NFL, MLB, NHL, NCAA
- ATP, WTA, ITF, PGA, USGA, The R&A
- IOC and Olympic official sites

Use reputable reference sources only when official sources are not practical for a stable historical fact.

Per file:

- minimum 2 source domains
- prefer 3+ domains

Do not source an entire set from one encyclopedia or one league site if good complementary sources exist.

## Writing rules

- Keep stems short.
- Use simple sports language.
- Anchor unstable facts to exact seasons, years, tournaments, or editions.
- Make explanations directly confirm the result, rule, or structure being tested.

## Output shape

Use this exact item shape:

```json
[
  {
    "category": "sports",
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
