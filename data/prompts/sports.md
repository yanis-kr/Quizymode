Work in this repo.

Read:

docs/quizymode_taxonomy.yaml

Task: For category Sports, create a folder:

data/bulk-seed/Sports

Then, in a cycle, create JSON seed files for each valid L1/L2 pair under Sports using this filename format:

Sports.<L1>.<L2>.json

Examples:

Sports.tennis.grand-slams.json
Sports.soccer.world-cup.json
Sports.basketball.nba.json
Sports.olympics.hosts.json

Rules:

Only use valid L1/L2 pairs from docs/quizymode_taxonomy.yaml under the Sports category.
Create the next 50 missing Sports files only in this run.
Do not generate files for generic paths such as general, mixed, basics, or similar catch-all buckets unless explicitly requested.
Avoid L1=general (skip the entire Sports -> general subtree).
Avoid any L2 key that is a generic bucket or starts with general- (for example general-tennis, general-soccer, general-basketball, general-football, general-baseball, general-hockey, general-golf, general-combat, general-olympics, general-champions, general-rules).
Prefer concrete sport/topic paths over broad overview buckets.
Create 10–15 items per file.
Prefer short questions over long questions.
Questions must be credible, factual, and clearly answerable.
Do not invent sports facts, records, rankings, titles, dates, host sites, medal counts, league structures, or rule details.
If a fact may have changed, verify it first.
For unstable facts, anchor the question to an exact season, year, tournament, or edition.
Use reusable keywords that can apply across multiple questions in the same set.
Avoid one-off novelty tags.

Distractors must be plausible but clearly incorrect.
Explanations should be short and specific.
Where possible, provide a source URL pointing to the exact documentation or authoritative page the question is based on.
Prefer official governing bodies, leagues, and tournament organizers:
FIFA, UEFA, IFAB, NBA, WNBA, NFL, NCAA, MLB, NHL, ATP, WTA, ITF, PGA, USGA, The R&A, IOC, Olympic official sites, UFC, and official boxing sanctioning bodies or event records.
Use reputable reference publishers only when an official source is not practical for a stable historical fact.
If you cannot verify a question from a credible source, do not include it.
Keep wording concise.
Avoid trick questions.
Avoid duplicates and near-duplicates.
Avoid negative phrasing unless necessary.
Use lowercase hyphenated keywords.
Reuse a small stable keyword set per file when reasonable.
If an item has no solid source URL, omit that item rather than guessing.

Question quality rules:

Do not create trivia questions that depend on finishing a slogan, chant, marketing line, commentary catchphrase, or famous wording fragment unless the exact wording itself is the learning objective.
Prefer questions that test one of:
1. a concrete fact
2. a rule or scoring principle
3. a role or position
4. a comparison
5. a tournament structure or format
6. a meaningful sports outcome tied to a specific season, year, or event
Avoid questions where the correct answer is obvious because distractors are absurd.
Explanations must directly explain why the correct answer is correct.
Reject shallow gotcha trivia and vague wording.
If a question depends on unstable “current” status, rewrite it to a dated and verifiable form.

Each JSON file must contain a raw JSON array only. Each item must use this exact shape:

[
  {
    "category": "Sports",
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

Inspect taxonomy under Sports.
Before starting work, inspect data/bulk-seed/Sports to see which files already exist.
Pick the next missing valid L1/L2 pair in data/bulk-seed/Sports.
Skip any pair where L1 is general or where L2 is a generic or general-* catch-all bucket.
Generate 10–15 verified items for that pair.
Save them to data/bulk-seed/Sports/Sports.<L1>.<L2>.json.
Repeat until 50 new Sports files have been created in this run, or until no eligible missing pairs remain.
Before writing each file:
Check whether the file already exists.
If it exists, do not overwrite it unless explicitly asked.

Context management rules:

Do not rely on chat memory for project state; use the filesystem as the source of truth.
After finishing a file, append a short handoff note to data/bulk-seed/Sports/_progress.md with:
file created
L1/L2 pair
item count
main source domains used
next suggested missing pair
If the conversation becomes too long, prior instructions become unclear, or reliable continuity is at risk, stop after the current file and tell the user to start a new chat.
In that case, provide a short restart prompt telling the next chat to read docs/quizymode_taxonomy.yaml and data/bulk-seed/Sports/_progress.md before continuing.

When finished with a cycle:

Print the file created.
Print any skipped pair and why.
Print the next recommended pair.

Continue Sports bulk-seed: read _progress.md and data/bulk-seed/Sports/*.json, then create the next 50 missing Sports.<L1>.<L2>.json files, update _progress.md after each, do not ask between files, stop only if context is tight or a fact can’t be verified.

At the end give status:
how many Sports .json files were created in this run
how many Sports .json files exist now
how many eligible Sports L1/L2 pairs exist in the taxonomy
how many eligible Sports files remain to create

Use the taxonomy and filesystem to compute the final counts rather than guessing.
