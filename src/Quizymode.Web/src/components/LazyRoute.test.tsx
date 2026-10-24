import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import fs from "node:fs";
import path from "node:path";
import { LazyRouteBoundary, LazyRoute } from "./LazyRoute";
import { CHUNK_RELOAD_KEY, isChunkLoadError, lazyPage } from "@/utils/lazyPage";
import { Suspense } from "react";

vi.mock("@/features/errorReporting/clientErrorReporter", () => ({
  reportClientError: vi.fn(),
}));

const chunkError = () =>
  new TypeError("Failed to fetch dynamically imported module: https://x/assets/AdminPage-abc.js");

describe("LazyRoute chunk-load recovery", () => {
  beforeEach(() => {
    window.sessionStorage.clear();
    vi.spyOn(console, "error").mockImplementation(() => {});
  });
  afterEach(() => vi.restoreAllMocks());

  it("recognises dynamic import failures", () => {
    expect(isChunkLoadError(chunkError())).toBe(true);
    expect(isChunkLoadError(new Error("boom"))).toBe(false);
  });

  it("shows the spinner while loading and then the page", async () => {
    const Page = lazyPage(() => Promise.resolve({ default: () => <p>Loaded page</p> }));
    render(
      <LazyRoute>
        <Page />
      </LazyRoute>
    );
    expect(screen.getByRole("status")).toBeInTheDocument();
    expect(await screen.findByText("Loaded page")).toBeInTheDocument();
  });

  it("reloads once per tab session, then shows Retry, which reloads only on click", async () => {
    const reload = vi.fn();
    const factory = vi.fn(() => {
      return Promise.reject(chunkError());
    });
    const Page = lazyPage(factory);

    const first = render(
      <LazyRouteBoundary reload={reload}>
        <Suspense fallback={<span>loading</span>}>
          <Page />
        </Suspense>
      </LazyRouteBoundary>
    );
    expect(await screen.findByText("This page failed to load")).toBeInTheDocument();
    expect(reload).toHaveBeenCalledTimes(1);
    expect(window.sessionStorage.getItem(CHUNK_RELOAD_KEY)).toBe("1");
    first.unmount();

    // Simulates the page after the automatic reload: the guard is set, so no second reload.
    render(
      <LazyRouteBoundary reload={reload}>
        <Suspense fallback={<span>loading</span>}>
          <Page />
        </Suspense>
      </LazyRouteBoundary>
    );
    expect(await screen.findByText("This page failed to load")).toBeInTheDocument();
    expect(reload).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(reload).toHaveBeenCalledTimes(2);
    expect(factory).toHaveBeenCalled();
  });
});

describe("App route splitting", () => {
  const app = fs.readFileSync(path.resolve(__dirname, "../App.tsx"), "utf8");
  const lazyNames = [...app.matchAll(/const (\w+) = lazyPage\(/g)].map((m) => m[1]);
  const eagerImports = [...app.matchAll(/^import (\w+) from "\.\/features\//gm)].map((m) => m[1]);

  it("lazy-loads admin, authoring, study guide, community and legal pages", () => {
    expect(lazyNames).toEqual(
      expect.arrayContaining([
        "AdminDashboardPage", "AdminSeedSyncPage", "AdminKeywordsPage", "AdminUserSettingsPage",
        "PageViewAnalyticsPage", "AdminClientErrorsPage", "AdminFeaturedPage", "AdminIdeasPage",
        "CreateHubPage", "CreateImportPage", "BulkCreateItemsPage", "CreateItemPage", "EditItemPage",
        "StudyGuidePage", "StudyGuideImportPage", "StudyGuideUploadPage", "IdeasPage", "RoadmapPage", "FeedbackPage",
        "AboutPage", "PrivacyPolicyPage", "TermsOfServicePage",
      ])
    );
    expect(eagerImports.filter((n) => /^Admin|StudyGuide/.test(n))).toEqual([]);
  });

  it("keeps anonymous landing and study pages eager", () => {
    expect(eagerImports).toEqual(
      expect.arrayContaining([
        "HomePage", "CategoriesPage", "ItemsPage", "QuizModePage", "ExploreModePage",
        "CollectionsPage", "FeaturedPage", "ItemDetailPage", "LoginPage", "SignUpPage",
      ])
    );
  });
});
