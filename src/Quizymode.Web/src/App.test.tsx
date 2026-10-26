import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, useLocation } from "react-router-dom";
import App from "./App";

const authState = vi.hoisted(() => ({ isAuthenticated: false }));

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({ isAuthenticated: authState.isAuthenticated, isAdmin: false, isLoading: false }),
}));

vi.mock("./components/Layout", () => ({ default: ({ children }: { children: React.ReactNode }) => <>{children}</> }));
vi.mock("./features/analytics/PageViewTracker", () => ({ default: () => null }));

// Stub the destination pages so only routing is exercised.
vi.mock("./features/auth/pages/LoginPage", () => ({ default: () => <Where /> }));
vi.mock("./features/create/pages/CreateHubPage", () => ({ default: () => <Where /> }));
vi.mock("./features/items/pages/CreateImportPage", () => ({ default: () => <Where /> }));
vi.mock("./features/items/pages/CreateItemPage", () => ({ default: () => <Where /> }));
vi.mock("./features/admin/pages/AdminImportPage", () => ({ default: () => <Where /> }));
vi.mock("./features/studyGuide/pages/StudyGuideUploadPage", () => ({ default: () => <Where /> }));

function Where() {
  const location = useLocation();
  return <div data-testid="where">{`${location.pathname}${location.search}${location.hash}`}</div>;
}

function renderApp(initialEntry: string) {
  return render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <App />
    </MemoryRouter>
  );
}

describe("legacy create redirects (AC 2.2.5)", () => {
  beforeEach(() => {
    authState.isAuthenticated = true;
  });

  it.each([
    ["/items/add?category=science&keywords=a", "/create?category=science&keywords=a"],
    ["/add-new-item?category=science", "/create/question?category=science"],
    ["/items/create?category=science#top", "/create/question?category=science#top"],
    ["/study-guide/upload?id=u1", "/create/notes?id=u1"],
    ["/items/upload?category=science", "/create/import?category=science"],
    ["/items/bulk-create?category=x&keywords=a", "/create/import?category=x&keywords=a"],
  ])("sends %s to %s keeping query and hash", async (from, to) => {
    renderApp(from);
    expect(await screen.findByTestId("where")).toHaveTextContent(to);
  });

  it("serves /create to anonymous visitors without a login redirect", async () => {
    authState.isAuthenticated = false;
    renderApp("/create");
    expect(await screen.findByTestId("where")).toHaveTextContent("/create");
  });

  it("uses the new path as the return-to for anonymous visitors", async () => {
    authState.isAuthenticated = false;
    renderApp("/study-guide/upload?id=u1");
    expect(await screen.findByTestId("where")).toHaveTextContent("/login?returnTo=%2Fcreate%2Fnotes%3Fid%3Du1");
  });

  it("keeps /admin/import behind the admin route guard (AC 5.13.1)", async () => {
    authState.isAuthenticated = false;
    renderApp("/admin/import");
    expect(await screen.findByTestId("where")).toHaveTextContent("/login?returnTo=%2Fadmin%2Fimport");
  });
});
