/**
 * AC 7.10.4: signs in the test user and the test admin from environment variables and saves one browser state each.
 * CI uses TEST_USER_* and TEST_ADMIN_* (repository secrets); a developer machine may use the QM_AGENT_USER_* names
 * from AGENTS.md instead. A role whose variables are missing is skipped here, and its tests then report BLOCKED.
 */
import { test as setup } from "../fixtures";
import { accountFromEnv, signInAndSave } from "../signIn";
import { ROLE_STATE_FILES } from "./roles";

setup("sign in as the test user", async ({ page }) => {
  const account = accountFromEnv(["TEST_USER_EMAIL", "QM_AGENT_USER_TEST_UID"], ["TEST_USER_PASSWORD", "QM_AGENT_USER_TEST_PWD"]);
  setup.skip(!account, "BLOCKED: test user variables are not set");
  await signInAndSave(page, account!, ROLE_STATE_FILES.user);
});

setup("sign in as the test admin", async ({ page }) => {
  const account = accountFromEnv(["TEST_ADMIN_EMAIL", "QM_AGENT_USER_ADMIN_UID"], ["TEST_ADMIN_PASSWORD", "QM_AGENT_USER_ADMIN_PWD"]);
  setup.skip(!account, "BLOCKED: test admin variables are not set");
  await signInAndSave(page, account!, ROLE_STATE_FILES.admin);
});
