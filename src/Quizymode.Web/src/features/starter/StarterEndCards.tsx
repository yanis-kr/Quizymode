import { Link } from "react-router-dom";
import type { StarterPoolEntry } from "@/api/starter";
import { trackEventOnce } from "@/features/analytics/analyticsEvents";
import { ExploreNextTiles, type ExploreNextTile } from "@/components/study/ExploreNextTiles";
import { pickExploreWorlds } from "./composeStarterRun";
import { getStarterWorld } from "./starterWorlds";

interface StarterEndCardsProps {
  /** The finished run's questions in order; the cards come from its worlds. */
  run: StarterPoolEntry[];
  runId: string;
}

/**
 * "Explore next" (#462, AC 3.0.28): three cards from the worlds the player just saw, plus Explore all topics.
 * Each click sends starter_next_clicked once per run (position 1-3 cards, 5 explore all; 4 is Another random five).
 */
export function StarterEndCards({ run, runId }: StarterEndCardsProps) {
  const worlds = pickExploreWorlds(run);
  const track = (position: number, world: string | null) =>
    trackEventOnce(runId, {
      name: "starter_next_clicked",
      runId,
      position,
      contextType: "home",
      contextId: world ? `next:${world}` : "starter",
    });

  const tiles: ExploreNextTile[] = [];
  for (const id of worlds) {
    const world = getStarterWorld(id);
    if (world) tiles.push({ id, emoji: world.emoji, label: world.label, copy: world.copy, cta: world.cta, to: world.target });
  }

  return (
    <ExploreNextTiles
      heading="Explore next"
      tiles={tiles}
      onSelect={(position, id) => track(position, id)}
      footer={
        <div className="mt-3 text-center">
          <Link
            to="/categories"
            onClick={() => track(5, null)}
            className="inline-block rounded-md border border-gray-300 px-4 py-2 font-semibold text-gray-700 hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2"
          >
            Explore all topics
          </Link>
        </div>
      }
    />
  );
}
