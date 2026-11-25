import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import FeedbackDialog from "./FeedbackDialog";

const createMock = vi.hoisted(() => vi.fn());

vi.mock("@/api/feedback", () => ({
  feedbackApi: { create: createMock },
}));

const renderDialog = () => {
  const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <FeedbackDialog isOpen onClose={() => {}} />
    </QueryClientProvider>
  );
};

describe("FeedbackDialog page URL", () => {
  beforeEach(() => {
    createMock.mockReset();
    createMock.mockResolvedValue({
      id: "1",
      type: "generalFeedback",
      currentUrl: "x",
      details: "d",
      createdAt: "2026-01-01T00:00:00Z",
    });
  });

  afterEach(() => {
    window.history.pushState({}, "", "/");
  });

  it("shows and sends the page URL without query string or fragment", async () => {
    window.history.pushState({}, "", "/study/abc?token=synthetic-secret#frag=synthetic");
    renderDialog();

    const field = screen.getByLabelText("Current URL") as HTMLInputElement;
    expect(field.value).toBe(`${window.location.origin}/study/abc`);

    await userEvent.type(screen.getByLabelText("Feedback"), "Something is off");
    await userEvent.click(screen.getByRole("button", { name: "Submit" }));

    await waitFor(() => expect(createMock).toHaveBeenCalledTimes(1));
    expect(createMock.mock.calls[0][0].currentUrl).toBe(`${window.location.origin}/study/abc`);
  });

  it("sends an ordinary page URL unchanged", async () => {
    window.history.pushState({}, "", "/categories/aws");
    renderDialog();

    await userEvent.type(screen.getByLabelText("Feedback"), "Something is off");
    await userEvent.click(screen.getByRole("button", { name: "Submit" }));

    await waitFor(() => expect(createMock).toHaveBeenCalledTimes(1));
    expect(createMock.mock.calls[0][0].currentUrl).toBe(`${window.location.origin}/categories/aws`);
  });
});
