import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { INTERNAL_BROWSER_STORAGE_KEY } from "@/utils/pageViewTracking";
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

  it.each(["/admin", "/admin/page-view-analytics", "/admin/user-settings"])(
    "records nothing for admin route %s",
    async (path) => {
      renderAt(path);

      // Give the effect a chance to run before asserting the negative.
      await new Promise((resolve) => setTimeout(resolve, 0));
      expect(mockTrackPageView).not.toHaveBeenCalled();
    }
  );
});
