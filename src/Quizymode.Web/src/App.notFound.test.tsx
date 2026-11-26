// AC 3.37: unknown addresses show the not-found page (#894).
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Link, MemoryRouter } from "react-router-dom";
import { HelmetProvider } from "react-helmet-async";
import type { ComponentType, ReactNode } from "react";
import { installMemoryLocalStorage } from "@/test/memoryStorage";
import App from "./App";
import appSource from "./App.tsx?raw";

const state = vi.hoisted(() => ({ signedIn: false, realLayout: false }));

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({
    isAuthenticated: state.signedIn,
    isAdmin: state.signedIn,
    isLoading: false,
    logout: vi.fn(),
    username: null,
    email: null,
  }),
}));
vi.mock("./components/UserProfileModal", () => ({ default: () => null }));
vi.mock("./features/feedback/components/FeedbackDialog", () => ({ default: () => null }));
vi.mock("./features/analytics/PageViewTracker", () => ({ default: () => null }));

// The real Layout only where a test needs its fallback title.
vi.mock("./components/Layout", async (importOriginal) => {
  const actual = await importOriginal<{ default: ComponentType<{ children: ReactNode }> }>();
  return {
    default: ({ children }: { children: ReactNode }) =>
      state.realLayout ? <actual.default>{children}</actual.default> : <>{children}</>,
  };
});

// Every page is a stub, so only routing is exercised. The not-found page stays real.
const Stub = () => <div data-testid="stub" />;
vi.mock("./utils/lazyPage", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./utils/lazyPage")>();
  return {
    ...actual,
    lazyPage: (factory: Parameters<typeof actual.lazyPage>[0]) =>
      String(factory).includes("NotFoundPage") ? actual.lazyPage(factory) : () => <Stub />,
  };
});
vi.mock("./features/home/pages/HomePage", () => ({ default: () => <Stub /> }));
vi.mock("./features/categories/pages/CategoriesPage", () => ({ default: () => <Stub /> }));
vi.mock("./features/items/pages/ItemsPage", () => ({ default: () => <Stub /> }));
vi.mock("./features/items/pages/ExploreModePage", () => ({ default: () => <Stub /> }));
vi.mock("./features/items/pages/QuizModePage", () => ({ default: () => <Stub /> }));
vi.mock("./features/items/pages/LearnModePage", () => ({ default: () => <Stub /> }));
vi.mock("./features/auth/pages/LoginPage", () => ({ default: () => <Stub /> }));
vi.mock("./features/auth/pages/SignUpPage", () => ({ default: () => <Stub /> }));
vi.mock("./features/auth/pages/ResetPasswordPage", () => ({ default: () => <Stub /> }));
vi.mock("./features/auth/pages/AuthCallbackPage", () => ({ default: () => <Stub /> }));
vi.mock("./features/items/pages/ItemDetailPage", () => ({ default: () => <Stub /> }));
vi.mock("./features/collections/pages/CollectionsPage", () => ({ default: () => <Stub /> }));
vi.mock("./features/collections/pages/CollectionDetailPage", () => ({ default: () => <Stub /> }));
vi.mock("./features/items/pages/ItemCommentsPage", () => ({ default: () => <Stub /> }));
vi.mock("./features/featured/pages/FeaturedPage", () => ({ default: () => <Stub /> }));
vi.mock("./features/learningLoop/pages/DailyQuizPage", () => ({ default: () => <Stub /> }));
vi.mock("./features/learningLoop/pages/DailyArchivePage", () => ({ default: () => <Stub /> }));
vi.mock("./features/starter/StarterQuizPage", () => ({ default: () => <Stub /> }));

/** Every route path in App.tsx except the catch-all, with parameters filled in and optional ones also left out. */
function routeUrls(): string[] {
  const patterns = [...appSource.matchAll(/\bpath="([^"]+)"/g)].map((match) => match[1]).filter((p) => p !== "*");
  const urls = patterns.flatMap((pattern) => {
    const filled = pattern.replace(/:\w+\??/g, "x");
    const withoutOptional = pattern.replace(/\/:\w+\?/g, "").replace(/:\w+/g, "x") || "/";
    return [filled, withoutOptional];
  });
  return [...new Set(urls)];
}

function renderApp(initialEntry: string, extra?: ReactNode) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <HelmetProvider>
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={[initialEntry]}>
          {extra}
          <App />
        </MemoryRouter>
      </QueryClientProvider>
    </HelmetProvider>,
  );
}

const robots = () =>
  [...document.head.querySelectorAll('meta[name="robots"]')].map((meta) => meta.getAttribute("content") ?? "");

describe("not-found page (#894)", () => {
  beforeEach(() => {
    installMemoryLocalStorage();
    state.signedIn = false;
    state.realLayout = false;
  });

  it.each(["/this-page-does-not-exist", "/a/b/c", "/items/a/b/c", "/games/sort-it/a/b"])(
    "AC 3.37.1 shows one h1 and the three links for %s",
    async (path) => {
      renderApp(path);
      expect(await screen.findByRole("heading", { level: 1, name: "Page not found" })).toBeInTheDocument();
      expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
      expect(screen.getByRole("link", { name: "Play a 5-question quiz" })).toHaveAttribute("href", "/start");
      expect(screen.getByRole("link", { name: "Search" })).toHaveAttribute("href", "/search");
      expect(screen.getByRole("link", { name: "Home" })).toHaveAttribute("href", "/");
    },
  );

  it.each(["/this-page-does-not-exist", "/quiz/a/b/c", "/categories/a/b/c/d", "/admin/nope"])(
    "AC 3.37.2 titles %s Page not found with noindex, even where the layout has a fallback title",
    async (path) => {
      state.realLayout = true;
      renderApp(path);
      await screen.findByRole("heading", { level: 1, name: "Page not found" });
      await waitFor(() => expect(document.title).toBe("Page not found | Quizymode"));
      expect(robots().some((content) => content.includes("noindex"))).toBe(true);
    },
  );

  it("AC 3.37.2 keeps the title when navigating between pages that have layout fallback titles", async () => {
    state.realLayout = true;
    renderApp(
      "/categories/x",
      <>
        <Link to="/categories/a/b/c/d">first unknown</Link>
        <Link to="/quiz/a/b/c">second unknown</Link>
      </>,
    );
    await waitFor(() => expect(document.title).toBe("Categories | Quizymode"));
    await userEvent.click(screen.getByRole("link", { name: "first unknown" }));
    await screen.findByRole("heading", { level: 1, name: "Page not found" });
    await waitFor(() => expect(document.title).toBe("Page not found | Quizymode"));
    await userEvent.click(screen.getByRole("link", { name: "second unknown" }));
    await waitFor(() => expect(document.title).toBe("Page not found | Quizymode"));
  });

  it("AC 3.37.3 covers a meaningful set of routes", () => {
    const urls = routeUrls();
    expect(urls.length).toBeGreaterThan(60);
    expect(urls).toEqual(expect.arrayContaining(["/", "/start", "/study-guide/upload", "/add-new-item", "/admin/import"]));
  });

  it.each(routeUrls())("AC 3.37.3 does not show the not-found page for %s", async (path) => {
    state.signedIn = true;
    renderApp(path);
    expect(await screen.findByTestId("stub")).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Page not found" })).toBeNull();
  });
});
