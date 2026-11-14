/**
 * Roles for prod verification (AC 7.10.4, 7.10.5). A spec picks who it runs as:
 *
 *   import { asUser, asAdmin, asAnon, expect } from "./roles";
 *   asAdmin("AC 3.28.11 the Review Board shows the withdraw buttons", async ({ page }) => { ... });
 *
 * The title must contain the AC id, so the AC gate and the evidence generator can link the test to its AC.
 * When a role has no saved sign-in (its credentials were not set, see auth.setup.ts) the test is skipped, and the
 * evidence generator reports it as BLOCKED. A skipped test is never evidence.
 *
 * Rules for specs in this folder: they run against production, so keep them few and short, read-only where
 * possible, and never delete data. Anything a spec creates must be private test data and named in the AC evidence.
 */
import fs from "fs";
import path from "path";
import { test as base, expect } from "../fixtures";

export const ROLE_STATE_FILES = {
  user: path.resolve(process.cwd(), "playwright/.auth/prod-user.json"),
  admin: path.resolve(process.cwd(), "playwright/.auth/prod-admin.json"),
} as const;

export type SignedInRole = keyof typeof ROLE_STATE_FILES;

function signedIn(role: SignedInRole) {
  return base.extend({
    storageState: async ({}, use, testInfo) => {
      const file = ROLE_STATE_FILES[role];
      testInfo.skip(!fs.existsSync(file), `BLOCKED: no saved ${role} sign-in; set the ${role} test account variables`);
      await use(file);
    },
  });
}

export const asUser = signedIn("user");
export const asAdmin = signedIn("admin");
export const asAnon = base;
export { expect };
