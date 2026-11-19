import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import LlmFindingsBanner from "./LlmFindingsBanner";

const getModelFindings = vi.hoisted(() => vi.fn());

vi.mock("@/api/adminLlmProviders", () => ({
  adminLlmProvidersApi: { getModelFindings },
}));

function renderBanner(isAdmin: boolean) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <LlmFindingsBanner isAdmin={isAdmin} />
      </MemoryRouter>
    </QueryClientProvider>
  );
}

describe("LlmFindingsBanner", () => {
  beforeEach(() => {
    getModelFindings.mockReset();
  });

  it("shows open findings with a link to the AI providers page for an admin", async () => {
    getModelFindings.mockResolvedValue({
      findings: [
        { id: "1", vendor: "OpenAI", model: "gpt-5-nano", kind: "ModelMissing", firstSeenUtc: "", lastSeenUtc: "" },
      ],
    });
    renderBanner(true);

    expect(await screen.findByRole("alert")).toHaveTextContent("OpenAI");
    expect(screen.getByText("gpt-5-nano")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Open AI providers" })).toHaveAttribute("href", "/admin/ai-providers");
  });

  it("AC 13.11 shows the singular sentence for exactly one finding (#792)", async () => {
    getModelFindings.mockResolvedValue({
      findings: [{ id: "1", vendor: "OpenAI", model: "gpt-5-nano", kind: "ModelMissing", firstSeenUtc: "", lastSeenUtc: "" }],
    });
    renderBanner(true);

    expect(await screen.findByText("A configured LLM model was not found in its vendor's model list.")).toBeInTheDocument();
  });

  it("AC 13.10 shows the plural sentence for two or more findings (#792)", async () => {
    getModelFindings.mockResolvedValue({
      findings: [
        { id: "1", vendor: "OpenAI", model: "gpt-5-nano", kind: "ModelMissing", firstSeenUtc: "", lastSeenUtc: "" },
        { id: "2", vendor: "Anthropic", model: "claude-x", kind: "ModelMissing", firstSeenUtc: "", lastSeenUtc: "" },
      ],
    });
    renderBanner(true);

    expect(
      await screen.findByText("Some configured LLM models were not found in their vendors' model lists.")
    ).toBeInTheDocument();
  });

  it("is hidden when there are no findings", async () => {
    getModelFindings.mockResolvedValue({ findings: [] });
    renderBanner(true);

    await waitFor(() => expect(getModelFindings).toHaveBeenCalled());
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("is hidden and makes no request for a non-admin", () => {
    renderBanner(false);

    expect(getModelFindings).not.toHaveBeenCalled();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});
