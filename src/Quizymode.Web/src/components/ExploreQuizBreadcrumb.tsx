import { Link } from "react-router-dom";
import { ChevronRightIcon } from "@heroicons/react/24/outline";

interface ExploreQuizBreadcrumbProps {
  mode: "explore" | "quiz";
  categorySlug: string;
  categoryDisplayName: string;
  keywords: string[];
  onNavigate: (path: string) => void;
}

export function ExploreQuizBreadcrumb({
  mode,
  categorySlug,
  categoryDisplayName,
  keywords,
  onNavigate,
}: ExploreQuizBreadcrumbProps) {
  const basePath = `/${mode}`;
  const segments: { label: string; path: string }[] = [
    { label: categoryDisplayName, path: `${basePath}/${categorySlug}` },
  ];
  keywords.forEach((kw, i) => {
    const kws = keywords.slice(0, i + 1);
    segments.push({
      label: kw,
      path: `${basePath}/${categorySlug}?keywords=${kws.join(",")}`,
    });
  });

  return (
    <nav className="flex items-center gap-1 text-sm text-gray-600 flex-wrap">
      <Link to="/categories" className="text-indigo-600 hover:text-indigo-800">
        Categories
      </Link>
      {segments.map((seg, i) => (
        <span key={i} className="flex items-center gap-1">
          <ChevronRightIcon className="h-4 w-4 text-gray-400 flex-shrink-0" />
          <button
            onClick={() => onNavigate(seg.path)}
            className="text-indigo-600 hover:text-indigo-800"
            type="button"
          >
            {seg.label}
          </button>
        </span>
      ))}
    </nav>
  );
}
