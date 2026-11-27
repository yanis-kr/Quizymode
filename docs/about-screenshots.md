# About page screenshots

The `/about` page (#885, AC 3.0.60 to 3.0.62) shows eight screenshots from `src/Quizymode.Web/src/assets/about/`. `src/Quizymode.Web/src/features/about/aboutImages.ts` imports each file and holds its alt text, `width` and `height`. Because they are imported, the build emits them like the curated pictures: content-hashed as `assets/m/<hash>.webp`, never inlined, and checked by `npm run check:curated-images` (AC 3.21.7). The deploy's immutable one-year cache for `*.webp` is then safe, since a changed image gets a new name. Do not put them under `public/`, where they would keep fixed names. Keep the set small: every image here must be recaptured when its screen changes.

## Current capture

- App version: 3.215.2 (`main` at 5a37a559), captured 2026-11-26 for release 3.216.0.
- Theme: light only. The page shows each image in a bordered, neutral frame, so the same file works on both page themes.
- Viewport: 375x812 CSS px at device scale factor 2 (phone layout). Each image is a crop of that page, so its file size is twice the CSS crop.
- Format: WebP, converted in Chromium with `canvas.toDataURL("image/webp", 0.8)`. Cap 100 KB per file, target 60 KB.
- Stack: local only. API in Development with `Authentication__DevTest__Enabled=true` and the dummy Cognito values from the `e2e` job in `.github/workflows/ci.yml`, against a fresh, throwaway Postgres container. The web dev server ran with `VITE_DEV_TEST_USER` set. No production sign-in and no personal data.
- Seed data: the Development startup seed (`data/seed-dev/selection.json` items and the **Fun Trivia Facts** collection `8f9b8c14-8d30-4d94-9b20-4c7bb7f7f511`, five questions).
- Notes-to-quiz: local Development has no LLM provider, so the capture stubbed `GET /api/study-guides/documents/config` and `GET /api/study-guides/documents/{id}` with an invented sample document ("The water cycle (class notes)", four sections, two drafted questions with source quotes). The pages render real UI. Everything those two requests return is invented, including the generation allowance, so no image may show the allowance box: `notes-sections.webp` is cropped to the section list.

| File | Pixels | Bytes | Route | Crop (CSS px) | Used in |
| --- | --- | --- | --- | --- | --- |
| `quiz.webp` | 750x940 | 28,724 | `/quiz/collections/{Fun Trivia Facts}` after picking the right answer | 375x470 from the Practice/Test row | Learn your way, Quiz card |
| `flashcards.webp` | 750x640 | 17,134 | `/explore/collections/{Fun Trivia Facts}` | 375x320 from the mode hint line | Learn your way, Flashcards card |
| `learn.webp` | 750x820 | 19,628 | `/learn/collections/{Fun Trivia Facts}` | 375x410 from "Round 1" | Learn your way, Learn card |
| `match-race.webp` | 750x784 | 25,250 | `/games/match-race/collections/{Fun Trivia Facts}` after matching one pair | 375x392 from the Match Race heading | Learn your way, Games card |
| `daily.webp` | 750x1444 | 39,092 | `/daily` (first question, no streak chip) | 375x722 from the Daily quiz heading | Small habits |
| `notes-add.webp` | 590x580 | 21,498 | `/create/notes`, **Photos or scan** tab | 295x290 from the tab row | Notes step 1 |
| `notes-sections.webp` | 590x570 | 26,596 | `/study-guides/documents/{sample}` (sections New) | 295x285, the section list below the allowance box (quality 0.86) | Notes step 2 |
| `notes-review.webp` | 590x644 | 24,886 | `/study-guides/documents/{sample}` (first section Generated) | 295x322, the first drafted question | Notes step 3 |

Total: 202,808 bytes (about 198 KB), all loaded lazily below the fold.

## Regenerate

1. Start a throwaway database: `docker run -d --name qm-about-capture -e POSTGRES_USER=postgres -e POSTGRES_PASSWORD=<local-only> -e POSTGRES_DB=quizymode -p 55432:5432 postgres:16`.
2. Start the API with the `e2e` job environment from `.github/workflows/ci.yml`, plus `ConnectionStrings__PostgreSQL` pointing at that container: `dotnet run --no-launch-profile --project src/Quizymode.Api/Quizymode.Api.csproj -c Debug`. Wait for `https://localhost:8082/health` to answer `Healthy`.
3. Start the web dev server with the same `VITE_*` values as the `e2e` job and any `VITE_DEV_TEST_USER`: `npm run dev -- --port 7000 --strictPort` in `src/Quizymode.Web`.
4. With the Playwright library, open each route above at 375x812, device scale factor 2, with `localStorage["quizymode.theme.v1"] = "light"`, crop the region in the table, and convert the PNG to WebP in the page with a canvas at quality 0.8 (lower it only if a file passes 100 KB). For the notes document, route the two study-guide requests to a sample document as described above.
5. Open every image and check it by eye: no personal data, no error or loading state, no dev-only banner or user name.
6. Replace the files in `src/Quizymode.Web/src/assets/about/`, update `width` and `height` in `aboutImages.ts` and this table, and run `npm test -- --run AboutPage` (AC 3.0.60 checks format, size, attributes and that every file is used). Then run `npm run build` and `npm run check:curated-images` (AC 3.21.7).
7. Stop the API, the dev server and the container.
