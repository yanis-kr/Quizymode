// GitHub fine-grained token "Quizymode seeder". Token list walked 2026-11-18. The token is REGENERATED in place, which
// invalidates the old value at once, so there is nothing to revoke afterwards. The regenerate form is NOT walked yet:
// run `--only github-seed-sync --apply` once with the owner watching.
import { captureSecret, httpCheck } from "./_lib.mjs";

export async function create(page) {
  await page.goto("https://github.com/settings/personal-access-tokens");
  await page.getByRole("link", { name: /Quizymode seeder/i }).first().click();
  await page.getByRole("button", { name: /Regenerate token/i }).first().click();
  const confirm = page.getByRole("button", { name: /^Regenerate token$/i }).last();
  await confirm.click();
  const secret = await captureSecret(page, "github_pat_[A-Za-z0-9_]{30,}");
  await page.close();
  return { values: { secret }, oldRef: null };
}

export const check = (values) => httpCheck("https://api.github.com/rate_limit", { Authorization: `Bearer ${values.secret}`, "User-Agent": "quizymode-rotate" });

export function revoke() {
  // Regenerating replaced the old value; nothing left to delete.
}
