import { ExploreNextTiles, type ExploreNextTile } from "@/components/study/ExploreNextTiles";
import { relatedSetsFor, showsChangeOfPace, type RelatedSetRef } from "./relatedSets";
import { quizPathForScope } from "./keepGoingPaths";
import { useExploreNextSets } from "./useExploreNextSets";

interface KeepGoingProps {
  /** Scope path of the set just finished: category followed by its navigation keywords. */
  scope: string;
  /** Called with the 1-based tile position and the tile id when a tile is followed (analytics). */
  onSelect?: (position: number, id: string) => void;
}

function toTile(ref: RelatedSetRef, prefix: string): ExploreNextTile {
  return { id: `${prefix}${ref.scope}`, label: ref.label, cta: "Play 5", to: quizPathForScope(ref.scope) };
}

/**
 * "Keep going" after a normal run (#711): up to two related sets and, for exam and tech scopes, one tile under
 * "Change of pace". A scope missing from the map falls back to the ranked recommendations with no label.
 */
export function KeepGoing({ scope, onSelect }: KeepGoingProps) {
  const mapped = relatedSetsFor(scope);
  if (!mapped) return <KeepGoingFallback onSelect={onSelect} />;

  const related = mapped.related.map((ref) => toTile(ref, ""));
  const pace = mapped.changeOfPace && showsChangeOfPace(scope) ? toTile(mapped.changeOfPace, "pace:") : null;
  return (
    <div data-testid="keep-going">
      <ExploreNextTiles heading="Keep going" tiles={related} onSelect={(position, id) => onSelect?.(position, id)} />
      {pace && (
        <ExploreNextTiles
          heading="Change of pace"
          tiles={[pace]}
          onSelect={(_position, id) => onSelect?.(related.length + 1, id)}
        />
      )}
    </div>
  );
}

/** Fallback for a scope with no map entry: the existing ranked recommendations, three tiles, no label. */
function KeepGoingFallback({ onSelect }: { onSelect?: (position: number, id: string) => void }) {
  const { tiles, isLoading } = useExploreNextSets(3);
  // A category-only card has no set to play, so its link would drop the navigation keywords (AC4). Keep set links only.
  const setTiles = tiles.filter((tile) => /[?&](nav|keywords)=/.test(tile.to));
  if (!isLoading && setTiles.length === 0) return null;
  return (
    <div data-testid="keep-going">
      <ExploreNextTiles
        heading="Keep going"
        tiles={setTiles}
        loading={isLoading}
        onSelect={(position, id) => onSelect?.(position, id)}
      />
    </div>
  );
}
