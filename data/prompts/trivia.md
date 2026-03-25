Work in this repo.

Read:

docs/quizymode_taxonomy.yaml

Task: For the trivia category, create a folder:

data/bulk-seed/trivia

Then, in a cycle, create JSON seed files for each valid L1/L2 pair under trivia using this filename format:

trivia.<L1>.<L2>.json

Examples:

trivia.movies-tv.movies.json
trivia.music.artists.json
trivia.food-drink.cuisine.json
trivia.travel.landmarks.json

Rules:

Only use valid L1/L2 pairs from docs/quizymode_taxonomy.yaml under the trivia category.

Create the next 50 missing trivia seed files only in this run.

Do not generate files for generic paths such as general, mixed, basics, random, easy, hard, or similar catch-all buckets unless explicitly requested.

Avoid L1=general (skip the entire trivia -> general subtree).

Avoid L1=mixed (skip the entire trivia -> mixed subtree; it is for mixed sets and overlaps catch-all usage).

Avoid any L2 key that is a generic bucket or starts with general- (for example general-movies-tv, general-music, general-pop-culture, general-animals, general-food-drink, general-travel, general-famous-people, general-brands, general-internet, general-games, general-mixed).

Under famous-people, skip L2=mixed (mixed people bucket).

Prefer concrete topic paths (for example movies, tv, cuisine, landmarks) over broad overview buckets.

Create 10-15 items per file.

Prefer short questions over long questions.

Questions must be credible, factual, clearly answerable, and enjoyable to hear in a real trivia game.

Write for a player, not for a researcher. The question should sound natural when read aloud by a host.

Do not invent release dates, chart positions, award outcomes, box-office numbers, cast lists, lyrics, quotes, brand claims, or internet milestones.

If a fact may have changed, verify it first.

For unstable or fast-moving topics (memes, viral moments, current charts), anchor the question to a specific year, season, release, version, or primary source.

Use reusable keywords that can apply across multiple questions in the same set.

Avoid one-off novelty tags.

Distractors must be plausible but clearly incorrect.

Explanations should be short and specific.

Where possible, provide a source URL pointing to the exact documentation or authoritative page the question is based on.

Prefer primary or official sources when they exist: film or TV studio or network pages, music labels or artists' official sites, game publishers, company investor or press pages, government tourism or statistical sites for places, museum or institution pages, and recognized reference works with stable entries.

Use reputable reference publishers (for example major encyclopedias) only when an official source is not practical for a stable historical fact.

If you cannot verify a question from a credible source, do not include it.

Keep wording concise.

Avoid trick questions.

Avoid duplicates and near-duplicates.

Avoid negative phrasing unless necessary.

Use lowercase hyphenated keywords.

Reuse a small stable keyword set per file when reasonable.

If an item has no solid source URL, omit that item rather than guessing.

Player-facing wording rules:

The source field is metadata only. Never mention the source name, site, article, page, publisher, or organization in the question, answer choices, or explanation unless the source itself is the topic of the question.

Do not write stems like:

- "Britannica notes..."
- "NOAA says..."
- "On the 95th Oscars page..."
- "According to..."
- "The official site states..."

Instead, write the question as direct trivia:

- Bad: "Britannica notes modern birds are generally accepted as descendants of what larger group?"
- Good: "Modern birds are generally accepted as descendants of what larger group?"

- Bad: "On the 95th Oscars page, Brendan Fraser won Lead Actor for which film?"
- Good: "Brendan Fraser won Best Actor at the 95th Oscars for which film?"

Questions should feel like pub trivia or quiz-night material: clean setup, fast to parse, one clear fact to recall.

Prefer interesting hooks over dry citation language, but keep the fact stable and checkable.

Do not pad stems with phrases like "history records," "timeline lists," "the article states," or similar source-summary wording.

Question quality rules:

Do not create questions that depend on finishing a slogan, jingle, marketing line, meme punchline, song lyric, or famous quote fragment unless the exact wording itself is the learning objective.

For L2 buckets like quotes, lyrics, or slogans, prefer objective facts (release year, credited writer, work title, award category) over complete-the-line items.

Prefer questions that test one of:

1. a concrete, checkable fact
2. a definition, role, or category
3. a comparison grounded in cited information
4. structure or format (for example how an award is decided, what a credit means) when documented
5. a stable outcome tied to a specific year, title, release, or edition

Avoid questions where the correct answer is obvious because distractors are absurd.

Explanations must directly explain why the correct answer is correct.

Keep explanations player-facing too. Do not cite the source in the explanation unless that attribution is itself necessary for clarity.

Reject shallow gotcha trivia and vague wording.

If a question depends on unstable current status, rewrite it to a dated and verifiable form.

Each JSON file must contain a raw JSON array only. Each item must use this exact shape:

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

Execution loop:

Inspect taxonomy under trivia.

Before starting work, inspect data/bulk-seed/trivia to see which files already exist.

Pick the next missing valid L1/L2 pair in data/bulk-seed/trivia.

Skip any pair where L1 is general or mixed, or where L2 is a generic or general-* catch-all bucket (and skip famous-people / mixed).

Generate 10-15 verified items for that pair.

Save them to data/bulk-seed/trivia/trivia.<L1>.<L2>.json.

Repeat until 50 new trivia seed files have been created in this run, or until no eligible missing pairs remain.

Before writing each file:

Check whether the file already exists.

If it exists, do not overwrite it unless explicitly asked.

Context management rules:

Do not rely on chat memory for project state; use the filesystem as the source of truth.

After finishing a file, append a short handoff note to data/bulk-seed/trivia/_progress.md with:

file created
L1/L2 pair
item count
main source domains used
next suggested missing pair

If the conversation becomes too long, prior instructions become unclear, or reliable continuity is at risk, stop after the current file and tell the user to start a new chat.

In that case, provide a short restart prompt telling the next chat to read docs/quizymode_taxonomy.yaml and data/bulk-seed/trivia/_progress.md before continuing.

When finished with a cycle:

Print the file created.

Print any skipped pair and why.

Print the next recommended pair.

Continue trivia bulk-seed: read _progress.md and data/bulk-seed/trivia/*.json, then create the next 50 missing trivia.<L1>.<L2>.json files, update _progress.md after each, do not ask between files, stop only if context is tight or a fact can't be verified.

At the end give status:

how many trivia .json files were created in this run

how many trivia .json files exist now

how many eligible trivia L1/L2 pairs exist in the taxonomy

how many eligible trivia seed files remain to create

Use the taxonomy and filesystem to compute the final counts rather than guessing.
