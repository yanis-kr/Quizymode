#!/usr/bin/env node
// Rotates Quizymode secrets into SSM Parameter Store. Dry run by default.
//   node scripts/rotate/rotate.mjs [--apply] [--only a,b] [--run-id id] [--deployed] [--redeploy-cmd "cmd"] [--cdp http://127.0.0.1:9222]
// Values never reach the console, arguments, state file or logs (see docs/infra/ROTATION.md).
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { ADAPTERS } from "./lib/adapters.mjs";
import { makeBrowserSession } from "./lib/browser.mjs";
import { runRotation } from "./lib/runner.mjs";
import { loadState, saveState } from "./lib/state.mjs";
import { makeSsmTarget } from "./lib/target.mjs";

const here = dirname(fileURLToPath(import.meta.url));

export function parseArgs(argv) {
  const opts = { apply: false, deployed: false, only: [], cdp: "http://127.0.0.1:9222" };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--apply") opts.apply = true;
    else if (a === "--deployed") opts.deployed = true;
    else if (a === "--only") opts.only = argv[++i].split(",");
    else if (a === "--run-id") opts.runId = argv[++i];
    else if (a === "--redeploy-cmd") opts.redeployCmd = argv[++i];
    else if (a === "--cdp") opts.cdp = argv[++i];
    else throw new Error(`unknown argument: ${a}`);
  }
  return opts;
}

function realAws(args, { env } = {}) {
  const r = spawnSync("aws", args, { encoding: "utf8", env: { ...process.env, ...env, AWS_PAGER: "" } });
  return { status: r.status ?? 1, stdout: r.stdout ?? "" }; // stderr is dropped on purpose: the CLI can echo values
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  const inventory = JSON.parse(readFileSync(join(here, "secrets.json"), "utf8"));
  const runId = opts.runId ?? new Date().toISOString().replace(/[:.]/g, "-");
  const stateFile = join(process.cwd(), ".qm", "rotation", `${runId}.json`);
  const state = loadState(stateFile, runId);
  const needsBrowser = inventory.secrets.some((s) => s.method === "browser" && (!opts.only.length || opts.only.includes(s.name)));
  const browser = makeBrowserSession({ cdpUrl: opts.cdp, recipeDir: join(here, "recipes") });
  if (opts.apply && needsBrowser) await browser.connect();
  const redeploy = opts.redeployCmd
    ? () => {
        if (spawnSync(opts.redeployCmd, { shell: true, stdio: "inherit" }).status !== 0) throw new Error("redeploy command failed");
      }
    : null;
  try {
    const result = await runRotation({
      inventory, only: opts.only, apply: opts.apply, state, save: (s) => saveState(stateFile, s),
      aws: realAws, target: makeSsmTarget({ aws: realAws, prefix: inventory.ssmPrefix }), adapters: ADAPTERS, browser,
      redeploy, deployed: opts.deployed, log: (m) => console.log(m),
    });
    console.log(JSON.stringify({ runId, rotated: result.rotated ?? [], planned: result.planned, stoppedForDeploy: result.stoppedForDeploy }));
  } finally {
    await browser.close();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((e) => {
    console.error(`rotation stopped: ${e.message}`);
    process.exit(1);
  });
}
