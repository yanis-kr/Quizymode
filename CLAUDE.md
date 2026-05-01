# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Canonical Reference

`AGENTS.md` is the primary agent guide — read it first. When docs conflict, trust order: source code > `docs/openapi/quizymode-api.json` > `docs/AC.md` > `README.md` > other docs.

`docs/AC.md` is the source of truth for application behavior. Update it in the same change when behavior, authorization, or user-visible logic changes.

## Commands

**Backend (.NET 10)**
```bash
# Run all tests
dotnet test

# Run a single test (by class or method)
dotnet test --filter "FullyQualifiedName~<TestName>"

# Build for release
dotnet build src/Quizymode.Api/Quizymode.Api.csproj --configuration Release

# Verify OpenAPI artifact is in sync after API surface changes
.\scripts\verify-openapi.ps1 -Configuration Release

# Start full local stack (Aspire: PostgreSQL + API + dashboard)
cd src/Quizymode.Api.AppHost && dotnet run
# Dashboard: https://localhost:5000 | API: https://localhost:8082 | Swagger: https://localhost:8082/swagger
```

**Frontend (React + Vite)**
```bash
cd src/Quizymode.Web

npm run dev          # Dev server at http://localhost:7000 (proxies /api → :8082)
npm run build        # Production build
npm run lint         # ESLint
npm test             # Run tests once (Vitest)
npm run test:watch   # Watch mode
```

**Run a single frontend test:**
```bash
cd src/Quizymode.Web && npm test -- --run <pattern>
```

## Architecture

**Stack:** React 19 SPA → .NET 10 Minimal API → PostgreSQL (Aspire/Docker locally, Supabase in prod). Auth via AWS Cognito JWTs; frontend uses AWS Amplify user-pool APIs (`signIn`, `signUp`, `confirmSignUp`, `fetchAuthSession`) — not Hosted UI PKCE.

**Backend layout:**
- `src/Quizymode.Api/Features/` — vertical-slice features (each slice has a request DTO, handler, and endpoint)
- `src/Quizymode.Api/Shared/` and `Services/` — shared/reusable code
- `src/Quizymode.Api/StartupExtensions/` — service and pipeline wiring (`Program.cs` stays thin)
- `src/Quizymode.Api.AppHost/` — Aspire local orchestration
- `tests/Quizymode.Api.Tests/` — xUnit tests with FluentAssertions and Moq

**Frontend layout:**
- `src/Quizymode.Web/src/features/` — feature pages (Study, Quiz, Collections, Items, Admin)
- `src/Quizymode.Web/src/api/` — Axios HTTP client
- `src/Quizymode.Web/src/hooks/` — auth, navigation, query hooks
- `src/Quizymode.Web/src/contexts/` — auth and user contexts

**Data:** EF Core migrations run automatically on startup. Seed data loaded from `data/seed-dev/` (JSON). Taxonomy definitions in `docs/quizymode_taxonomy.yaml`; generated SQL in `docs/quizymode_taxonomy_seed.sql`.

**OpenAPI:** `docs/openapi/quizymode-api.json` is the checked-in artifact, generated at build time. Do not hand-edit it. Regenerate and verify with `verify-openapi.ps1` after any API surface change.

**Versioning:** Canonical semantic version lives in `Directory.Build.props` as `QuizymodeVersion`. Bump it with every completed change set (PATCH/MINOR/MAJOR). Keep `src/Quizymode.Web/package.json` aligned. NuGet package versions are centralized in `Directory.Packages.props`.

## Mandatory After Every Change

Before considering any task done, always complete **all** of the following:

1. **Run pre-push verification** — invoke the `quizymode-prepush` skill if available, or follow `.agent-skills/quizymode-prepush/SKILL.md` before pushing or reporting ready-to-push work.
2. **Update `docs/AC.md`** — add or revise ACs for any behavior, authorization, or user-visible logic that changed.
3. **Bump `QuizymodeVersion`** in `Directory.Build.props` — PATCH for fixes/polish, MINOR for new features, MAJOR for breaking changes.
4. **Align `src/Quizymode.Web/package.json`** `version` field to match `QuizymodeVersion`.
5. **Suggest a commit title** — include a short conventional-commit title in the final response.
6. **Regenerate OpenAPI** (`verify-openapi.ps1`) if the API surface changed.

These rules also live in `AGENTS.md` § Change Rules — this section is a checklist summary to prevent omissions.

## Code Rules

- Vertical slices under `Features/` — avoid cross-cutting sprawl
- Minimal APIs only — no MVC controllers
- `internal sealed` by default; explicit type annotations (use `var` only when type is obvious)
- FluentValidation for all backend validation; Zod on the frontend
- Explicit mappings — no AutoMapper
- Primary constructors where appropriate
