import type { ReactNode } from "react";
import { Link } from "react-router-dom";

export interface ExploreNextTile {
  id: string;
  /** Decorative; hidden from assistive technology. */
  emoji?: string;
  label: string;
  copy: string;
  cta: string;
  to: string;
}

interface ExploreNextTilesProps {
  /** The h3 text; passed in so each caller keeps its own copy. */
  heading: string;
  tiles: ExploreNextTile[];
  /** Shows the heading with three skeleton tiles instead of the tiles. */
  loading?: boolean;
  /** Called with the 1-based tile position and id when a tile is followed. */
  onSelect?: (position: number, id: string) => void;
  /** Extra content under the tiles (for example the starter "Explore all topics" link). */
  footer?: ReactNode;
}

/**
 * "Explore next" tiles shared by the starter and Daily results (#462, #649). Presentational: with no tiles and nothing
 * loading it renders nothing, so a failed recommendation lookup never shows an error or blocks the result screen.
 */
export function ExploreNextTiles({ heading, tiles, loading = false, onSelect, footer }: ExploreNextTilesProps) {
  if (!loading && tiles.length === 0 && !footer) return null;
  return (
    <div className="mt-6 text-left" aria-busy={loading || undefined}>
      <h3 className="text-base font-semibold text-gray-900">{heading}</h3>
      {loading ? (
        <ul className="mt-2 grid grid-cols-1 gap-3 sm:grid-cols-3" aria-hidden="true">
          {[0, 1, 2].map((slot) => (
            <li key={slot} data-testid="explore-next-skeleton" className="h-28 animate-pulse rounded-lg bg-gray-100" />
          ))}
        </ul>
      ) : (
        tiles.length > 0 && (
          <ul className="mt-2 grid grid-cols-1 gap-3 sm:grid-cols-3">
            {tiles.map((tile, index) => (
              <li key={tile.id}>
                <Link
                  to={tile.to}
                  onClick={() => onSelect?.(index + 1, tile.id)}
                  className="block h-full min-h-[44px] rounded-lg border border-gray-200 bg-surface p-4 text-left hover:border-indigo-400 hover:bg-indigo-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
                >
                  {tile.emoji && (
                    <span aria-hidden="true" className="text-2xl">
                      {tile.emoji}
                    </span>
                  )}
                  <span className="mt-1 block font-semibold text-gray-900">{tile.label}</span>
                  <span className="mt-0.5 block text-sm text-gray-600">{tile.copy}</span>
                  <span className="mt-2 block text-sm font-semibold text-indigo-ink">{tile.cta}</span>
                </Link>
              </li>
            ))}
          </ul>
        )
      )}
      {footer}
    </div>
  );
}
