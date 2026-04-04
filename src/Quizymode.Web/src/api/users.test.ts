import { beforeEach, describe, expect, it, vi } from "vitest";
import { usersApi } from "./users";

const { mockGet, mockPut, mockPost } = vi.hoisted(() => ({
  mockGet: vi.fn(),
  mockPut: vi.fn(),
  mockPost: vi.fn(),
}));

vi.mock("./client", () => ({
  apiClient: {
    get: mockGet,
    put: mockPut,
    post: mockPost,
  },
}));

describe("usersApi", () => {
  beforeEach(() => vi.clearAllMocks());

  describe("getCurrent", () => {
    it("calls GET /users/me and returns data", async () => {
      const user = { id: "abc", name: "Alice", email: "a@example.com" };
      mockGet.mockResolvedValueOnce({ data: user });

      const result = await usersApi.getCurrent();

      expect(mockGet).toHaveBeenCalledWith("/users/me");
      expect(result).toEqual(user);
    });
  });

  describe("updateName", () => {
    it("calls PUT /users/me with name payload", async () => {
      const updated = { id: "abc", name: "Bob" };
      mockPut.mockResolvedValueOnce({ data: updated });

      const result = await usersApi.updateName({ name: "Bob" });

      expect(mockPut).toHaveBeenCalledWith("/users/me", { name: "Bob" });
      expect(result).toEqual(updated);
    });
  });

  describe("checkAvailability", () => {
    it("calls GET /users/availability with username and email params", async () => {
      const response = { isUsernameAvailable: true, isEmailAvailable: true };
      mockGet.mockResolvedValueOnce({ data: response });

      const result = await usersApi.checkAvailability({ username: "alice", email: "a@example.com" });

      expect(mockGet).toHaveBeenCalledWith(expect.stringContaining("/users/availability"));
      const url = mockGet.mock.calls[0][0] as string;
      expect(url).toContain("username=alice");
      expect(url).toContain("email=");
      expect(result).toEqual(response);
    });

    it("omits undefined params from query string", async () => {
      mockGet.mockResolvedValueOnce({ data: {} });

      await usersApi.checkAvailability({ username: "alice" });

      const url = mockGet.mock.calls[0][0] as string;
      expect(url).not.toContain("email");
    });
  });

  describe("getSettings", () => {
    it("calls GET /users/settings", async () => {
      const settings = { settings: { Theme: "dark" } };
      mockGet.mockResolvedValueOnce({ data: settings });

      const result = await usersApi.getSettings();

      expect(mockGet).toHaveBeenCalledWith("/users/settings");
      expect(result).toEqual(settings);
    });
  });

  describe("updateSetting", () => {
    it("calls PUT /users/settings with key-value payload", async () => {
      const response = { key: "Theme", value: "dark", updatedAt: "2024-01-01T00:00:00Z" };
      mockPut.mockResolvedValueOnce({ data: response });

      const result = await usersApi.updateSetting({ key: "Theme", value: "dark" });

      expect(mockPut).toHaveBeenCalledWith("/users/settings", { key: "Theme", value: "dark" });
      expect(result).toEqual(response);
    });
  });

  describe("recordPolicyAcceptances", () => {
    it("calls POST /users/policy-acceptances", async () => {
      const request = {
        acceptances: [
          { policyType: "TermsOfService", policyVersion: "1.0", acceptedAtUtc: "2024-01-01T00:00:00Z" },
        ],
      };
      const response = { acceptances: request.acceptances.map(a => ({ ...a, recordedAtUtc: "2024-01-01T00:00:00Z" })) };
      mockPost.mockResolvedValueOnce({ data: response });

      const result = await usersApi.recordPolicyAcceptances(request);

      expect(mockPost).toHaveBeenCalledWith("/users/policy-acceptances", request);
      expect(result).toEqual(response);
    });
  });
});
