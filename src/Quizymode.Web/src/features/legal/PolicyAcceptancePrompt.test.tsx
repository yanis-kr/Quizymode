import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { PolicyAcceptancePrompt } from "./PolicyAcceptancePrompt";

const { mockAuth, mockStatus, mockRecord, mockLogout } = vi.hoisted(() => ({
  mockAuth: vi.fn(),
  mockStatus: vi.fn(),
  mockRecord: vi.fn(),
  mockLogout: vi.fn(),
}));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: mockAuth }));
vi.mock("@/api/users", () => ({
  usersApi: { getPolicyAcceptanceStatus: mockStatus, recordPolicyAcceptances: mockRecord },
}));

const signedIn = { isAuthenticated: true, isLoading: false, userId: "u1", policyAcceptancesSynced: true, logout: mockLogout };

const noAcceptances = {
  needsAcceptance: true,
  policies: [
    { policyType: "TermsOfService", currentVersion: "2026-03-29", acceptedVersion: null, needsAcceptance: true },
    { policyType: "PrivacyPolicy", currentVersion: "2026-10-17", acceptedVersion: null, needsAcceptance: true },
  ],
};
const outdatedPrivacy = {
  needsAcceptance: true,
  policies: [
    { policyType: "TermsOfService", currentVersion: "2026-03-29", acceptedVersion: "2026-03-29", needsAcceptance: false },
    { policyType: "PrivacyPolicy", currentVersion: "2026-10-17", acceptedVersion: "2026-10-16", needsAcceptance: true },
  ],
};
const allCurrent = {
  needsAcceptance: false,
  policies: [
    { policyType: "TermsOfService", currentVersion: "2026-03-29", acceptedVersion: "2026-03-29", needsAcceptance: false },
    { policyType: "PrivacyPolicy", currentVersion: "2026-10-17", acceptedVersion: "2026-10-17", needsAcceptance: false },
  ],
};

function renderPrompt(path = "/") {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[path]}>
        <PolicyAcceptancePrompt />
      </MemoryRouter>
    </QueryClientProvider>
  );
}

describe("PolicyAcceptancePrompt", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAuth.mockReturnValue(signedIn);
  });

  it("asks a user with no acceptances, focuses the dialog, and records both current versions", async () => {
    mockStatus.mockResolvedValueOnce(noAcceptances).mockResolvedValueOnce(allCurrent);
    mockRecord.mockResolvedValue({ acceptances: [] });
    renderPrompt();

    const dialog = await screen.findByRole("dialog", { name: "Please accept our Terms and Privacy Policy" });
    expect(screen.getByRole("heading", { name: "Please accept our Terms and Privacy Policy" })).toHaveFocus();
    expect(dialog).toHaveAttribute("aria-modal", "true");
    expect(screen.getByRole("link", { name: "Terms of Service" })).toHaveAttribute("href", "/terms");
    expect(screen.getByRole("link", { name: "Privacy Policy" })).toHaveAttribute("href", "/privacy");

    await userEvent.click(screen.getByRole("button", { name: "Accept and continue" }));

    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(mockRecord).toHaveBeenCalledTimes(1);
    const { acceptances } = mockRecord.mock.calls[0][0];
    expect(acceptances).toEqual([
      { policyType: "TermsOfService", policyVersion: "2026-03-29", acceptedAtUtc: expect.any(String) },
      { policyType: "PrivacyPolicy", policyVersion: "2026-10-17", acceptedAtUtc: expect.any(String) },
    ]);
  });

  it("asks only for the outdated Privacy Policy", async () => {
    mockStatus.mockResolvedValue(outdatedPrivacy);
    mockRecord.mockResolvedValue({ acceptances: [] });
    renderPrompt();

    await screen.findByRole("dialog", { name: "We've updated our Terms and Privacy Policy" });
    expect(screen.getByText(/updated 2026-10-17 \(you accepted 2026-10-16\)/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Accept and continue" }));

    await waitFor(() => expect(mockRecord).toHaveBeenCalledTimes(1));
    expect(mockRecord.mock.calls[0][0].acceptances).toEqual([
      { policyType: "PrivacyPolicy", policyVersion: "2026-10-17", acceptedAtUtc: expect.any(String) },
    ]);
  });

  it("does not prompt a user whose acceptances are current", async () => {
    mockStatus.mockResolvedValue(allCurrent);
    const { container } = renderPrompt();
    await waitFor(() => expect(mockStatus).toHaveBeenCalledTimes(1));
    expect(container).toBeEmptyDOMElement();
  });

  it("waits for the signup acceptance sync before checking, so a new account is not asked twice", () => {
    mockAuth.mockReturnValue({ ...signedIn, policyAcceptancesSynced: false });
    renderPrompt();
    expect(mockStatus).not.toHaveBeenCalled();
  });

  it("never checks for signed-out visitors", () => {
    mockAuth.mockReturnValue({ ...signedIn, isAuthenticated: false, userId: null, policyAcceptancesSynced: false });
    const { container } = renderPrompt();
    expect(mockStatus).not.toHaveBeenCalled();
    expect(container).toBeEmptyDOMElement();
  });

  it("keeps the prompt with a retry when recording fails, and never claims success", async () => {
    mockStatus.mockResolvedValue(noAcceptances);
    mockRecord.mockRejectedValueOnce(new Error("network")).mockResolvedValueOnce({ acceptances: [] });
    renderPrompt();

    await userEvent.click(await screen.findByRole("button", { name: "Accept and continue" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("We couldn't record your acceptance");
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Try again" }));
    await waitFor(() => expect(mockRecord).toHaveBeenCalledTimes(2));
  });

  it("stays out of the way on the legal pages so they can be read", async () => {
    mockStatus.mockResolvedValue(noAcceptances);
    const { container } = renderPrompt("/privacy");
    await waitFor(() => expect(mockStatus).toHaveBeenCalledTimes(1));
    expect(container).toBeEmptyDOMElement();
  });

  it("lets the user sign out instead", async () => {
    mockStatus.mockResolvedValue(noAcceptances);
    mockLogout.mockResolvedValue(undefined);
    renderPrompt();
    await userEvent.click(await screen.findByRole("button", { name: "Sign out" }));
    expect(mockLogout).toHaveBeenCalledTimes(1);
    expect(mockRecord).not.toHaveBeenCalled();
  });
});
