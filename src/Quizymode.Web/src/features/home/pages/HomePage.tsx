import { useMemo } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ArrowRightIcon } from "@heroicons/react/24/outline";
import { SEO } from "@/components/SEO";
import { categoriesApi } from "@/api/categories";
import { buildCollectionStudyPath } from "@/utils/collectionPath";
import {
  featuredSetCards,
  HOME_SAMPLE_COLLECTION_ID,
  HOME_SAMPLE_COLLECTION_NAME,
  homeCategoryCards,
} from "../homePageData";

const numberFormatter = new Intl.NumberFormat("en-US");

function formatItemCount(count: number) {
  return `${numberFormatter.format(count)} item${count === 1 ? "" : "s"}`;
}

const HomePage = () => {
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

      <div className="overflow-hidden bg-slate-950 text-white">
        <section className="relative overflow-hidden bg-[radial-gradient(circle_at_top,#1e3a8a_0%,#0f172a_42%,#020617_100%)]">
          <div className="absolute inset-0 opacity-30">
            <div className="absolute inset-y-0 left-[-8%] w-1/3 skew-x-[-24deg] bg-white/5" />
            <div className="absolute inset-y-0 left-[24%] w-24 rotate-12 bg-sky-400/20 blur-3xl" />
            <div className="absolute inset-y-0 right-[18%] w-20 -rotate-12 bg-indigo-300/20 blur-3xl" />
            <div className="absolute inset-x-0 bottom-0 h-40 bg-[linear-gradient(180deg,transparent_0%,rgba(2,6,23,0.92)_100%)]" />
          </div>

          <div className="relative mx-auto max-w-7xl px-4 py-3 sm:px-6 xl:h-[calc(100vh-4rem)] xl:max-h-[calc(100vh-4rem)] lg:px-8 lg:py-3">
            <div className="flex flex-col gap-3 xl:grid xl:h-full xl:min-h-0 xl:grid-rows-[minmax(0,0.3fr)_minmax(0,0.5fr)_minmax(0,0.2fr)]">
              <section className="rounded-[24px] border border-white/12 bg-white/8 p-4 shadow-2xl shadow-slate-950/30 backdrop-blur lg:flex lg:items-center lg:justify-between lg:gap-8 lg:px-6 lg:py-4 xl:min-h-0">
                <div className="max-w-3xl">
                  <h1 className="text-2xl font-semibold tracking-tight text-white sm:text-3xl lg:text-[2.35rem] lg:leading-tight">
                    Build, share, and study your own quizzes.
                  </h1>
                  <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-200 lg:text-base">
                    Browse a vast public question bank, upload your own questions, share collections, and turn study guides into private practice sets with AI-assisted import.
                  </p>
                </div>
                <div className="mt-4 flex shrink-0 items-center lg:mt-0">
                  <Link
                    to={buildCollectionStudyPath(
                      "quiz",
                      HOME_SAMPLE_COLLECTION_ID,
                      HOME_SAMPLE_COLLECTION_NAME
                    )}
                    className="inline-flex w-full items-center justify-center gap-2 rounded-full bg-[linear-gradient(135deg,#38bdf8_0%,#2563eb_100%)] px-7 py-3 text-sm font-semibold text-white shadow-lg shadow-sky-500/30 transition hover:scale-[1.02] hover:shadow-sky-400/40 sm:w-auto"
                  >
                    Try Sample Collection
                    <ArrowRightIcon className="h-4 w-4" />
                  </Link>
                </div>
              </section>

              <section className="rounded-[26px] bg-[linear-gradient(180deg,rgba(248,250,252,0.98)_0%,rgba(239,246,255,0.98)_100%)] p-4 text-slate-950 shadow-xl shadow-slate-950/25 lg:px-5 lg:py-4 xl:grid xl:min-h-0 xl:grid-rows-[auto_minmax(0,1fr)]">
                <div className="flex items-end justify-between gap-3">
                  <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">Explore Categories</h2>
                  <Link to="/categories" className="text-sm font-semibold text-sky-700 transition hover:text-sky-900">
                    View all
                  </Link>
                </div>

                <div className="mt-3 grid grid-cols-2 gap-2.5 md:grid-cols-3 xl:min-h-0 xl:grid-cols-4 xl:grid-rows-3">
                  {homeCategoryCards.map((category) => {
                    const liveCount = countsByCategory.get(category.slug);

                    return (
                      <Link
                        key={category.slug}
                        to={`/categories/${category.slug}`}
                        className="group relative isolate overflow-hidden rounded-[18px] border border-slate-200/80 bg-slate-900 shadow-md shadow-slate-300/20 transition duration-200 hover:-translate-y-0.5 hover:shadow-lg"
                      >
                        <img
                          src={category.image}
                          alt=""
                          className="absolute inset-0 h-full w-full object-cover transition duration-500 group-hover:scale-105"
                        />
                        <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(2,6,23,0.04)_0%,rgba(2,6,23,0.3)_42%,rgba(2,6,23,0.88)_100%)]" />
                        <div className="relative flex h-full min-h-[104px] flex-col justify-between p-3 text-white sm:min-h-[124px] xl:min-h-0">
                          <div className="flex justify-end">
                            {liveCount != null && (
                              <div className="rounded-full border border-white/18 bg-slate-950/45 px-2.5 py-1 text-[11px] font-semibold text-sky-100 backdrop-blur">
                                {formatItemCount(liveCount)}
                              </div>
                            )}
                          </div>
                          <div className="flex items-end justify-between gap-2">
                            <h3 className="text-base font-semibold leading-tight tracking-tight sm:text-lg lg:text-[1.02rem]">
                              {category.name}
                            </h3>
                            <ArrowRightIcon className="h-4 w-4 shrink-0 text-sky-200 transition group-hover:translate-x-1" />
                          </div>
                        </div>
                      </Link>
                    );
                  })}
                </div>
              </section>

              <section className="rounded-[24px] border border-white/10 bg-slate-950/70 p-3 shadow-xl shadow-slate-950/25 xl:grid xl:min-h-0 xl:grid-rows-[auto_minmax(0,1fr)]">
                <div className="flex items-center justify-between gap-3">
                  <div className="text-xs font-semibold uppercase tracking-[0.22em] text-sky-300">Quick Starts</div>
                </div>

                <div className="mt-2 flex gap-2.5 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                  {featuredSetCards.map((set) => (
                    <Link
                      key={set.id}
                      to={set.path}
                      className="group relative min-w-0 shrink-0 basis-[calc(50%-0.3125rem)] overflow-hidden rounded-[18px] border border-white/10 bg-slate-900/90 transition duration-200 hover:-translate-y-0.5 hover:border-sky-300/50 md:basis-[calc((100%-0.833rem)/3)] xl:basis-[calc((100%-1.875rem)/4)]"
                    >
                      <img
                        src={set.image}
                        alt=""
                        className="absolute inset-0 h-full w-full object-cover transition duration-500 group-hover:scale-105"
                      />
                      <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(2,6,23,0.05)_0%,rgba(2,6,23,0.78)_100%)]" />
                      <div className="relative flex h-full min-h-[104px] flex-col justify-between p-3 sm:min-h-[124px] xl:min-h-0">
                        <div className="text-[10px] font-semibold uppercase tracking-[0.2em] text-sky-300">{set.eyebrow}</div>
                        <div className="flex items-center justify-between gap-2">
                          <h3 className="text-sm font-semibold text-white">{set.title}</h3>
                          <ArrowRightIcon className="h-4 w-4 shrink-0 text-sky-200 transition group-hover:translate-x-1" />
                        </div>
                      </div>
                    </Link>
                  ))}
                </div>
              </section>
            </div>
          </div>
        </section>
      </div>
    </>
  );
};

export default HomePage;
