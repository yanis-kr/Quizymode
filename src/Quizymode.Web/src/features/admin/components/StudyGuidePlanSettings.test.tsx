import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { StudyGuidePlanSettings } from "./StudyGuidePlanSettings";
import { adminApi } from "@/api/admin";
import { diffPlanSettings } from "../studyGuidePlanSchema";

vi.mock("@/api/admin", () => ({
  adminApi: { updateUserSetting: vi.fn() },
}));

function renderPanel(settings: Record<string, string>) {
  return render(
    <QueryClientProvider client={new QueryClient()}>
      <StudyGuidePlanSettings userId="u1" settings={settings} />
    </QueryClientProvider>
  );
}

describe("StudyGuidePlanSettings", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(adminApi.updateUserSetting).mockResolvedValue({ key: "k", value: "v", updatedAt: "2026-10-17T00:00:00Z" });
  });

  it("saves the Premium checkbox as the StudyGuidePremium setting", async () => {
    renderPanel({});

    const premium = screen.getByLabelText("Premium");
    expect(premium).not.toBeChecked();
    expect(screen.getByText("10 / day, 60 / month")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save plan" })).toBeDisabled();

    fireEvent.click(premium);
    expect(screen.getByText("50 / day, 1000 / month")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Save plan" }));

    await waitFor(() => expect(adminApi.updateUserSetting).toHaveBeenCalledWith("u1", "StudyGuidePremium", "true"));
    expect(adminApi.updateUserSetting).toHaveBeenCalledTimes(1);
    expect(await screen.findByText("Study guide plan saved.")).toBeInTheDocument();
  });

  it("saves section overrides and validates them", async () => {
    renderPanel({ StudyGuidePremium: "true", StudyGuideDailySections: "80" });

    expect(screen.getByLabelText("Premium")).toBeChecked();
    expect(screen.getByLabelText("Daily sections override")).toHaveValue(80);

    fireEvent.change(screen.getByLabelText("Monthly sections override"), { target: { value: "200000" } });
    fireEvent.click(screen.getByRole("button", { name: "Save plan" }));
    expect(await screen.findByText(/monthly sections must be 100,000 or less/i)).toBeInTheDocument();
    expect(adminApi.updateUserSetting).not.toHaveBeenCalled();

    fireEvent.change(screen.getByLabelText("Monthly sections override"), { target: { value: "2000" } });
    fireEvent.change(screen.getByLabelText("Daily sections override"), { target: { value: "" } });
    fireEvent.click(screen.getByRole("button", { name: "Save plan" }));

    await waitFor(() => expect(adminApi.updateUserSetting).toHaveBeenCalledTimes(2));
    expect(adminApi.updateUserSetting).toHaveBeenCalledWith("u1", "StudyGuideDailySections", "");
    expect(adminApi.updateUserSetting).toHaveBeenCalledWith("u1", "StudyGuideMonthlySections", "2000");
  });
});

describe("diffPlanSettings", () => {
  it("only reports changed keys", () => {
    expect(
      diffPlanSettings({ StudyGuidePremium: "false" }, { premium: false, dailySections: "", monthlySections: "" })
    ).toEqual([]);
    expect(
      diffPlanSettings({}, { premium: false, dailySections: " 5 ", monthlySections: "" })
    ).toEqual([{ key: "StudyGuideDailySections", value: "5" }]);
  });
});
