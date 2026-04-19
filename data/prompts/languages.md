Read `data/prompts/_master_prompt.md` first. Apply it fully. The rules below are category-specific additions for `languages`.

# Languages Seed Prompt

Work in this repo.

Read:

- `docs/quizymode_taxonomy.yaml`
- `data/prompts/_master_prompt.md`

Task:

Create or continue seed files for the `languages` category in:

- `data/seed-source/items/languages`

Filename format:

- `languages.<L1>.<L2>.json`

Examples:

- `languages.english.grammar.json`
- `languages.spanish.verbs.json`
- `languages.travel.restaurant.json`

## Taxonomy and file rules

- Only use valid `L1/L2` pairs from `languages` in the taxonomy.
- Skip generic or mixed buckets unless explicitly requested.
- Skip `general` and `mixed` subtrees and `general-*` catch-all buckets unless explicitly requested.
- Prefer concrete language skills or contexts over broad catch-all sets.
- Check whether the file already exists before writing it.
- Do not overwrite existing files unless explicitly asked.

## Audience

Write for a beginner who is trying to understand, remember, and use a new language correctly.

Assume the learner may understand English but may not be a native English speaker.

Use very plain English in stems, instructions, and explanations so the material stays accessible.

The set should feel helpful and teachable, not like grammar pedantry for its own sake.

## Question style for languages

Prefer:

1. usage in context
2. grammar with clear examples
3. vocabulary that feels useful
4. meaning, tone, or form distinctions
5. practical travel or conversation scenarios when the taxonomy calls for them

Avoid:

- obscure exceptions unless the subtopic specifically requires them
- unnatural textbook phrasing
- translation traps with ambiguous wording
- hyper-literal distractors that make the answer too obvious

## Grammar item rule

For `grammar` seed files, make the question practical first and the rule second.

Prefer:

1. short sentence completion
2. choose-the-best-sentence items
3. a realistic mini context such as ordering food, introducing yourself, asking for directions, or describing something simple
4. side-by-side choices that show a real learner confusion in a concrete sentence

Do not default to rule-only stems such as:

- "Which form is usually used...?"
- "What is the rule for...?"
- "How is X commonly formed?"

unless the rule cannot be taught naturally through an example.

If a grammar point can be shown with a short example sentence, do that instead.

Good:

- "You want to say `I am studying now` in Spanish. Which pattern fits?"
- "Which sentence correctly says `I do not speak French`?"
- "You want to say `a red car` in Italian. Where does the adjective usually go?"

Weak:

- "How is the present progressive formed in Spanish?"
- "What is the rule for adjective position in Italian?"
- "Which tense is usually used for...?" when no example is given

## Distractor tone

Most distractors should stay fully straight-faced.

However, you may make about 25% of distractors in a file lightly witty if they still remain plausible on first read.

Good version of humor:

- mild wit in wording
- a distractor that is amusing only after you know it is wrong
- not a cartoon answer

Rules:

- the distractor must stay close enough to the learning target to remain educational
- it must not make the correct answer easier
- it must not become a joke option
- never let more than one distractor in the same item lean witty
- if the humor creates confusion for a beginner, remove it

## Beginner-first foreign language rule

For non-English target languages, optimize for beginner usefulness first.

Prefer:

1. high-frequency words
2. everyday verbs
3. common nouns
4. simple adjectives
5. practical travel and conversation language
6. beginner grammar patterns that unlock real usage

Avoid spending early coverage on rare literary words, niche exceptions, or advanced register unless the specific taxonomy bucket requires it.

## Core dictionary coverage

Each foreign language should build toward a reusable core dictionary of roughly 100 to 200 high-utility beginner words across its seed files.

Examples of good core-dictionary coverage:

- greetings
- numbers
- days and time words
- family words
- food and drink
- common travel words
- basic verbs
- common adjectives
- everyday objects

If the taxonomy provides a specific vocabulary or beginner bucket, use it.

If the taxonomy does not provide a dedicated core-dictionary bucket, distribute core vocabulary across the valid beginner-friendly buckets for that language.

## Cross-language keyword rule

For word-level or phrase-level foreign language items, include the English translation as a keyword so the same concept can be found across multiple languages.

Examples:

- a Spanish item for `agua` should include the keyword `water`
- a French item for `bonjour` should include the keyword `hello`

Keyword rules for these translation keywords:

- use plain lowercase English
- use hyphens for multiword concepts, for example `good-morning`
- use the underlying English meaning, not the foreign-language form
- keep the keyword stable across languages so the same concept is searchable in multiple language sets

You may still include 1 or 2 stable topical keywords for the file, but the English translation keyword is required for vocabulary-style items.

## Sourcing for languages

Use a mix of:

- reputable dictionaries
- educational institutions
- recognized language-learning references
- grammar references and style guides when relevant

Per file:

- minimum 2 source domains
- prefer 3+ domains

## Writing rules

- Use very clear wording.
- Avoid ambiguous stems.
- If an item depends on a sentence example, keep the sentence short and natural.
- Make the explanation teach the key language point directly.
- Keep beginner items especially short and readable.
- Prefer one clean learning point per item.
- For grammar items, explain the rule in plain English and then tie it back to the exact example.
- Keep grammar explanations concise: usually 1 or 2 short sentences.
- Do not turn the explanation into a mini textbook paragraph.

## Output shape

Use this exact item shape:

```json
[
  {
    "category": "languages",
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
