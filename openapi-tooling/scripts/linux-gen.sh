#!/bin/bash
# Runs inside mcr.microsoft.com/dotnet/sdk:10.0. Generates the OpenAPI artifact for each ref on a Linux (LF) checkout.
set -u
git config --global core.autocrlf false
git clone -q /ev/repro.bundle /work && cd /work
uname -a > /ev/openapi/linux-env.txt; dotnet --version >> /ev/openapi/linux-env.txt; pwsh -v >> /ev/openapi/linux-env.txt; git --version >> /ev/openapi/linux-env.txt
for ref in repro/137-before repro/137-after repro/138-before repro/138-after; do
  name=$(echo $ref | tr '/' '-')
  git checkout -q -f "origin/$ref" 2>/dev/null || git checkout -q -f "$ref"
  echo "== $ref $(git rev-parse --short HEAD) eol(sample)=$(git ls-files --eol src/Quizymode.Api/Program.cs | awk '{print $2}')"
  dotnet build src/Quizymode.Api/Quizymode.Api.csproj -c Release --nologo -v q > /ev/openapi/linux-$name.build.log 2>&1; echo "build exit=$?"
  cp docs/openapi/quizymode-api.json /ev/openapi/linux-$name.json
  git checkout -q -- docs/openapi/quizymode-api.json
done
