import { describe, expect, it } from "vitest";

// The repo-root Playwright files are loaded through import.meta.glob so the web app's type check (npm run build) never
// resolves their dependencies; only this test loads them.
interface ProjectLike {
  name: string;
  use?: { userAgent?: string };
}

interface UserAgentModule {
  E2E_TOKEN_PATTERN: RegExp;
  e2eRunId: (env?: Record<string, string | undefined>) => string;
  e2eUserAgent: (device: { userAgent: string }, env?: Record<string, string | undefined>) => string;
}

const configModules = import.meta.glob<{ default: { projects: ProjectLike[] } }>("../../../../playwright.config.ts", { eager: true });
const helperModules = import.meta.glob<UserAgentModule>("../../../../playwright/e2eUserAgent.ts", { eager: true });

const config = Object.values(configModules)[0]?.default;
const helpers = Object.values(helperModules)[0];

describe("Playwright E2E user-agent token (#573)", () => {
  it("loads the root Playwright config and helper", () => {
    expect(config?.projects.length).toBeGreaterThan(0);
    expect(helpers).toBeDefined();
  });

  it("every project in playwright.config.ts ends its user agent with a valid QuizymodeE2E token", () => {
    const projects = config!.projects;
    const names = projects.map((project) => project.name);
    // The projects that matter most are named explicitly so removing one from the check is noticed.
    expect(names).toEqual(expect.arrayContaining(["auth-setup", "screenshots", "screenshots-mobile"]));

    for (const project of projects) {
      const userAgent = project.use?.userAgent ?? "";
      expect(userAgent, `project ${project.name}`).toMatch(helpers!.E2E_TOKEN_PATTERN);
      expect(userAgent.startsWith("Mozilla/5.0"), `project ${project.name} keeps the device user agent`).toBe(true);
    }
  });

  it("uses GITHUB_RUN_ID, else local, sanitised to [A-Za-z0-9._-] and at most 40 characters", () => {
    const { e2eRunId, e2eUserAgent, E2E_TOKEN_PATTERN } = helpers!;

    expect(e2eRunId({})).toBe("local");
    expect(e2eRunId({ GITHUB_RUN_ID: "123456789" })).toBe("123456789");
    expect(e2eRunId({ GITHUB_RUN_ID: "a b/c;d" })).toBe("a-b-c-d");
    expect(e2eRunId({ GITHUB_RUN_ID: "x".repeat(60) })).toHaveLength(40);
    expect(e2eUserAgent({ userAgent: "Mozilla/5.0 Chrome/126" }, { GITHUB_RUN_ID: "42" })).toBe("Mozilla/5.0 Chrome/126 QuizymodeE2E/42");
    expect(e2eUserAgent({ userAgent: "Mozilla/5.0 Chrome/126" }, { GITHUB_RUN_ID: "x".repeat(60) })).toMatch(E2E_TOKEN_PATTERN);
  });
});
