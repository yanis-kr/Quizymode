import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import ContentComplianceNotice from "./ContentComplianceNotice";
import { usersApi } from "@/api/users";

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({ isAuthenticated: true }),
}));

vi.mock("@/api/users", () => ({
  usersApi: { getSettings: vi.fn(), updateSetting: vi.fn() },
}));

const LINE = "Before you add content: only add material you have the right to use.";
const TOGGLE = "Read the content rules";
const DISMISS = "I understand, don't show again";

// Legal wording: these must stay character for character.
const RULES = [
  "Only submit material you created or have the rights and permission to use.",
  "Do not submit personal, confidential, or private information about other people unless you are allowed to share it.",
  "Review AI-generated content for accuracy before saving or sharing it.",
  "If you later put items into a public collection, those items may be visible to other users in that collection context.",
];
const POLICY_LINE = "Review the Terms of Service and Privacy Policy.";

function renderNotice() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <ContentComplianceNotice />
      </MemoryRouter>
    </QueryClientProvider>
  );
}

describe("ContentComplianceNotice (#901)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(usersApi.getSettings).mockResolvedValue({ settings: {} });
  });

  it("shows one line and a closed disclosure that hides the rules and the dismiss button (AC 4.7.10)", () => {
    const { container } = renderNotice();

    expect(screen.getByText(LINE)).toBeVisible();
    const toggle = screen.getByRole("button", { name: TOGGLE });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    const region = document.getElementById(toggle.getAttribute("aria-controls") ?? "");
    expect(region).toHaveAttribute("hidden");
    for (const rule of RULES) {
      expect(screen.getByText(rule)).not.toBeVisible();
    }
    expect(screen.queryByRole("list")).not.toBeInTheDocument();
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: DISMISS })).not.toBeInTheDocument();
    expect(screen.queryByRole("heading")).not.toBeInTheDocument();
    // Nothing but the line and the toggle sits outside the closed region.
    const outside = container.cloneNode(true) as HTMLElement;
    outside.querySelector("[hidden]")?.remove();
    expect(outside.textContent).toBe(`${LINE}▸${TOGGLE}`);
  });

  it("opens and closes from the keyboard with Enter and Space (AC 4.7.10)", async () => {
    const user = userEvent.setup({ delay: null });
    renderNotice();
    const toggle = screen.getByRole("button", { name: TOGGLE });

    await user.tab();
    expect(toggle).toHaveFocus();
    await user.keyboard("{Enter}");
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("list")).toBeVisible();
    await user.keyboard(" ");
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("list")).not.toBeInTheDocument();
    await user.keyboard(" ");
    expect(toggle).toHaveAttribute("aria-expanded", "true");

    // The links and the dismiss button follow in the tab order once open.
    await user.tab();
    expect(screen.getByRole("link", { name: "Terms of Service" })).toHaveFocus();
    await user.tab();
    expect(screen.getByRole("link", { name: "Privacy Policy" })).toHaveFocus();
    await user.tab();
    expect(screen.getByRole("button", { name: DISMISS })).toHaveFocus();
  });

  it("shows the four rules and the Terms and Privacy line with unchanged wording when open (AC 4.7.10)", async () => {
    const user = userEvent.setup({ delay: null });
    renderNotice();

    await user.click(screen.getByRole("button", { name: TOGGLE }));

    const bullets = screen.getAllByRole("listitem");
    expect(bullets.map((bullet) => bullet.textContent)).toEqual(RULES);
    for (const bullet of bullets) {
      expect(bullet).toBeVisible();
    }
    const terms = screen.getByRole("link", { name: "Terms of Service" });
    expect(terms).toHaveAttribute("href", "/terms");
    expect(screen.getByRole("link", { name: "Privacy Policy" })).toHaveAttribute("href", "/privacy");
    expect(terms.closest("p")?.textContent).toBe(POLICY_LINE);
    expect(terms.closest("p")).toBeVisible();
    expect(screen.getByRole("button", { name: DISMISS })).toBeVisible();
  });

  it("dismisses for good with I understand, don't show again (AC 4.7.9)", async () => {
    const user = userEvent.setup({ delay: null });
    vi.mocked(usersApi.updateSetting).mockImplementation(async ({ key, value }) => {
      vi.mocked(usersApi.getSettings).mockResolvedValue({ settings: { [key]: value } });
      return { key, value, updatedAt: "2026-11-27T00:00:00Z" };
    });
    renderNotice();

    await user.click(screen.getByRole("button", { name: TOGGLE }));
    await user.click(screen.getByRole("button", { name: DISMISS }));

    expect(usersApi.updateSetting).toHaveBeenCalledWith({
      key: "ContentComplianceNoticeDismissedV1",
      value: "true",
    });
    await waitFor(() => expect(screen.queryByText(LINE)).not.toBeInTheDocument());
  });

  it("shows nothing once it was dismissed (AC 4.7.9)", async () => {
    vi.mocked(usersApi.getSettings).mockResolvedValue({
      settings: { ContentComplianceNoticeDismissedV1: "true" },
    });
    renderNotice();

    await waitFor(() => expect(screen.queryByText(LINE)).not.toBeInTheDocument());
    expect(screen.queryByRole("button", { name: TOGGLE })).not.toBeInTheDocument();
  });
});
