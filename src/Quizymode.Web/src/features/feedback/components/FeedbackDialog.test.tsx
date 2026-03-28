import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import FeedbackDialog from "./FeedbackDialog";
import { feedbackApi } from "@/api/feedback";

vi.mock("@/api/feedback", () => ({
  feedbackApi: {
    create: vi.fn(),
  },
}));

function renderDialog(
  initialType: "reportIssue" | "requestItems" | "generalFeedback" = "generalFeedback"
) {
  const queryClient = new QueryClient({
    defaultOptions: {
      mutations: {
        retry: false,
      },
    },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <FeedbackDialog
        isOpen
        onClose={() => undefined}
        initialType={initialType}
        defaultEmail="signed@example.com"
      />
    </QueryClientProvider>
  );
}

describe("FeedbackDialog", () => {
  it("prefills the signed-in email and current URL", () => {
    window.history.pushState({}, "", "/collections/123?tab=mine");

    renderDialog();

    expect(screen.getByLabelText(/email/i)).toHaveValue("signed@example.com");
    expect(screen.getByLabelText(/current url/i)).toHaveValue(window.location.href);
  });

  it("shows additional keywords only for item requests", async () => {
    const user = userEvent.setup();

    renderDialog("reportIssue");

    expect(screen.queryByLabelText(/additional keywords/i)).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /ask for more items/i }));

    expect(screen.getByLabelText(/additional keywords/i)).toBeInTheDocument();
  });

  it("submits the expected payload", async () => {
    const user = userEvent.setup();

    vi.mocked(feedbackApi.create).mockResolvedValue({
      id: "feedback-1",
      type: "requestItems",
      currentUrl: window.location.href,
      details: "Please add more AWS practice items.",
      email: "signed@example.com",
      additionalKeywords: "aws,saa",
      userId: null,
      createdAt: new Date().toISOString(),
    });

    renderDialog("requestItems");

    await user.type(
      screen.getByLabelText(/what items should we add/i),
      "Please add more AWS practice items."
    );
    await user.type(screen.getByLabelText(/additional keywords/i), "aws,saa");
    await user.click(screen.getByRole("button", { name: /^submit$/i }));

    expect(feedbackApi.create).toHaveBeenCalledWith({
      type: "requestItems",
      currentUrl: window.location.href,
      details: "Please add more AWS practice items.",
      email: "signed@example.com",
      additionalKeywords: "aws,saa",
    });
    expect(
      await screen.findByRole("heading", { name: /thanks for the feedback/i })
    ).toBeInTheDocument();
  });
});
