#!/bin/bash
# Generates the OpenAPI artifact for each ref on a Windows checkout with core.autocrlf=true.
S=$1; cd /c/Projects/Quizymode-wt-repro
{ cmd //c ver; dotnet --version; git --version; echo "core.autocrlf=$(git config core.autocrlf)"; } > $S/ev/openapi/win-env.txt 2>&1
for ref in repro/137-before repro/137-after repro/138-before repro/138-after; do
  name=$(echo $ref | tr '/' '-')
  git -c core.safecrlf=false checkout -q -f "$ref"
  echo "== $ref $(git rev-parse --short HEAD) eol(sample)=$(git ls-files --eol src/Quizymode.Api/Program.cs | awk '{print $2}')"
  dotnet build src/Quizymode.Api/Quizymode.Api.csproj -c Release --nologo -v q > $S/ev/openapi/win-$name.build.log 2>&1; echo "build exit=$?"
  cp docs/openapi/quizymode-api.json $S/ev/openapi/win-$name.json
  git -c core.safecrlf=false checkout -q -f -- docs/openapi/quizymode-api.json
done
