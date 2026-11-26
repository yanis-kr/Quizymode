import { Link, useLocation } from "react-router-dom";
import { SEO } from "@/components/SEO";

const BASE_LINK =
  "inline-flex min-h-[44px] items-center justify-center rounded-md px-4 text-sm font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500";
const PRIMARY_LINK = `${BASE_LINK} bg-indigo-600 text-white hover:bg-indigo-700`;
const OUTLINE_LINK = `${BASE_LINK} border border-gray-300 text-gray-700 hover:bg-gray-50`;

/** Shown for any address no route matches (#894). The HTTP status stays 200, so the page asks not to be indexed. */
const NotFoundPage = () => {
  const { pathname } = useLocation();

  return (
    <div className="mx-auto max-w-xl px-4 py-8 text-center sm:py-12">
      {/* Keyed by path: React puts a newly mounted title first, so this one wins over the Layout fallback title. */}
      <SEO key={pathname} title="Page not found" noindex />
      <h1 className="text-2xl font-bold text-gray-900 sm:text-3xl">Page not found</h1>
      <p className="mt-2 text-sm text-gray-600">The address may be mistyped, or the page may have moved.</p>
      <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:justify-center">
        <Link to="/start" className={PRIMARY_LINK}>
          Play a 5-question quiz
        </Link>
        <Link to="/search" className={OUTLINE_LINK}>
          Search
        </Link>
        <Link to="/" className={OUTLINE_LINK}>
          Home
        </Link>
      </div>
    </div>
  );
};

export default NotFoundPage;
