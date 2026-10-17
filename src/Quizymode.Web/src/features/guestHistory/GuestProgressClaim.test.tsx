import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { GuestProgressClaim } from "./GuestProgressClaim";

const { mockClaim, mockAuth } = vi.hoisted(() => ({
  mockClaim: vi.fn(),
  mockAuth: vi.fn(),
}));
vi.mock("./claimGuestProgress", () => ({ claimGuestProgress: mockClaim }));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: mockAuth }));

describe("GuestProgressClaim", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAuth.mockReturnValue({ isAuthenticated: true, isLoading: false });
  });

  it("does not claim for anonymous visitors", () => {
    mockAuth.mockReturnValue({ isAuthenticated: false, isLoading: false });
    const { container } = render(<GuestProgressClaim />);
    expect(mockClaim).not.toHaveBeenCalled();
    expect(container).toBeEmptyDOMElement();
  });

  it("confirms saved results", async () => {
    mockClaim.mockResolvedValue({ status: "saved", saved: 2, skipped: 0 });
    render(<GuestProgressClaim />);
    expect(await screen.findByRole("status")).toHaveTextContent("Saved 2 quiz results from this browser to your account");
  });

  it("renders nothing when there is nothing to claim", async () => {
    mockClaim.mockResolvedValue({ status: "none" });
    const { container } = render(<GuestProgressClaim />);
    await waitFor(() => expect(mockClaim).toHaveBeenCalledTimes(1));
    expect(container).toBeEmptyDOMElement();
  });

  it("offers a retry after a failure", async () => {
    mockClaim.mockResolvedValueOnce({ status: "failed", pending: 1 });
    mockClaim.mockResolvedValueOnce({ status: "saved", saved: 1, skipped: 0 });
    render(<GuestProgressClaim />);
    const retry = await screen.findByRole("button", { name: "Retry" });
    retry.click();
    expect(await screen.findByRole("status")).toHaveTextContent("Saved 1 quiz result from");
  });
});
