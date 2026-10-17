import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import AdminAiProvidersPage from "./AdminAiProvidersPage";
import { adminLlmProvidersApi, type LlmProvidersResponse } from "@/api/adminLlmProviders";

const mockUseAuth = vi.fn();
vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => mockUseAuth(),
}));

vi.mock("@/api/adminLlmProviders", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/api/adminLlmProviders")>();
  return {
    ...actual,
    adminLlmProvidersApi: { get: vi.fn(), update: vi.fn(), getAttempts: vi.fn() },
  };
});

const settings: LlmProvidersResponse = {
  vendors: [
    { vendor: "DeepSeek", keyConfigured: true, model: "deepseek-flash" },
    { vendor: "OpenAI", keyConfigured: false, model: "gpt-5-nano" },
    { vendor: "Gemini", keyConfigured: true, model: "gemini-2.5-flash-lite" },
  ],
  routes: { free: ["Gemini", "OpenAI", "DeepSeek"], premium: ["DeepSeek", "OpenAI", "Gemini"] },
  monthlySectionBudget: 1000,
  monthlySectionsUsed: 250,
};

function renderPage() {
  return render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <MemoryRouter initialEntries={["/admin/ai-providers"]}>
        <Routes>
          <Route path="/admin/ai-providers" element={<AdminAiProvidersPage />} />
          <Route path="/" element={<div data-testid="home">Home</div>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

function routeItems(label: string): string[] {
  const section = screen.getByRole("region", { name: label });
  return within(section)
    .getAllByRole("listitem")
    .map((item) => item.textContent ?? "");
}

describe("AdminAiProvidersPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseAuth.mockReturnValue({ isAuthenticated: true, isAdmin: true });
    vi.mocked(adminLlmProvidersApi.get).mockResolvedValue(settings);
    vi.mocked(adminLlmProvidersApi.update).mockImplementation(async (request) => ({
      ...settings,
      vendors: settings.vendors.map((vendor) => ({
        ...vendor,
        model: request.vendors.find((entry) => entry.vendor === vendor.vendor)?.model ?? vendor.model,
      })),
      routes: request.routes,
    }));
    vi.mocked(adminLlmProvidersApi.getAttempts).mockResolvedValue({
      attempts: [
        {
          createdUtc: "2026-10-17T10:00:00Z",
          vendor: "Gemini",
          model: "gemini-2.5-flash-lite",
          outcome: "LowQuoteYield",
          inputTokens: 1200,
          outputTokens: 800,
          durationMs: 4200,
        },
      ],
    });
  });

  it("redirects non-admins", () => {
    mockUseAuth.mockReturnValue({ isAuthenticated: true, isAdmin: false });
    renderPage();
    expect(screen.getByTestId("home")).toBeInTheDocument();
  });

  it("shows key badges as text, models, budget and recent attempts", async () => {
    renderPage();

    expect(await screen.findByLabelText("Model for DeepSeek")).toHaveValue("deepseek-flash");
    expect(screen.getAllByText("Key configured")).toHaveLength(2);
    expect(screen.getByText("No key")).toBeInTheDocument();
    expect(screen.getByText(/250 of 1,000 sections generated this month/)).toBeInTheDocument();
    expect(screen.getByRole("progressbar", { name: /monthly section budget/i })).toHaveAttribute("aria-valuenow", "25");
    expect(await screen.findByText("LowQuoteYield")).toBeInTheDocument();
    expect(screen.getByText("1200 / 800")).toBeInTheDocument();
  });

  it("reorders routes with keyboard-operable buttons and saves", async () => {
    renderPage();
    await screen.findByLabelText("Model for DeepSeek");

    expect(routeItems("Free route")[0]).toMatch(/Gemini/);
    const moveUp = screen.getByRole("button", { name: "Move OpenAI up in Free route" });
    moveUp.focus();
    fireEvent.click(moveUp);
    expect(routeItems("Free route")[0]).toMatch(/OpenAI/);
    expect(screen.getByRole("button", { name: "Move OpenAI up in Free route" })).toBeDisabled();

    fireEvent.click(screen.getByRole("button", { name: "Remove DeepSeek from Premium route" }));
    fireEvent.change(screen.getByLabelText("Model for OpenAI"), { target: { value: " gpt-5-mini " } });
    fireEvent.click(screen.getByRole("button", { name: "Save settings" }));

    await waitFor(() =>
      expect(adminLlmProvidersApi.update).toHaveBeenCalledWith({
        vendors: [
          { vendor: "DeepSeek", model: "deepseek-flash" },
          { vendor: "OpenAI", model: "gpt-5-mini" },
          { vendor: "Gemini", model: "gemini-2.5-flash-lite" },
        ],
        routes: { free: ["OpenAI", "Gemini", "DeepSeek"], premium: ["OpenAI", "Gemini"] },
      })
    );
    expect(await screen.findByText("AI provider settings saved.")).toBeInTheDocument();
  });

  it("can add a removed vendor back to a route", async () => {
    renderPage();
    await screen.findByLabelText("Model for DeepSeek");

    fireEvent.click(screen.getByRole("button", { name: "Remove Gemini from Free route" }));
    fireEvent.change(screen.getByLabelText("Add vendor to Free route"), { target: { value: "Gemini" } });
    fireEvent.click(within(screen.getByRole("region", { name: "Free route" })).getByRole("button", { name: "Add" }));

    expect(routeItems("Free route").at(-1)).toMatch(/Gemini/);
  });

  it("validates models and empty routes before saving", async () => {
    renderPage();
    await screen.findByLabelText("Model for DeepSeek");

    fireEvent.change(screen.getByLabelText("Model for Gemini"), { target: { value: "bad model!" } });
    fireEvent.click(screen.getByRole("button", { name: "Save settings" }));
    expect(await screen.findByText(/Gemini: Model may contain only/)).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Model for Gemini"), { target: { value: "gemini-2.5-flash" } });
    for (const vendor of ["DeepSeek", "OpenAI", "Gemini"]) {
      fireEvent.click(screen.getByRole("button", { name: `Remove ${vendor} from Premium route` }));
    }
    fireEvent.click(screen.getByRole("button", { name: "Save settings" }));
    expect(await screen.findByText(/premium route needs at least one vendor/i)).toBeInTheDocument();
    expect(adminLlmProvidersApi.update).not.toHaveBeenCalled();
  });
});
