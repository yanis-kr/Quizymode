import { test as setup } from "../fixtures";
import path from "path";
import { signInAndSave } from "../signIn";

const authFile = path.resolve(process.cwd(), "playwright/.auth/user.json");

setup("authenticate", async ({ page }) => {
  const email = process.env.TEST_USER_EMAIL;
  const password = process.env.TEST_USER_PASSWORD;

  if (!email || !password) {
    throw new Error(
      "TEST_USER_EMAIL and TEST_USER_PASSWORD environment variables must be set"
    );
  }

  await signInAndSave(page, { email, password }, authFile);
});
