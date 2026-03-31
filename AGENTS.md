# Agent Guide

This is the canonical agent-facing guide for the Quizymode repo. Keep it short, stable, and high-signal. Prefer linking to deeper docs rather than repeating them.

## Repo Summary

- Product: study and quiz application
- API: `.NET 10` ASP.NET Core Minimal API
- Web: React 19 + Vite SPA
- Local orchestration: Aspire AppHost
- Production web hosting: S3 + CloudFront
- Production API hosting: AWS Lightsail container
- Production database: Supabase Postgres
- Auth: AWS Cognito + AWS Amplify
- Edge: Cloudflare
- Observability: Grafana Cloud

## Canonical Documents

- Human overview: [README.md](./README.md)
- Behavior and contract intent: [docs/AC.md](./docs/AC.md)
- Generated API contract: [docs/openapi/quizymode-api.json](./docs/openapi/quizymode-api.json)
- Auth setup details: [docs/infra/COGNITO_SETUP.md](./docs/infra/COGNITO_SETUP.md)
- Observability setup: [docs/infra/GRAFANA_CLOUD_SETUP.md](./docs/infra/GRAFANA_CLOUD_SETUP.md)

When docs disagree, prefer:

1. source code
2. generated OpenAPI
3. `docs/AC.md`
4. root `README.md`
5. other docs

`docs/AC.md` is the source of truth for application behavior. When behavior, workflow, authorization, contract intent, or other user-visible logic changes, update `docs/AC.md` in the same change.

## Architecture Rules

- Prefer vertical slices under `src/Quizymode.Api/Features`.
- Keep `Program.cs` thin; put service/pipeline wiring under `StartupExtensions`.
- Use explicit mappings, not AutoMapper.
- Use FluentValidation for validation.
- Use minimal APIs, not MVC controllers.
- Use primary constructors where appropriate.
- Make types `internal sealed` by default unless there is a reason not to.
- Favor explicit typing. Use `var` only when the type is obvious.
- Shared reusable code belongs in `Shared/` or `Services/`, not random feature folders.

## Auth Facts

- The SPA currently uses Amplify user-pool APIs such as `signIn`, `signUp`, `confirmSignUp`, and `fetchAuthSession`.
- The SPA stores Cognito-issued JWTs and calls the API with `Authorization: Bearer <token>`.
- The API validates Cognito JWT bearer tokens and derives admin access from Cognito group claims.
- The current main sign-in flow is not Hosted UI PKCE.

## OpenAPI Rules

- The checked-in OpenAPI artifact is [docs/openapi/quizymode-api.json](./docs/openapi/quizymode-api.json).
- It is generated from the API project at build time.
- Runtime YAML exists in development at `/openapi/v1.yaml`.
- If API surface changes, regenerate and verify the artifact.

Verification command:

```powershell
.\scripts\verify-openapi.ps1 -Configuration Release
```

## Local Run Commands

Start local stack:

```bash
cd src/Quizymode.Api.AppHost
dotnet run
```

Start frontend:

```bash
cd src/Quizymode.Web
npm install
npm run dev
```

Useful checks:

```bash
dotnet test
```

```bash
dotnet build src/Quizymode.Api/Quizymode.Api.csproj --configuration Release
```

## Change Rules

- Do not hand-edit generated OpenAPI unless the generation path is broken and you are explicitly repairing it.
- Do not duplicate large architecture or endpoint inventories across docs.
- Root `README.md` is the canonical human/AI entry point.
- Additional README files should be minimal and local in scope.
- Keep long-lived operational or reference detail under `docs/`.
- If code changes affect application behavior, keep `docs/AC.md` up to date in the same change.
- The canonical app semantic version lives in `Directory.Build.props` as `QuizymodeVersion`. For every completed change set, bump it locally and choose the bump type intentionally: `PATCH` for fixes/internal polish without new capabilities, `MINOR` for backward-compatible features or noticeable user-visible improvements, and `MAJOR` for breaking changes or major contract/workflow shifts.
- Keep `src/Quizymode.Web/package.json` and any surfaced version displays aligned with `QuizymodeVersion` when you bump the version.
- After each completed change, include a short commit title suggestion in the final response.

## What Agents Should Optimize For

- Minimize duplicated documentation.
- Prefer updating canonical files over adding new ones.
- Verify code and contract changes, not just prose.
- Keep outputs concise and decision-oriented.
