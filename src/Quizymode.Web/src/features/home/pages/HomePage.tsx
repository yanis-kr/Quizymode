import { useMemo, useRef } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ArrowRightIcon, ChevronLeftIcon, ChevronRightIcon } from "@heroicons/react/24/outline";
import { SEO } from "@/components/SEO";
import { categoriesApi } from "@/api/categories";
import { useAuth } from "@/contexts/AuthContext";
import {
  featuredSetCards,
  HOME_SAMPLE_COLLECTION_ID,
  homeCategoryCards,
} from "../homePageData";

const numberFormatter = new Intl.NumberFormat("en-US");

function formatItemCount(count: number) {
  return `${numberFormatter.format(count)} item${count === 1 ? "" : "s"}`;
}

const HomePage = () => {
  const { isAuthenticated } = useAuth();
  const featuredRailRef = useRef<HTMLDivElement | null>(null);

  const { data: categoriesData } = useQuery({
    queryKey: ["home", "categories"],
    queryFn: () => categoriesApi.getAll(),
    retry: false,
    staleTime: 5 * 60 * 1000,
  });

  const countsByCategory = useMemo(() => {
    const map = new Map<string, number>();
    for (const category of categoriesData?.categories ?? []) {
      map.set(category.category.toLowerCase(), category.count);
    }
    return map;
  }, [categoriesData?.categories]);

  const scrollFeaturedRail = (direction: -1 | 1) => {
    const rail = featuredRailRef.current;
    if (!rail) {
      return;
    }

    rail.scrollBy({
      left: direction * Math.min(rail.clientWidth * 0.9, 960),
      behavior: "smooth",
    });
  };

  return (
    <>
      <SEO
        title="Quizymode"
        description="Browse Quizymode categories, jump into featured sets, and try a public sample collection."
        canonical="https://www.quizymode.com"
        structuredData={{
          "@context": "https://schema.org",
          "@type": "WebSite",
          name: "Quizymode",
          url: "https://www.quizymode.com",
          description:
            "Browse-first quiz platform with categories, featured sets, and public collections.",
        }}
      />

      <div className="bg-slate-950 text-slate-900">
        <section className="relative overflow-hidden bg-[radial-gradient(circle_at_top,#1e3a8a_0%,#0f172a_42%,#020617_100%)] text-white">
          <div className="absolute inset-0 opacity-30">
            <div className="absolute inset-y-0 left-[-8%] w-1/3 skew-x-[-24deg] bg-white/5" />
            <div className="absolute inset-y-0 left-[24%] w-24 rotate-12 bg-sky-400/20 blur-3xl" />
            <div className="absolute inset-y-0 right-[18%] w-20 -rotate-12 bg-indigo-300/20 blur-3xl" />
            <div className="absolute inset-x-0 bottom-0 h-40 bg-[linear-gradient(180deg,transparent_0%,rgba(2,6,23,0.92)_100%)]" />
          </div>

          <div className="relative mx-auto max-w-7xl px-4 py-20 sm:px-6 lg:px-8 lg:py-24">
            <div className="grid gap-10 lg:grid-cols-[minmax(0,1.15fr)_minmax(320px,420px)] lg:items-center">
              <div>
                <div className="inline-flex items-center rounded-full border border-white/15 bg-white/8 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-sky-100">
                  Quizymode Home
                </div>
                <h1 className="mt-6 max-w-3xl text-4xl font-semibold tracking-tight text-white sm:text-5xl lg:text-6xl">
                  Browse categories, open a set, and start learning immediately.
                </h1>
                <p className="mt-5 max-w-2xl text-lg leading-8 text-slate-200">
                  Quizymode is now the home page. Categories stay visible even when the data layer is unavailable,
                  and live counters appear automatically when the API comes back.
                </p>

                <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                  <Link
                    to="/categories"
                    className="inline-flex items-center justify-center gap-2 rounded-full bg-sky-500 px-6 py-3 text-sm font-semibold text-slate-950 transition hover:bg-sky-400"
                  >
                    Explore Categories
                    <ArrowRightIcon className="h-4 w-4" />
                  </Link>
                  <Link
                    to={`/collections/${HOME_SAMPLE_COLLECTION_ID}`}
                    className="inline-flex items-center justify-center gap-2 rounded-full border border-white/20 bg-white/10 px-6 py-3 text-sm font-semibold text-white transition hover:bg-white/15"
                  >
                    Open Sample Collection
                    <ArrowRightIcon className="h-4 w-4" />
                  </Link>
                </div>

                <div className="mt-4 text-sm text-slate-300">
                  {isAuthenticated ? (
                    <Link to="/items/add" className="font-medium text-sky-200 transition hover:text-white">
                      Add your own items
                    </Link>
                  ) : (
                    <Link to="/signup" className="font-medium text-sky-200 transition hover:text-white">
                      Create a free account
                    </Link>
                  )}{" "}
                  to build private or shared study flows.
                </div>
              </div>

              <div className="rounded-[32px] border border-white/12 bg-white/8 p-6 shadow-2xl shadow-slate-950/40 backdrop-blur">
                <div className="text-xs font-semibold uppercase tracking-[0.22em] text-sky-100">
                  Starter Collection
                </div>
                <div className="mt-3 text-3xl font-semibold text-white">
                  5 quick cards
                </div>
                <p className="mt-3 text-sm leading-7 text-slate-200">
                  A public sample collection seeded into the app so new users can open a working flow instantly.
                  It pulls five curated items across multiple Quizymode categories.
                </p>
                <div className="mt-6 grid gap-3 sm:grid-cols-2">
                  <div className="rounded-2xl border border-white/10 bg-slate-950/35 p-4">
                    <div className="text-xs uppercase tracking-[0.18em] text-slate-400">Includes</div>
                    <div className="mt-2 text-sm font-medium text-white">AWS, science, geography, languages, nature</div>
                  </div>
                  <div className="rounded-2xl border border-white/10 bg-slate-950/35 p-4">
                    <div className="text-xs uppercase tracking-[0.18em] text-slate-400">Best For</div>
                    <div className="mt-2 text-sm font-medium text-white">Demoing explore mode and quick quiz starts</div>
                  </div>
                </div>
                <Link
                  to={`/collections/${HOME_SAMPLE_COLLECTION_ID}`}
                  className="mt-6 inline-flex items-center gap-2 text-sm font-semibold text-sky-200 transition hover:text-white"
                >
                  View sample collection
                  <ArrowRightIcon className="h-4 w-4" />
                </Link>
              </div>
            </div>
          </div>
        </section>

        <section className="bg-[linear-gradient(180deg,#f8fafc_0%,#eef4ff_100%)]">
          <div className="mx-auto max-w-7xl px-4 py-14 sm:px-6 lg:px-8 lg:py-16">
            <div className="mb-8 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <div className="text-sm font-semibold uppercase tracking-[0.2em] text-sky-700">Categories</div>
                <h2 className="mt-2 text-3xl font-semibold tracking-tight text-slate-950 sm:text-4xl">
                  Explore all Quizymode categories
                </h2>
              </div>
              <div className="max-w-2xl text-sm leading-7 text-slate-600">
                The cards below are bundled with the frontend, so the homepage stays useful even if the database is
                offline. When the categories API responds, item counts appear automatically.
              </div>
            </div>

            <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
              {homeCategoryCards.map((category) => {
                const liveCount = countsByCategory.get(category.slug);

                return (
                  <Link
                    key={category.slug}
                    to={`/categories/${category.slug}`}
                    className="group relative overflow-hidden rounded-[28px] border border-slate-200 bg-slate-900 shadow-lg shadow-slate-300/40 transition duration-200 hover:-translate-y-1 hover:shadow-xl"
                  >
                    <img
                      src={category.image}
                      alt=""
                      className="absolute inset-0 h-full w-full object-cover transition duration-500 group-hover:scale-105"
                    />
                    <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(2,6,23,0.08)_0%,rgba(2,6,23,0.52)_44%,rgba(2,6,23,0.92)_100%)]" />
                    <div className="relative flex min-h-[260px] flex-col justify-end p-6 text-white">
                      {liveCount != null && (
                        <div className="absolute right-5 top-5 rounded-full border border-white/18 bg-slate-950/45 px-3 py-1 text-xs font-semibold text-sky-100 backdrop-blur">
                          {formatItemCount(liveCount)}
                        </div>
                      )}
                      <div className="text-xs font-semibold uppercase tracking-[0.22em] text-sky-200">Browse</div>
                      <div className="mt-2 flex items-center gap-2">
                        <h3 className="text-2xl font-semibold tracking-tight">{category.name}</h3>
                        <ArrowRightIcon className="h-5 w-5 text-sky-200 transition group-hover:translate-x-1" />
                      </div>
                      <p className="mt-3 max-w-md text-sm leading-6 text-slate-200">{category.description}</p>
                    </div>
                  </Link>
                );
              })}
            </div>
          </div>
        </section>

        <section className="bg-slate-950 pb-16 pt-2 text-white">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <div className="text-sm font-semibold uppercase tracking-[0.2em] text-sky-300">Featured Sets</div>
                <h2 className="mt-2 text-3xl font-semibold tracking-tight text-white sm:text-4xl">
                  Six clean entry points into the catalog
                </h2>
                <p className="mt-3 max-w-2xl text-sm leading-7 text-slate-300">
                  These links go straight into category scopes such as <span className="font-semibold text-sky-200">/exams/aws/saa-c03</span>.
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => scrollFeaturedRail(-1)}
                  className="inline-flex h-11 w-11 items-center justify-center rounded-full border border-white/12 bg-white/6 text-white transition hover:bg-white/12"
                  aria-label="Scroll featured sets left"
                >
                  <ChevronLeftIcon className="h-5 w-5" />
                </button>
                <button
                  type="button"
                  onClick={() => scrollFeaturedRail(1)}
                  className="inline-flex h-11 w-11 items-center justify-center rounded-full border border-white/12 bg-white/6 text-white transition hover:bg-white/12"
                  aria-label="Scroll featured sets right"
                >
                  <ChevronRightIcon className="h-5 w-5" />
                </button>
              </div>
            </div>

            <div
              ref={featuredRailRef}
              className="flex snap-x snap-mandatory gap-5 overflow-x-auto pb-4 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
            >
              {featuredSetCards.map((set) => (
                <Link
                  key={set.id}
                  to={set.path}
                  className="group min-w-[280px] max-w-[280px] snap-start overflow-hidden rounded-[28px] border border-white/10 bg-slate-900 shadow-lg shadow-slate-950/40 transition duration-200 hover:-translate-y-1 hover:border-sky-300/50 sm:min-w-[320px] sm:max-w-[320px]"
                >
                  <div className="relative h-48 overflow-hidden">
                    <img
                      src={set.image}
                      alt=""
                      className="h-full w-full object-cover transition duration-500 group-hover:scale-105"
                    />
                    <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(2,6,23,0.08)_0%,rgba(2,6,23,0.6)_100%)]" />
                  </div>
                  <div className="p-5">
                    <div className="text-xs font-semibold uppercase tracking-[0.22em] text-sky-300">{set.eyebrow}</div>
                    <h3 className="mt-2 text-xl font-semibold text-white">{set.title}</h3>
                    <p className="mt-3 text-sm leading-6 text-slate-300">{set.description}</p>
                    <div className="mt-5 inline-flex items-center gap-2 text-sm font-semibold text-sky-200">
                      Open set
                      <ArrowRightIcon className="h-4 w-4 transition group-hover:translate-x-1" />
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        </section>

        {typeof __BUILD_TIME__ !== "undefined" && (
          <div className="border-t border-slate-800 bg-slate-950 px-4 py-4 text-center text-xs text-slate-500">
            Built {new Date(__BUILD_TIME__).toLocaleString()}
          </div>
        )}
      </div>
    </>
  );
};

export default HomePage;
