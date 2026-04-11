#!/usr/bin/env node

import fs from "fs";

function parseArgs(argv) {
  const options = {
    url: process.env.USER_GUIDE_BASE_URL ?? "https://www.quizymode.com/",
    expectedBuildVersion:
      process.env.USER_GUIDE_EXPECTED_BUILD_VERSION ?? "",
    timeoutSeconds: Number(process.env.USER_GUIDE_READY_TIMEOUT_SECONDS ?? "900"),
    intervalSeconds: Number(process.env.USER_GUIDE_READY_INTERVAL_SECONDS ?? "15"),
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === "--url" && argv[index + 1]) {
      options.url = argv[index + 1];
      index += 1;
      continue;
    }

    if (arg === "--expected-build-version" && argv[index + 1]) {
      options.expectedBuildVersion = argv[index + 1];
      index += 1;
      continue;
    }

    if (arg === "--timeout-seconds" && argv[index + 1]) {
      options.timeoutSeconds = Number(argv[index + 1]);
      index += 1;
      continue;
    }

    if (arg === "--interval-seconds" && argv[index + 1]) {
      options.intervalSeconds = Number(argv[index + 1]);
      index += 1;
      continue;
    }

    if (arg.startsWith("--url=")) {
      options.url = arg.slice("--url=".length);
      continue;
    }

    if (arg.startsWith("--expected-build-version=")) {
      options.expectedBuildVersion = arg.slice("--expected-build-version=".length);
      continue;
    }

    if (arg.startsWith("--timeout-seconds=")) {
      options.timeoutSeconds = Number(arg.slice("--timeout-seconds=".length));
      continue;
    }

    if (arg.startsWith("--interval-seconds=")) {
      options.intervalSeconds = Number(arg.slice("--interval-seconds=".length));
    }
  }

  options.url = options.url.endsWith("/") ? options.url : `${options.url}/`;
  return options;
}

function extractMetaContent(html, metaName) {
  const metaPattern = new RegExp(
    `<meta[^>]+name=["']${metaName}["'][^>]+content=["']([^"']+)["']`,
    "i"
  );

  const match = html.match(metaPattern);
  return match?.[1]?.trim() ?? "";
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function writeGitHubOutput(name, value) {
  if (!process.env.GITHUB_OUTPUT) {
    return;
  }

  const line = `${name}=${value}\n`;
  fs.appendFileSync(process.env.GITHUB_OUTPUT, line, "utf8");
}

async function fetchHomepage(url) {
  const target = new URL(url);
  target.searchParams.set("_guide_ready_check", Date.now().toString());

  const response = await fetch(target, {
    redirect: "follow",
    headers: {
      "cache-control": "no-cache",
      pragma: "no-cache",
    },
  });

  const html = await response.text();
  return {
    status: response.status,
    ok: response.ok,
    html,
    buildVersion: extractMetaContent(html, "quizymode-build-version"),
    buildLabel: extractMetaContent(html, "quizymode-build-label"),
  };
}

async function waitForProductionReady(options) {
  const startedAt = Date.now();
  const deadline = startedAt + options.timeoutSeconds * 1000;
  let attempt = 0;
  let lastFailure = "The readiness check did not run.";

  while (Date.now() < deadline) {
    attempt += 1;

    try {
      const result = await fetchHomepage(options.url);
      const buildSummary = result.buildVersion || "(missing build marker)";
      console.log(
        `[${attempt}] status=${result.status} build=${buildSummary}`
      );

      if (!result.ok) {
        lastFailure = `Homepage returned HTTP ${result.status}.`;
      } else if (!result.buildVersion) {
        lastFailure =
          "Homepage responded, but the quizymode-build-version marker was missing.";
      } else if (
        options.expectedBuildVersion &&
        result.buildVersion !== options.expectedBuildVersion
      ) {
        lastFailure = `Expected build ${options.expectedBuildVersion}, but the live site is still serving ${result.buildVersion}.`;
      } else {
        console.log(`Production is ready at ${options.url}`);
        console.log(`Live build version: ${result.buildVersion}`);
        if (result.buildLabel) {
          console.log(`Live build label: ${result.buildLabel}`);
        }
        writeGitHubOutput("live_build_version", result.buildVersion);
        writeGitHubOutput("live_build_label", result.buildLabel);
        return;
      }
    } catch (error) {
      lastFailure =
        error instanceof Error ? error.message : "Unknown readiness-check error.";
      console.log(`[${attempt}] request failed: ${lastFailure}`);
    }

    await sleep(options.intervalSeconds * 1000);
  }

  throw new Error(
    `Production did not become ready within ${options.timeoutSeconds} seconds. ${lastFailure}`
  );
}

const options = parseArgs(process.argv.slice(2));
await waitForProductionReady(options);
