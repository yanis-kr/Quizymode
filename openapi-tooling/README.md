# OpenAPI reproducibility evidence (2026-10-15)

Raw outputs behind the tooling PR for OpenAPI line-ending reproducibility. Nothing here is hand-edited.

| Folder | What it shows | How it was produced |
|---|---|---|
| `reproduction/` | Artifacts generated from the #137 and #138 heads ("before") and the same heads merged with the fix ("after"), on Windows (`core.autocrlf=true`) and Linux | `scripts/win-gen.sh` (Windows 11, dotnet 10.0.204) and `scripts/linux-gen.sh` (container `mcr.microsoft.com/dotnet/sdk:10.0`, dotnet 10.0.402, LF checkout from a git bundle). `matrix.txt` compares SHA-256 hashes. |
| `verify-matrix/` | End-to-end runs of `scripts/verify-openapi.ps1` (new, and the old one from `origin/main` where marked) | `scripts/verify-matrix.ps1`, run under Windows PowerShell 5.1 and pwsh 7.6.7 on Linux. Each case has `.log`, `.log.stderr`, `GITHUB_OUTPUT` (`.ghout`) and diff output. |
| `comment-idempotence/` | The two CI comment steps' `github-script` bodies, extracted verbatim from `ci.yml`, run against a **mocked** GitHub REST client | `node harness.js` |
| `tooling-dotnet-test.log` | Full backend test run on the tooling branch | `dotnet test` |

Verify-matrix cases: A = in sync; B = real API change (new `ChangedBy` response property, artifact not regenerated); B2 = old script on the same ref right after a build; C = new script, same situation, warn-only with a diff file; D = genuine git failure (`GIT_DIR` points nowhere); E = old script, API change, warn-only with a diff file.
