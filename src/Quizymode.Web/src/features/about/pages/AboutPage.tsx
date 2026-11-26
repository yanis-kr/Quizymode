import { SEO } from "@/components/SEO";
import { AboutHero } from "../AboutHero";
import { AboutHookQuestion } from "../AboutHookQuestion";
import { AboutLearnWays } from "../AboutLearnWays";
import { AboutNotesToQuiz } from "../AboutNotesToQuiz";
import { AboutHabit } from "../AboutHabit";
import { AboutCollections } from "../AboutCollections";
import { AboutBuilt } from "../AboutBuilt";
import { AboutStory } from "../AboutStory";
import { ABOUT_CANONICAL, ABOUT_SEO_DESCRIPTION, ABOUT_SEO_TITLE } from "../aboutSeo";

/** `/about` (#883, #884): text-first sections in page order; a lazy route chunk (AC 8.2.1). */
const AboutPage = () => (
  <>
    <SEO title={ABOUT_SEO_TITLE} description={ABOUT_SEO_DESCRIPTION} canonical={ABOUT_CANONICAL} />
    <div className="mx-auto max-w-2xl px-2 py-4 sm:px-4">
      <AboutHero />
      <AboutHookQuestion />
      <AboutLearnWays />
      <AboutNotesToQuiz />
      <AboutHabit />
      <AboutCollections />
      <AboutBuilt />
      <AboutStory />

      <p data-testid="about-version" className="mt-6 text-xs text-slate-400">
        Version {__APP_VERSION__} &middot; Build {__BUILD_LABEL__} &middot; Deployed{" "}
        {new Date(`${__BUILD_TIME__}T00:00:00`).toLocaleDateString(undefined, {
          year: "numeric",
          month: "short",
          day: "numeric",
        })}
      </p>
    </div>
  </>
);

export default AboutPage;
