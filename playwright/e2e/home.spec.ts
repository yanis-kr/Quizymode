import { expect, test } from "@playwright/test";

test.use({ storageState: { cookies: [], origins: [] } });

test("AC 3.0 @smoke - anonymous visitor can start the five-question home quiz", async ({
  page,
}) => {
  await page.goto("/");

  const quickQuizLink = page.getByRole("link", { name: /play a 5-question quiz/i });
  await expect(quickQuizLink).toBeVisible();
  await expect(page.getByText(/no account needed/i)).toBeVisible();

  await quickQuizLink.click();

  await expect(page).toHaveURL(
    /\/quiz\/collections\/8f9b8c14-8d30-4d94-9b20-4c7bb7f7f511\/fun\+trivia\+facts/
  );
  await expect(page.getByText("Question")).toBeVisible({ timeout: 10_000 });
  await expect(page.getByText(/^\s*A\./).first()).toBeVisible();
  await expect(page).not.toHaveURL(/\/login(?:[/?#]|$)/);
});
