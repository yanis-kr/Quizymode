import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import AdminImportPage from "./AdminImportPage";
import { taxonomyApi } from "@/api/taxonomy";

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({ isAuthenticated: true, isAdmin: true }),
}));

vi.mock("@/api/items", () => ({ itemsApi: { uploadToCollection: vi.fn() } }));

vi.mock("@/api/taxonomy", () => ({ taxonomyApi: { getAll: vi.fn(), suggest: vi.fn() } }));

vi.mock("@/features/legal/components/ContentComplianceNotice", () => ({ default: () => null }));

describe("AdminImportPage", () => {
  it("opens on the JSON tab under an Import heading and offers both tabs", async () => {
    // AC 5.13.2
    vi.mocked(taxonomyApi.getAll).mockResolvedValue({ categories: [] });
    vi.mocked(taxonomyApi.suggest).mockResolvedValue({ suggestions: [] });

    render(
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <MemoryRouter initialEntries={["/admin/import"]}>
          <AdminImportPage />
        </MemoryRouter>
      </QueryClientProvider>
    );

    expect(screen.getByRole("heading", { level: 1, name: "Import" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "JSON", selected: true })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Paste text" })).toBeInTheDocument();
    expect(await screen.findByRole("combobox", { name: /search topics/i })).toBeInTheDocument();
  });
});
