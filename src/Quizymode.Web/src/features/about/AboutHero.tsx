import { Link } from "react-router-dom";
import { aboutPrimaryCtaClass, aboutSecondaryCtaClass } from "./aboutStyles";

/** Section 1: the page's only `h1` and the two primary CTAs (#883, AC-A1). */
export const AboutHero = () => (
  <section aria-labelledby="about-hero-title">
    <h1 id="about-hero-title" className="text-2xl font-bold text-slate-900 sm:text-3xl">
      A quiz app that got a little out of hand.
    </h1>
    <p className="mt-3 text-base leading-relaxed text-slate-600">
      Quizzes, flashcards and five small games, on topics from world flags to AWS exams to idioms that make no sense in
      English. Try five questions. No account, no email, no catch.
    </p>
    <div className="mt-4 flex flex-col gap-2 sm:flex-row">
      <Link to="/start" className={aboutPrimaryCtaClass}>
        Try 5 questions
      </Link>
      <Link to="/categories" className={aboutSecondaryCtaClass}>
        Browse topics
      </Link>
    </div>
  </section>
);
