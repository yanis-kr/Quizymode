import { apiClient } from "./client";
import type { GameRosterResponse } from "@/types/api";

export const gamesApi = {
  /**
   * Random game-eligible items for 0 to 10 `category[/l1[/l2]]` scopes (none = every category). The server applies the
   * short-text rule before sampling, so sparse scopes still return their playable items (AC 3.20.26).
   */
  getRoster: async (scopes: string[], limit: number = 200): Promise<GameRosterResponse> => {
    const params = new URLSearchParams();
    for (const scope of scopes) params.append("scope", scope);
    params.set("limit", String(limit));
    const response = await apiClient.get<GameRosterResponse>("/games/roster", { params });
    return response.data;
  },
};
