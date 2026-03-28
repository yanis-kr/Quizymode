# OpenAPI

- `quizymode-api.json` is the checked-in OpenAPI 3 artifact generated from the API project at build time.
- In local development, the API also serves runtime documents at `/openapi/v1.json` and `/openapi/v1.yaml`.
- ASP.NET Core `.NET 10` currently supports build-time generation in JSON. YAML is available from the runtime OpenAPI endpoint, not from build-time generation.

Regenerate the checked-in spec with:

```powershell
dotnet build src/Quizymode.Api/Quizymode.Api.csproj
```

Verify the checked-in file is in sync with:

```powershell
.\scripts\verify-openapi.ps1
```
