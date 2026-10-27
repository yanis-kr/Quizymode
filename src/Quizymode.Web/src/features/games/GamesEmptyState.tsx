import { Link } from "react-router-dom";

interface GamesEmptyStateProps {
  quizPath: string;
}

/** Shown when a scope has fewer than GAME_MIN_ITEMS short, playable items (AC 3.20.3). */
export function GamesEmptyState({ quizPath }: GamesEmptyStateProps) {
  return (
    <section className="mx-auto mt-4 max-w-4xl rounded-lg bg-white p-6 text-center shadow">
      <h2 className="text-xl font-bold text-gray-900">Not enough short questions for games here</h2>
      <Link
        to={quizPath}
        className="mt-4 inline-flex min-h-[44px] items-center justify-center rounded-md bg-indigo-600 px-4 py-2 font-semibold text-white hover:bg-indigo-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2"
      >
        Open Quiz
      </Link>
    </section>
  );
}
