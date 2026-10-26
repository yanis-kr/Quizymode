import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import CreateImportPage from "./CreateImportPage";
import { taxonomyApi } from "@/api/taxonomy";

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({ isAuthenticated: true, isAdmin: false }),
}));

vi.mock("@/api/items", () => ({ itemsApi: { uploadToCollection: vi.fn() } }));

vi.mock("@/api/taxonomy", () => ({ taxonomyApi: { getAll: vi.fn(), suggest: vi.fn() } }));

vi.mock("@/features/legal/components/ContentComplianceNotice", () => ({ default: () => null }));

describe("CreateImportPage", () => {
  it("shows Paste text only for non-admins under an Import questions heading", async () => {
    vi.mocked(taxonomyApi.getAll).mockResolvedValue({ categories: [] });
    vi.mocked(taxonomyApi.suggest).mockResolvedValue({ suggestions: [] });

    render(
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <MemoryRouter initialEntries={["/create/import"]}>
          <CreateImportPage />
        </MemoryRouter>
      </QueryClientProvider>
    );

    expect(screen.getByRole("heading", { level: 1, name: "Import questions" })).toBeInTheDocument();
    // Non-admins get Paste text only: no JSON tab and no tablist.
    expect(screen.queryByRole("tab")).not.toBeInTheDocument();
    expect(screen.getByLabelText(/pasted text/i)).toBeInTheDocument();
    expect(await screen.findByRole("combobox", { name: /search topics/i })).toBeInTheDocument();
  });
});
