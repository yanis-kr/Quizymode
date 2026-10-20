import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { INTERNAL_BROWSER_STORAGE_KEY } from "@/utils/pageViewTracking";
import { captureAttribution } from "@/utils/attributionCapture";
import { VISITOR_ID_STORAGE_KEY } from "@/utils/visitorId";
import { installMemoryLocalStorage } from "@/test/memoryStorage";
import PageViewTracker from "./PageViewTracker";

const { mockTrackPageView } = vi.hoisted(() => ({ mockTrackPageView: vi.fn() }));

vi.mock("@/api/analytics", () => ({
  analyticsApi: { trackPageView: mockTrackPageView },
}));

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({ isLoading: false }),
}));

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <PageViewTracker />
    </MemoryRouter>
  );
}

describe("PageViewTracker", () => {
  beforeEach(() => {
    sessionStorage.clear();
    installMemoryLocalStorage();
    mockTrackPageView.mockReset();
    mockTrackPageView.mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("records a hit for public routes without the internal marker", async () => {
    renderAt("/categories?sort=popular");

    await waitFor(() => expect(mockTrackPageView).toHaveBeenCalledTimes(1));
    const request = mockTrackPageView.mock.calls[0][0];
    expect(request).toMatchObject({ path: "/categories", queryString: "?sort=popular" });
    expect(request).not.toHaveProperty("internalBrowser");
  });

  it("sends the internal-browser marker when this browser is excluded", async () => {
    localStorage.setItem(INTERNAL_BROWSER_STORAGE_KEY, "true");

    renderAt("/");

    await waitFor(() => expect(mockTrackPageView).toHaveBeenCalledTimes(1));
    expect(mockTrackPageView.mock.calls[0][0]).toMatchObject({
      path: "/",
      internalBrowser: true,
    });
  });

  it("sends the stored visitor id with the hit", async () => {
    localStorage.setItem(VISITOR_ID_STORAGE_KEY, "44444444-4444-4444-4444-444444444444");

    renderAt("/");

    await waitFor(() => expect(mockTrackPageView).toHaveBeenCalledTimes(1));
    expect(mockTrackPageView.mock.calls[0][0]).toMatchObject({
      visitorId: "44444444-4444-4444-4444-444444444444",
    });
  });

  it("omits the visitor id when Global Privacy Control is on", async () => {
    vi.stubGlobal("navigator", { globalPrivacyControl: true } as unknown as Navigator);

    renderAt("/");

    await waitFor(() => expect(mockTrackPageView).toHaveBeenCalledTimes(1));
    expect(mockTrackPageView.mock.calls[0][0]).not.toHaveProperty("visitorId");

    vi.unstubAllGlobals();
  });

  it("sends attribution captured earlier in this tab load", async () => {
    window.history.pushState({}, "", "/landing?utm_source=newsletter&gclid=abc123");
    captureAttribution();
    window.history.pushState({}, "", "/categories");

    renderAt("/categories");

    await waitFor(() => expect(mockTrackPageView).toHaveBeenCalledTimes(1));
    expect(mockTrackPageView.mock.calls[0][0]).toMatchObject({
      utmSource: "newsletter",
      gclid: "abc123",
    });
  });

  it.each(["/admin", "/admin/page-view-analytics", "/admin/user-settings"])(
    "records nothing for admin route %s",
    async (path) => {
      renderAt(path);

      // Give the effect a chance to run before asserting the negative.
      await new Promise((resolve) => setTimeout(resolve, 0));
      expect(mockTrackPageView).not.toHaveBeenCalled();
    }
  );

  it("never records OAuth redirect parameters on any page", async () => {
    renderAt("/?code=secret-code&state=secret-state&error=access_denied&error_description=nope&ref=news");

    await waitFor(() => expect(mockTrackPageView).toHaveBeenCalledTimes(1));
    const request = mockTrackPageView.mock.calls[0][0];
    expect(request.queryString).toBe("?ref=news");
    expect(JSON.stringify(request)).not.toMatch(/secret-code|secret-state|error_description/);
  });

  it("does not record the /auth/callback landing page at all", async () => {
    renderAt("/auth/callback?code=secret-code&state=secret-state");

    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(mockTrackPageView).not.toHaveBeenCalled();
  });
});
