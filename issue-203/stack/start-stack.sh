#!/usr/bin/env bash
# Starts the local evidence stack for #203 (run each service detached; see README). Usage: start-stack.sh <service>
# Services: oidc | llm | api | spa.  The Postgres container is started with:
#   MSYS_NO_PATHCONV=1 docker run --rm -d --name qm-ev-203 -e POSTGRES_PASSWORD=evidence203 -e POSTGRES_DB=quizymode \
#     -p 54203:5432 --tmpfs /var/lib/postgresql/data postgres:17.6
EV=/c/Projects/Quizymode-wt-evidence/issue-203
WT=/c/Projects/Quizymode-wt-203
unset DEEPSEEK_API_KEY OPENAI_API_KEY GEMINI_API_KEY
case "$1" in
  oidc)
    cd $EV/stack && exec dotnet run fake-oidc.cs ;;
  llm)
    cd $EV/stack && exec node fake-llm.mjs $EV/logs/fake-llm.log ;;
  api)
    export APP_ConnectionStrings__PostgreSQL="Host=localhost;Port=54203;Database=quizymode;Username=postgres;Password=evidence203"
    export APP_Authentication__Cognito__Authority=https://localhost:7443
    export APP_Authentication__Cognito__ClientId=quizymode-local-evidence
    export APP_Authentication__Cognito__Audience=quizymode-local-evidence
    # Dummy keys, local FAKE vendor only (never a real vendor). Gemini has no key on purpose.
    export APP_DeepSeek__ApiKey=local-dummy-key
    export APP_DeepSeek__BaseUrl=http://localhost:7555/ds
    export APP_OpenAI__ApiKey=local-dummy-key
    export APP_OpenAI__BaseUrl=http://localhost:7555/oai
    export APP_StudyGuideGeneration__FreeTierDelayMinutes=1
    export APP_StudyGuideGeneration__PollIntervalSeconds=5
    cd $WT/src/Quizymode.Api && exec dotnet run --no-build --launch-profile https ;;
  spa)
    export VITE_COGNITO_USER_POOL_ID=us-east-1_LocalEvid
    export VITE_COGNITO_CLIENT_ID=quizymode-local-evidence
    export VITE_COGNITO_REGION=us-east-1
    cd $WT/src/Quizymode.Web && exec npm run dev ;;
esac
