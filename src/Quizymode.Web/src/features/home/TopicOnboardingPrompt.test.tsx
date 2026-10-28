import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render as rtlRender, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { interestsApi } from "@/api/learningLoop";
import { usersApi } from "@/api/users";
import { installMemoryLocalStorage } from "@/test/memoryStorage";
import { renderWithProviders } from "@/features/learningLoop/learningLoopTestUtils";
import { INTERESTS_QUERY_KEY } from "@/features/interests/useInterests";
import { TopicEditorProvider } from "@/features/interests/TopicEditorProvider";
import { clearLocalInterests, writeLocalInterests } from "@/features/learningLoop/localLearningState";
import { TopicOnboardingPrompt } from "./TopicOnboardingPrompt";

const auth = vi.hoisted(() => ({ value: { isAuthenticated: true, isLoading: false, userId: "user-1" as string | null } }));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => auth.value }));
vi.mock("@/api/learningLoop", () => ({ interestsApi: { get: vi.fn(), replace: vi.fn() } }));
vi.mock("@/api/users", () => ({ usersApi: { getSettings: vi.fn(), updateSetting: vi.fn() } }));

const render = () =>
  renderWithProviders(
    <TopicEditorProvider>
      <a href="/daily">Daily quiz</a>
      <TopicOnboardingPrompt />
    </TopicEditorProvider>,
  );

const card = () => screen.queryByRole("region", { name: "Make Home yours" });

describe("TopicOnboardingPrompt", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    installMemoryLocalStorage();
    window.sessionStorage.clear();
    auth.value = { isAuthenticated: true, isLoading: false, userId: "user-1" };
    vi.mocked(interestsApi.get).mockResolvedValue([]);
    vi.mocked(usersApi.getSettings).mockResolvedValue({ settings: {} });
    vi.mocked(usersApi.updateSetting).mockResolvedValue({ key: "TopicOnboarding", value: "dismissed", updatedAt: "" });
  });

  it("shows for a signed-in visitor with no topics and no recorded choice", async () => {
    render();
    expect(await screen.findByRole("region", { name: "Make Home yours" })).toBeInTheDocument();
    expect(screen.getByText(/Pick up to 10 topics and your Home puts them first/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Choose topics" })).toBeInTheDocument();
  });

  it("never shows to guests", async () => {
    auth.value = { isAuthenticated: false, isLoading: false, userId: null };
    render();
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(card()).not.toBeInTheDocument();
    expect(usersApi.getSettings).not.toHaveBeenCalled();
  });

  it("stays hidden while auth is still settling", async () => {
    auth.value = { isAuthenticated: true, isLoading: true, userId: "user-1" };
    render();
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(card()).not.toBeInTheDocument();
  });

  it("stays hidden when the account already has topics", async () => {
    vi.mocked(interestsApi.get).mockResolvedValue(["history"]);
    render();
    await waitFor(() => expect(interestsApi.get).toHaveBeenCalled());
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(card()).not.toBeInTheDocument();
  });

  it("stays hidden when the topics could not be loaded", async () => {
    vi.mocked(interestsApi.get).mockRejectedValue(new Error("down"));
    render();
    await waitFor(() => expect(interestsApi.get).toHaveBeenCalled());
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(card()).not.toBeInTheDocument();
  });

  it("stays hidden when the settings could not be loaded", async () => {
    vi.mocked(usersApi.getSettings).mockRejectedValue(new Error("down"));
    render();
    await waitFor(() => expect(usersApi.getSettings).toHaveBeenCalled());
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(card()).not.toBeInTheDocument();
  });

  it.each(["dismissed", "done"])("stays hidden when TopicOnboarding is already %s", async (value) => {
    vi.mocked(usersApi.getSettings).mockResolvedValue({ settings: { TopicOnboarding: value } });
    render();
    await waitFor(() => expect(usersApi.getSettings).toHaveBeenCalled());
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(card()).not.toBeInTheDocument();
  });

  it("stays hidden while browser-local picks wait to be claimed, and a failed claim keeps it hidden", async () => {
    writeLocalInterests(["history"]);
    render();
    await waitFor(() => expect(usersApi.getSettings).toHaveBeenCalled());
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(card()).not.toBeInTheDocument();
  });

  it("a successful claim never lets the card render: the merged list is seeded before the local copy clears", async () => {
    writeLocalInterests(["history"]);
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    rtlRender(
      <QueryClientProvider client={client}>
        <MemoryRouter>
          <TopicEditorProvider>
            <TopicOnboardingPrompt />
          </TopicEditorProvider>
        </MemoryRouter>
      </QueryClientProvider>,
    );
    await waitFor(() => expect(usersApi.getSettings).toHaveBeenCalled());
    await waitFor(() => expect(interestsApi.get).toHaveBeenCalled());

    // What GuestProgressClaim does: seed the merged list, then clear the local copy.
    act(() => {
      client.setQueryData(INTERESTS_QUERY_KEY("user-1"), ["history"]);
      clearLocalInterests();
    });
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(card()).not.toBeInTheDocument();
  });

  it("Choose topics opens the shared editor", async () => {
    render();
    fireEvent.click(await screen.findByRole("button", { name: "Choose topics" }));
    expect(await screen.findByRole("dialog", { name: "My topics" })).toBeInTheDocument();
  });

  it("Not now hides the card at once, records it, and moves focus to the next control", async () => {
    render();
    fireEvent.click(await screen.findByRole("button", { name: "Not now" }));

    expect(card()).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Daily quiz" })).toHaveFocus();
    expect(usersApi.updateSetting).toHaveBeenCalledWith({ key: "TopicOnboarding", value: "dismissed" });
  });

  it("Not now still hides the card for the page session when saving the dismissal fails", async () => {
    vi.mocked(usersApi.updateSetting).mockRejectedValue(new Error("down"));
    const first = render();
    fireEvent.click(await screen.findByRole("button", { name: "Not now" }));
    expect(card()).not.toBeInTheDocument();
    first.unmount();

    // A fresh mount in the same session (a new query client, so the server flag is unset again) stays hidden.
    render();
    await waitFor(() => expect(usersApi.getSettings).toHaveBeenCalledTimes(2));
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(card()).not.toBeInTheDocument();
  });
});
