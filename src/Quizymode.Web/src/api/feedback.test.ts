import { beforeEach, describe, expect, it, vi } from "vitest";
import { feedbackApi } from "./feedback";

const { mockPost } = vi.hoisted(() => ({ mockPost: vi.fn() }));

vi.mock("./client", () => ({
  apiClient: { post: mockPost },
}));

describe("feedbackApi", () => {
  beforeEach(() => vi.clearAllMocks());

  it("create calls POST /feedback with data", async () => {
    const data = { id: "f1", createdAt: "2024-01-01" };
    mockPost.mockResolvedValueOnce({ data });
    const payload = { message: "Great app!", feedbackType: "general" };
    const result = await feedbackApi.create(payload as never);
    expect(mockPost).toHaveBeenCalledWith("/feedback", payload);
    expect(result).toEqual(data);
  });
});
