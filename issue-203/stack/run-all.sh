#!/usr/bin/env bash
# Resets the throwaway DB + API + fake vendor, then runs every phase in order. Usage: run-all.sh
EV=/c/Projects/Quizymode-wt-evidence/issue-203
cd $EV/stack
pidof_port(){ netstat -ano | grep "LISTENING" | grep ":$1 " | awk '{print $NF}' | head -1; }
for p in 8082 7555; do pid=$(pidof_port $p); [ -n "$pid" ] && taskkill //PID $pid //F //T >/dev/null; done
docker rm -f qm-ev-203 >/dev/null 2>&1
rm -f $EV/logs/*.json $EV/logs/*.txt $EV/logs/fake-llm.log $EV/screenshots/*.png
MSYS_NO_PATHCONV=1 docker run --rm -d --name qm-ev-203 -e POSTGRES_PASSWORD=evidence203 -e POSTGRES_DB=quizymode -p 54203:5432 --tmpfs /var/lib/postgresql/data postgres:17.6 >/dev/null
sleep 6
nohup ./start-stack.sh llm > $EV/logs/llm.out 2>&1 &
nohup ./start-stack.sh api > $EV/logs/api.out 2>&1 &
for i in $(seq 1 60); do grep -q "Now listening on: https" $EV/logs/api.out && break; sleep 2; done
sleep 3
for ph in phase1-198 phase2a phase2b phase3 phase4; do node $ph.mjs 2>&1 | grep -v "Warning\|trace-warnings" > $EV/logs/run-$ph.out; done
echo ALLDONE > $EV/logs/run-done.flag
