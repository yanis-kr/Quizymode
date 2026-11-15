import { Link } from "react-router-dom";

/** Compact first-screen entry to the Fun expressions set (#664, AC 3.0.36). */
export function FunExpressionsLink() {
  return (
    <Link
      to="/categories/languages?keywords=idioms,funny&view=items"
      className="inline-flex min-h-[44px] w-full items-center justify-center rounded-full px-4 text-sm font-semibold text-sky-ink underline-offset-4 transition hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-200 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950 sm:w-auto"
    >
      Fun expressions
    </Link>
  );
}
