import { getToken } from "@/utils/tokenStorage";
import { API_URL } from "./client";

export const authApi = {
  logoutAudit: async (): Promise<void> => {
    const token = getToken();
    if (!token) {
      return;
    }

    try {
      await fetch(`${API_URL}/auth/logout`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
    } catch {
      // Best-effort audit call only; local sign-out must still proceed.
    }
  },
};
