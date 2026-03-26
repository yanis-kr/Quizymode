Read `data/prompts/_master_prompt.md` first. Apply it fully. The rules below are category-specific additions for `trivia`.

# Trivia Seed Prompt

Work in this repo.

Read:

- `docs/quizymode_taxonomy.yaml`
- `data/prompts/_master_prompt.md`

Task:

Create or continue seed files for the `trivia` category in:

- `data/bulk-seed/trivia`

Filename format:

- `trivia.<L1>.<L2>.json`

Examples:

- `trivia.movies-tv.movies.json`
- `trivia.music.artists.json`
- `trivia.food-drink.cuisine.json`
- `trivia.travel.landmarks.json`

## Taxonomy and file rules

- Only use valid `L1/L2` pairs from `trivia` in the taxonomy.
- Skip generic or mixed buckets unless explicitly requested.
- Skip `general` and `mixed` subtrees unless explicitly requested.
- Skip `general-*` catch-all buckets unless explicitly requested.
- Prefer concrete topics over broad overview buckets.
- Check whether the file already exists before writing it.
- Do not overwrite existing files unless explicitly asked.

## Audience

Write for curious players and quiz-night participants who want questions that are fun, clear, and satisfying to answer.

The set should sound natural aloud and reward recognizable knowledge with a bit of substance, not just obvious gimmes.

## Question style for trivia

Trivia should sound like real quiz-night material.

That means:

- natural when read aloud
- quick to understand
- interesting enough to be worth asking
- not built around awkward citation language

Prefer:

1. recognizable topics with one sharp fact
2. objective facts tied to titles, releases, awards, categories, formats, or identities
3. comparisons or classifications that feel satisfying to know
4. dated outcomes when the topic could change

Avoid:

- source-led stems
- dry article-summary wording
- obvious gimmes repeated across a set
- absurd distractors
- complete-the-line questions unless wording itself is the learning objective

For buckets like quotes, lyrics, or slogans, prefer surrounding facts over line completion.

## Distractor tone

Most distractors should stay fully straight-faced.

However, you may make about 25% of distractors in a file lightly witty if they still remain plausible on first read.

Good version of humor:

- mild wit in wording
- a distractor that is amusing only after you know it is wrong
- not a cartoon answer

Rules:

- the distractor must stay in the same domain as the correct answer
- it must not make the correct answer easier
- it must not feel like a joke option
- never let more than one distractor in the same item lean witty
- if the humor weakens fairness, remove it

## Sourcing for trivia

Source diversity is especially important in trivia.

Per file:

- minimum 2 source domains
- prefer 3+ domains

Do not build a whole file from only Britannica, only one government site, or any other single domain unless the user explicitly asks for that.

Mix sources intentionally, for example:

- official film, TV, music, game, brand, publisher, museum, tourism, or event pages
- institutional pages
- reputable reference publishers for stable background facts

Use primary or official sources when practical. Use reputable reference sources to complement them, not to replace all diversity.

## Writing rules

- Write for a player, not a researcher.
- Keep stems short and clean.
- Use simple language.
- Make the fact the star, not the citation.
- Keep explanations short and player-facing.

## Output shape

Use this exact item shape:

```json
[
  {
    "category": "trivia",
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
