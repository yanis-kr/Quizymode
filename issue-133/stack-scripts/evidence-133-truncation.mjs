// Supplementary live check for #133: overlong fields are truncated (not rejected) by the running API.
// Sent with a test-issuer member token so it uses that user's rate-limit partition (the IP partition
// was deliberately exhausted by the flood check in evidence-133.mjs). Usage: node evidence-133-truncation.mjs
import { execFileSync } from "child_process";

process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0"; // localhost dev certificate only
const mint = await (await fetch("https://localhost:7443/mint?sub=member-trunc-133&email=trunc133%40local.test")).json();
const body = {
  source: "window",
  name: "N".repeat(300),
  message: "Overlong evidence message " + "m".repeat(900),
  stack: "Error: overlong\n    at run (https://localhost:7000/assets/a.js?key=SECRETKEY:1:2)\n" + "s".repeat(9000),
  componentStack: "\n    at Thing\n" + "c".repeat(5000),
  path: "/quiz/" + "p".repeat(1000) + "?q=SECRETQ",
  appVersion: "3.58.0",
  sessionId: "trunc-evidence-1",
};
const raw = JSON.stringify(body);
const response = await fetch("https://localhost:8082/client-errors", {
  method: "POST",
  headers: { "Content-Type": "application/json", Authorization: `Bearer ${mint.idToken}` },
  body: raw,
});
console.log(`request body bytes: ${raw.length}`);
console.log(`POST /client-errors -> ${response.status} ${await response.text()}`);
console.log(execFileSync("docker", ["exec", "qm-ev-133", "psql", "-U", "postgres", "-d", "quizymode", "-P", "pager=off", "-c",
  `SELECT length("ErrorName") AS name_len, length("Message") AS message_len, length("Stack") AS stack_len, length("ComponentStack") AS component_len, length("Path") AS path_len, "Path" LIKE '%?%' AS path_has_query, "Stack" LIKE '%SECRETKEY%' AS stack_has_secret, "IsAuthenticated", "UserId" IS NOT NULL AS has_user FROM "ClientErrors" WHERE "SessionId" = 'trunc-evidence-1'`], { encoding: "utf8" }));
