#!/bin/bash
set -u
git config --global core.autocrlf false; git config --global advice.detachedHead false
mkdir /work && cd /work && git init -q && git fetch -q /ev/verify.bundle 'refs/*:refs/*'
uname -sr > /ev/verify/linux-env.txt; pwsh -v >> /ev/verify/linux-env.txt; dotnet --version >> /ev/verify/linux-env.txt
pwsh -NoProfile -File /scripts/verify-matrix.ps1 -Repo /work -Out /ev/verify -Tag linux -Shell pwsh
