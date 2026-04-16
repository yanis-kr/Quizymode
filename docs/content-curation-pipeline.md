# Content Curation Pipeline

This document describes the AI-assisted item generation, curation, and promotion flow for Quizymode. It covers what users experience, what admins do, and how the system works end-to-end.

---

## User Tiers

| Capability | Regular | Premium |
|---|---|---|
| Request new public items | Yes | Yes |
| Daily item requests | 3/day | 10/day |
| Candidates generated per request | up to 5 | up to 15 |
| Upload study guide | No | Yes |
| Study guide imports per day | — | 3/day |
| Private item workspace | No | Yes |
| Nominate private items for public | No | Yes |

Premium is admin-granted. No paywall yet. Regular users are the default on signup.

---

## What Regular Users See

### Requesting New Items

Regular users access this via **Items → Request New Items**.

They fill out a simple form:

- **Category** — required, selected from the existing public taxonomy (e.g. `languages`, `exams`, `sports`)
- **Primary topic (L1)** — required (e.g. `Spanish`, `AWS`)
- **Subtopic (L2)** — optional. If omitted, the system resolves to an existing L2. If no confident match exists, the user is shown 2–5 suggestions and asked to pick one before the request proceeds.
- **Extra keywords** — optional comma-separated hints (e.g. `greetings, formal, travel`)
- **Desired count** — slider, 1–5 (capped for regular users)

On submit:

1. The API validates the request against the existing taxonomy. Unknown categories or invalid L1/L2 paths return an inline error.
2. The request is queued. The user sees a status banner: **"Generating items… this usually takes under a minute."**
3. The UI polls the request status every 5 seconds.
4. When processing finishes, the banner updates: **"5 items are ready — review them below."**
5. The user sees a preview list of generated items with question, answer, and an optional explanation. Each item shows a **quality indicator** (Verified / Needs Review) based on pipeline output.
6. Items marked Verified are submitted to the admin curation queue automatically. Items marked Needs Review are also submitted, but flagged for closer admin attention.
7. The user cannot directly publish items. All generated items wait for admin batch approval before becoming public.

Once admin approves the batch, items appear in the public taxonomy. The user receives no direct notification in v1 — they can check the item count in the relevant category.

### What Regular Users Cannot Do

- Upload a study guide
- Create private items
- See other users' requests or candidates
- Bypass the admin review step

---

## What Premium Users See

Premium users have everything regular users have, plus:

### Study Guide Import

Available via **Items → Import Study Guide**.

1. User selects the target category, L1, and L2.
2. User uploads a text or PDF file (up to the configured size limit).
3. The UI calls the API, which returns a **presigned S3 URL**. The file uploads directly from the browser to S3 — no file content passes through the API server.
4. The API acknowledges the upload and enqueues the processing job.
5. Status banner: **"Analysing your guide… extracting key facts."**
6. On completion, the user sees a list of extracted candidate items with quality indicators.
7. **Private candidates** are saved immediately to the user's private workspace. They are visible only to the user and never appear in public browsing.
8. Candidates the user wants to share publicly can be **nominated for public review** (see below). The private item remains in their workspace; nomination creates a separate candidate record for admin review.

If the uploaded guide is identical or near-identical to a previous upload, the system warns the user before processing:

> "This guide looks very similar to your import from {date}. Continuing may generate duplicate items. Proceed anyway?"

### Private Workspace

Available via **Items → My Items → Private**.

Shows all items the user has created privately, including:
- Items generated from study guide imports
- Items the user added manually
- Status of any public nomination (Pending Admin Review / Approved / Rejected)

### Nominating Private Items for Public

From the private workspace, the user can select one or more private items and click **Nominate for public**. This:

- Creates a candidate record from a snapshot of the private item
- Does **not** change or remove the private item
- Sends the candidate into the admin curation queue for review
- Shows a **Nomination pending** badge on the item in the private workspace

If the nomination is rejected by admin, the private item remains and the user sees a **Rejected** badge with the reason (if provided).

---

## The Processing Pipeline

Every item request or study guide import goes through this pipeline, run in a Lambda function triggered by SQS.

```
[User submits request]
        │
        ▼
[API] Validate taxonomy path
      Check daily quota for user tier
      For study guide: return presigned S3 URL, await upload confirmation
      Enqueue job to SQS
        │
        ▼
[Lambda]
  ┌─────────────────────────────────────────────────────┐
  │ Stage 0 — Dedup gate (before any LLM call)          │
  │   • SHA-256 hash check against existing guides      │
  │   • If exact match for same user → warn, skip       │
  │   • For study guide: chunk text, embed chunks       │
  │   • Vector similarity check against user's prior    │
  │     chunks (pgvector cosine) — flag overlapping     │
  │     chunks, skip them in generation prompt          │
  └─────────────────────────────────────────────────────┘
        │
        ▼
  ┌─────────────────────────────────────────────────────┐
  │ Stage 1 — Creative Generator (Deepseek V3)          │
  │   Persona: enthusiastic teacher, prioritises        │
  │   surprising or counterintuitive facts              │
  │   Input: scope (category/L1/L2/keywords),           │
  │          unique chunks from study guide (if any),   │
  │          desired count × 2 (overshoot to allow      │
  │          for downstream rejection)                  │
  │   Output: raw candidate items                       │
  └─────────────────────────────────────────────────────┘
        │
        ▼
  ┌─────────────────────────────────────────────────────┐
  │ Stage 1.5 — Vector Dedup (pgvector, no LLM)         │
  │   Embed each candidate (question + answer)          │
  │   Search against:                                   │
  │     • user's own existing items (private + public)  │
  │     • all public items                              │
  │   Similarity > 0.92 → drop (duplicate)             │
  │   Similarity 0.85–0.92 → flag (similar, keep)      │
  │   Store nearest match ID and score on candidate     │
  └─────────────────────────────────────────────────────┘
        │
        ▼
  ┌─────────────────────────────────────────────────────┐
  │ Stage 1.6 — Structural Validation (code, no LLM)    │
  │   Drop candidates that fail any of:                 │
  │     • Question does not end with '?'                │
  │     • Answer longer than 2× the question            │
  │     • Answer echoes opening words of question       │
  │     • Question fewer than 5 words                   │
  │     • Answer is a single word                       │
  └─────────────────────────────────────────────────────┘
        │
        ▼
  ┌─────────────────────────────────────────────────────┐
  │ Stage 2 — Pedantic Reviewer + Editor (Deepseek V3)  │
  │   Persona: PhD-level fact-checker and editor        │
  │   For each surviving candidate:                     │
  │     • Verify factual accuracy; reject if uncertain  │
  │     • Check no plausible alternative answer exists  │
  │     • Rewrite for clarity and conciseness           │
  │     • Return verdict + brief justification          │
  │   System prompt is fixed → benefits from            │
  │   Deepseek prefix cache (≈80% token discount        │
  │   on repeated calls within cache window)            │
  └─────────────────────────────────────────────────────┘
        │
        ▼
  ┌─────────────────────────────────────────────────────┐
  │ Stage 2.5 — Taxonomy Fit Check (code, no LLM)       │
  │   Verify question or answer contains at least one   │
  │   keyword or known synonym from the declared        │
  │   L1/L2 taxonomy path                               │
  │   Drift flag set if check fails (not hard-reject —  │
  │   admin sees the flag)                              │
  └─────────────────────────────────────────────────────┘
        │
        ▼
  Write CandidateItems to DB with:
    status, stage reached, reviewer verdict,
    similarity score + nearest match, drift flag,
    embedding vector
  Update ContentRequest.Status = AwaitingAdminReview
  Delete raw study guide from S3 (if applicable)
```

LLM stages (1 and 2) use Deepseek V3. The combined cost per request is approximately $0.003 at current Deepseek pricing. Lambda and SQS costs are within free tier at typical usage volumes.

---

## What Admins See and Do

### Curation Queue

Available via **Admin → Curation Queue**.

Items are grouped by content request. Each group shows:

- Requester (username), request date, tier (Regular/Premium)
- Declared scope (category / L1 / L2 / extra keywords)
- Source type (keyword request or study guide import)
- Number of candidates: total generated / survived pipeline / flagged

Expanding a group shows each candidate item with:

| Field | Description |
|---|---|
| Question + Answer | Final text after Stage 2 editing |
| Quality | Verified / Needs Review / Flagged |
| Reviewer verdict | One-line justification from Stage 2 |
| Similarity | Score + link to nearest existing item (if flagged Similar) |
| Drift flag | Shown if Stage 2.5 found no taxonomy keyword match |
| Stage rejected at | If item was dropped mid-pipeline, shows which stage and why |

### Admin Actions

**Per batch (group):**

- **Approve batch** — all non-flagged candidates in the group become public items. Flagged items stay pending unless individually approved.
- **Reject batch** — all candidates rejected with an optional reusable reason (shown to admin for future batches, not surfaced to users in v1).
- **Approve flagged item** — promote an individually flagged candidate to public after manual review.
- **Reject individual item** — remove one candidate from the batch without affecting others.

**Taxonomy proposals:**

When a candidate's keywords don't map cleanly to an existing L2, the pipeline may generate a taxonomy proposal (a suggested new L2 slug). These appear in a separate **Taxonomy Proposals** panel. Admins approve or dismiss them. Public taxonomy never expands automatically.

**Export to JSON:**

After approving a batch, admin can click **Export to JSON** on any scope (category/L1/L2). This downloads a seed-compatible JSON file in the same schema as `data/seed-source/items/...`. The admin reviews the file and commits it to the repository manually. Seed-sync then reconciles it on next deploy.

Approved items get `IsRepoManaged = true` only after seed-sync confirms the row exists in the repository-managed source.

### Revision Queue

Items with sustained poor ratings or explicit issue reports are surfaced here automatically:

- 3 or more issue reports (wrong / outdated / unclear / duplicate / bad-taxonomy) in 30 days, **or**
- Average rating ≤ 2.5 with at least 5 ratings in 30 days, **or**
- Admin manually flags an item

Each revision ticket shows the item, its issue reports, and an AI-generated suggested fix with supporting reasoning. Admin can:

- **Accept fix** — publishes the revised item, goes through the same export path
- **Reject fix and keep original** — closes the ticket
- **Reject fix and remove item** — removes the item from public

---

## Data Storage

| Data | Storage | Retention |
|---|---|---|
| Raw study guide file | S3 (presigned upload) | Deleted after Lambda processing |
| Guide metadata (hash, status, S3 key) | PostgreSQL | Kept |
| Text chunks | PostgreSQL | Kept |
| Chunk embeddings | PostgreSQL (pgvector, 384-dim) | Kept |
| Candidate items + embeddings | PostgreSQL | Kept until approved/rejected |
| Approved public items + embeddings | PostgreSQL | Permanent |
| Private items + embeddings | PostgreSQL | Until user deletes |

Study guide files never pass through the API server. The browser uploads directly to S3 via a presigned URL returned by the API. The raw file is deleted from S3 as soon as the Lambda finishes chunking, keeping PostgreSQL storage well within the Supabase free tier.

---

## Cost Profile (Estimates)

| Component | Cost |
|---|---|
| Deepseek V3 per request (~15 items) | ~$0.003 |
| Embeddings per guide (40 chunks) | ~$0.0002 |
| Lambda + SQS (at typical volume) | Within free tier |
| S3 (transient guide storage) | Negligible |
| PostgreSQL (pgvector on Supabase) | Within 500MB free tier |

At 100 item requests per day the LLM cost is approximately **$0.30/day**.
