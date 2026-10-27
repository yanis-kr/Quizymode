import type { ViewMode } from "@/components/ModeSwitcher";

export type CategoryPageView = "sets" | "items";

const modesWithSets: ViewMode[] = ["sets", "list", "explore", "quiz", "learn", "games"];
const modesWithoutSets: ViewMode[] = ["list", "explore", "quiz", "learn", "games"];

export function getCategoryScopeModeConfig(
  requestedView: CategoryPageView,
  hideSetsMode: boolean
): {
  activeView: CategoryPageView;
  availableModes: ViewMode[];
} {
  return {
    activeView:
      hideSetsMode && requestedView === "sets" ? "items" : requestedView,
    availableModes: hideSetsMode ? modesWithoutSets : modesWithSets,
  };
}
