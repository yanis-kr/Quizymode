# #203 Study guide upload v2, phase 1: evidence (2026-10-17)

Validated code: branch `feat/203-study-guide-v2` at `af40049` (PR #205 for epic #203; sub-issues #198, #199, #200, #201, #202), app version 3.79.0. The worktree was used read-only (only gitignored `bin/obj` build output was written; `git status` stayed clean).

| Folder | Kind | What |
|---|---|---|
| `stack/` | Scripts | Everything needed to reproduce the run: `start-stack.sh` (env overrides), `run-all.sh`, `fake-oidc.cs` (copied from issue-133), `fake-llm.mjs` (fake vendor), `make-files.cs` (PDF/DOCX builder), `lib.mjs`, `phase1-198.mjs` ... `phase4.mjs`. |
| `files/` | Inputs | `science-guide-14p.pdf` (14 selectable-text pages, a repeated header line and "Page N of 14" footer on every page), `history-notes.docx` (3 Heading 1 sections), `scanned-like.pdf` (6 pages with one digit each), `not-really-a-pdf.pdf` (PNG bytes). |
| `screenshots/` | Local integration | 25 PNGs of the real UI (headless Chromium, normal Chrome UA) and of DB output. |
| `logs/` | Local integration | Per-phase results (`phaseN.txt/.json`, 49 checks, 49 PASS, 0 FAIL), HTTP bodies, `psql` dumps, the fake-vendor request log, API startup and worker log excerpts, applied migrations. |

## Local stack (all local, nothing real touched)

- API from the branch on Kestrel (`https://localhost:8082`, Development) against a throwaway `postgres:17.6` container `qm-ev-203` (tmpfs). All 31 migrations applied from an empty database, including `20261017181457_AddStudyGuideDocuments` (`logs/migrations-applied.txt`, `logs/api-startup-excerpt.txt`).
- Vite dev SPA on `http://localhost:7000` (dummy `VITE_COGNITO_*` values), headless Chromium via Playwright, Amplify localStorage token injection.
- **Identities came from a local test identity provider (`stack/fake-oidc.cs`), not Cognito.** Only `Authentication:Cognito:Authority/ClientId/Audience` pointed at it, so the API's JWT validation and `Admin` policy ran unchanged. Actors: `alice` (free member), `bob` (member, later premium), `admin` (group `Admins`). Tokens are never written to the files; HTTP logs only record `bearer: true`.
- **Fake OpenAI-compatible vendor, not a real vendor** (`stack/fake-llm.mjs`, `http://localhost:7555`). DeepSeek and OpenAI had dummy keys with base URLs `.../ds` and `.../oai`; Gemini deliberately had no key. For each request it returns 4 questions whose `sourceQuote` is copied verbatim from the section text, plus 1 question with an invented quote. A control endpoint can make the `oai` path answer HTTP 500. Its request log is `logs/fake-llm.log` (path, model, status, counts; no headers).
- Config overrides for observability: `StudyGuideGeneration:FreeTierDelayMinutes=1` (default 10) and `PollIntervalSeconds=5` (default 15). Everything else is default (free 10/day, 60/month; premium 50/1000; section target 8,192 bytes).
- The run is one clean pass (`stack/run-all.sh` resets the DB and runs every phase). Earlier trial runs were thrown away (they exposed problems in my fake vendor and scripts, not in the product).

## #198 Extraction and sectioning: PASS (8/8, `logs/phase1-198.txt`)

- PASS Real 14-page PDF uploaded through the UI: 7 sections labelled `pp. 1–2` ... `pp. 13–14`, "14 pages" in the header (`screenshots/01-upload-form-pdf.png`, `02-pdf-document-sections.png`, `logs/198-pdf-document-page.txt`).
- PASS DOCX uploaded through the UI: 3 sections labelled by their headings (The Industrial Revolution / Railways and Trade / Social Change) (`03-docx-document-sections.png`, `logs/198-docx-document-page.txt`).
- PASS DB: no section contains the repeated header line or a "Page N of 14" line, every section keeps its `[p. N]` markers, largest section 7,298 bytes (limit 10,240) (`04-db-sections-headers-stripped.png`, `logs/198-db-sections.txt`).
- PASS PNG bytes renamed `.pdf` -> 400 `StudyGuideDocument.UnsupportedType`; mostly-empty 6-page PDF -> 400 `StudyGuideDocument.Scanned`; anonymous upload -> 401 (`logs/phase1-198.json` holds the ProblemDetails bodies).

## #199 Quota, delay, shared cache, premium, ownership: PASS (14/14, `logs/phase2a.txt`, `phase2b.txt`)

- PASS Free member: the picker preselects all 7 New sections and shows "7 of 10 sections today" (`07-alice-picker-preselected.png`).
- PASS Generate 3 sections -> chips turn Queued and the notice "Free plan: generation starts within about 1 minute." shows (`08-alice-queued-with-delay-notice.png`). DB: `NotBeforeUtc - QueuedUtc` = exactly 60 s (`logs/199-queued-generations.txt`). The worker completed the 3 jobs about 68 s after the click (`logs/199-generations.txt`, `logs/worker-log-excerpt.txt`), and the page showed Done plus the review list (`09-alice-generated-review.png`).
- PASS Counter matches the DB: 3 charge rows for alice, API `dailyUsed=3, remainingToday=7` (`logs/199-charges-after-alice.txt`).
- PASS 429: with an admin override `StudyGuideDailySections=4` (used 3, 1 left), requesting 2 sections returns 429 `QuotaExceeded` ("daily limit of 4 sections leaves 1 for today") and still 3 charge rows (`logs/199-quota-429.json`; UI counter "4 of 4 sections today", `10-alice-counter-with-override.png`). The override was cleared afterwards.
- PASS Cache: bob uploads the same PDF and gets his own document (201, new id). Generating his first 3 sections shows "Ready, free", "Queued 0 sections (3 ready for free)", 0 vendor calls, and 0 charge rows for bob versus 3 for alice (`12-bob-cached-ready-free.png`, `logs/199-cache-bob.json`, `logs/199-charge-rows-alice-vs-bob.txt`).
- PASS Premium: the admin sets `StudyGuidePremium=true` for bob in the admin UI (`13-admin-sets-bob-premium.png`). His 2 new jobs are Tier=Premium with `NotBeforeUtc = QueuedUtc`, no delay notice, and completed about 7-8 s after the click (poll interval 5 s); the counter reads "Premium plan" and bob has 2 charge rows (`14-bob-premium-generating-no-delay.png`, `logs/199-premium-generations.txt`).
- PASS Ownership: bob GET alice's document -> 404, bob generate on it -> 404, anonymous -> 401.

## #202 Vendors, fallback, admin page, quote check: PASS (13/13, `logs/phase2a.txt`, `phase3.txt`)

- PASS Anonymous -> 401, member -> 403 on `GET /admin/llm-providers`, `GET /admin/llm-providers/attempts` and `PUT /admin/llm-providers`.
- PASS Admin page: DeepSeek and OpenAI "Key configured", Gemini "No key"; seeded routes (free Gemini, OpenAI, DeepSeek; premium DeepSeek, OpenAI, Gemini) (`05-admin-ai-providers-default.png`, `logs/202-llm-providers-before.json`). Removing Gemini in the route editor and saving shows "AI provider settings saved." and the free route becomes [OpenAI, DeepSeek] (`06-admin-ai-providers-free-route-saved.png`, `logs/202-llm-providers-after.json`).
- PASS Fallback: with the `oai` path forced to HTTP 500, each of the 3 DOCX generations logged an OpenAI `ProviderError` and then a DeepSeek `Success`, and all 3 completed with DeepSeek (`logs/202-llm-attempts-db.txt`, `logs/fake-llm.log`).
- PASS Attempts: `GET /admin/llm-providers/attempts` shows 11 rows (3 OpenAI Success, 3 OpenAI ProviderError, 5 DeepSeek Success), and the UI's Recent attempts table shows the same plus the "8 of 1,000 sections generated this month" bar (`18-admin-ai-providers-recent-attempts.png`, `logs/202-attempts-api.json`).
- PASS Quote check: all 8 completed generations have `DroppedCount = 1` (the invented quote) and the kept candidates equal the questions returned minus one. 0 candidates carry the invented quote and every stored `SourceQuote` occurs verbatim in its section text (`19-db-dropped-and-verbatim-quotes.png`, `logs/202-db-generations-candidates.txt`).
- PASS Review UI shows `From your guide, p. N: “quote”` and "1 question dropped: not found in your guide" (`20-review-quote-page-dropped.png`).

## #200 Review, edit, save, collection, list: PASS (4/4, `logs/phase4.txt`)

- PASS Edit question 1 inline (`21-review-edit-question-1.png`), uncheck question 12 ("Save 12 selected" became "Save 11 selected"), save -> "Saved 11 questions to your collection" (`22-saved-to-collection.png`). The collection holds 11 items, the edited text is stored, and all 11 explanations end with `From "science-guide-14p", pp. N–M` (`logs/200-db-collection-items.txt`).
- PASS "Open collection" opens the collection in the flashcards (explore) view (`23-open-collection-flashcards.png`).
- PASS My study guides lists both documents: "3 of 7 sections generated · 11 questions saved" with a Collection link, and "3 of 3 sections generated · 0 questions saved" for the DOCX, each with Continue (`24-my-study-guides.png`, `logs/200-my-study-guides.txt`).

## #201 Link sharing by default, Discover opt-in: PASS (10/10, `logs/phase4.txt`)

- PASS The auto-created collection has `IsPublic = true`, `IsDiscoverable = false` (DB), and the UI shows "Anyone with the link can view" on and "List in Discover" off (`25-collection-toggles-defaults.png`, `logs/200-db-collection-items.txt`).
- PASS Anonymous `GET /collections/{id}` -> 200, and `GET /collections/discover` does not list it.
- PASS Share dialog: link field, Copy link, and a rendered QR code (`26-share-dialog-copy-link-qr.png`).
- PASS "List in Discover" on -> it appears in `GET /collections/discover` and on an anonymous visitor's Discover tab (`28-discover-lists-it-anonymous.png`).
- PASS Link access off -> Discover turns off too, anonymous GET -> 404, Discover hides it, the owner still gets 200 and another member 404 (`29-collection-link-access-off.png`, `logs/201-http-checks.json`). Turning link access back on gives anonymous 200 again, still not in Discover.

## Observations

- **Owner controls and token `sub`.** `CollectionDetailPage.tsx` decides ownership with `collectionData.createdBy === userId`, where `userId` is the JWT `sub`, while the API sets `createdBy` to `Users.Id`, a separate random GUID created by `UserUpsertMiddleware`. With the local test issuer these differ, so the owner-only toggles did not render. For #201 only, alice's token therefore carried `sub = her Users.Id` (the API re-links the same email to the new Subject). This code is unchanged by #203, but worth confirming against real Cognito subjects.
- **Vendor retries.** `AddServiceDefaults` adds the standard resilience handler to every `HttpClient`. One failed OpenAI attempt therefore made 4 HTTP requests to the fake vendor (12 requests for 3 attempts) and took 8-9 s before it was logged as one `ProviderError` row.
- Earlier trial runs showed some failed checks. They came from my fake vendor (generated question text collided and was deduped) and from wrong assertions in my scripts (a DB key, a boolean format), not from the product. Those runs were discarded; the numbers above are from the final clean pass (the last phase 4 pass was re-run on its own after a script typo, on the same state).

## Not covered

- Real Cognito login (a local test issuer was used) and real vendors (DeepSeek, OpenAI, Gemini: a fake local endpoint with dummy keys was used, so no real prompt quality, latency, token pricing or rate limits). Gemini was only exercised as the "no key, skipped" case.
- Production, Supabase, Lightsail, or the deployed site. Production was not touched.
- PPTX and plain-text/paste uploads through the browser (DOCX and PDF only here; the other types are covered by unit tests, not this run), scanned-PDF OCR, 300-page and 20 MB limits.
- The default 10-minute free delay and 15-second poll (1 minute and 5 seconds were used), the global monthly budget 503, document expiry cleanup, and concurrent API instances sharing the queue.
- Native share sheet (`navigator.share`) and a real clipboard copy in the share dialog.
