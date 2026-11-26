import { GITHUB_REPO_URL, MEDIUM_STORY_URL } from "@/utils/projectLinks";
import { AboutExternalLink, AboutSection } from "./AboutSection";
import { aboutBodyClass, aboutLinkClass } from "./aboutStyles";

const BLOCKS: { title: string; text: string }[] = [
  {
    title: "The spec is the boss.",
    text: "Nothing gets built because it seemed like a good idea at the time. Every new behaviour is first written as an acceptance criterion, in plain “given this, then that” form, together with how it will be proved: a unit test, a browser test, an API call, a query. They are all in the repository, in public. A CI gate rejects a change that adds a criterion with no way to check it, so “trust me, it works” does not compile.",
  },
  {
    title: "Refinement: all the questions, asked once.",
    text: "Before any code, an agent reads a batch of issues against the current code, weeds out the duplicates, the stale and the already-done, and asks the owner every open question up front, in short batches, each with a recommended answer. A second, fresh agent reviews the resulting release plan. The owner approves it by replying with a short hash of the plan. Change one word of the plan and the hash changes, so nobody builds something that was not approved.",
  },
  {
    title: "Autopilot, with a lead agent in the owner’s chair.",
    text: "Then comes the hands-off part. The owner approves a standing envelope once: what a run may decide on its own and what it must leave alone. After that, one run takes a bundle of issues, ships them as one release with one version number and one deploy, checks the result on the live site, attaches the evidence and writes a single report. The agent doing the building is not allowed to ask questions. That is less rude than it sounds: the questions were answered during refinement, a separate lead agent decides the small ones inside the envelope, and anything outside it waits for a human.",
  },
];

const GUARD_RAILS: { label: string; text: string }[] = [
  {
    label: "Separate jobs.",
    text: "Architect, UX designer, coder, tester, reviewer, reporter, validator and lead are separate agents. The reviewer starts with a fresh context and no loyalty to the coder.",
  },
  {
    label: "Checked where it counts.",
    text: "After each deploy, automated browser checks run against the live site as a visitor, a signed-in user and an admin. If a release goes wrong, a rollback workflow puts the API and the website back on the previous good commit.",
  },
  {
    label: "Evidence or it didn’t happen.",
    text: "An issue is closed with screenshots, test output or logs attached, not with “should be fine”.",
  },
  {
    label: "Not everything needs a language model.",
    text: "Topic suggestions use a plain ranking model with no LLM. Search forgives typos and never stores what you typed.",
  },
  {
    label: "Built on a budget.",
    text: "The question generator can fall over between five model providers and stops at a monthly cap, because the hosting bill is paid by a person, not a funding round.",
  },
];

/** How it's built: text only, the one section with `h3` headings (#883, AC-A19). */
export const AboutBuilt = () => (
  <AboutSection id="about-built" title="One engineer, a crew of AI agents, and a lot of checklists.">
    <p className={aboutBodyClass}>
      Quizymode is a real app in production and also an experiment: how far can one person get with AI coding agents if
      nothing ships on trust? The early parts were written by hand. These days it is agents first, and the part worth
      looking at is everything standing around them with a clipboard.
    </p>
    {BLOCKS.map((block) => (
      <div key={block.title} className="mt-4">
        <h3 className="text-base font-semibold text-slate-800">{block.title}</h3>
        <p className="mt-1 text-sm leading-relaxed text-slate-600">{block.text}</p>
      </div>
    ))}
    <ul className="mt-4 space-y-1.5 text-sm leading-relaxed text-slate-600" data-testid="about-guard-rails">
      {GUARD_RAILS.map((rail) => (
        <li key={rail.label}>
          <span className="font-semibold text-slate-700">{rail.label}</span> {rail.text}
        </li>
      ))}
    </ul>
    <p className={aboutBodyClass}>
      .NET 10 Minimal API, React 19, PostgreSQL, AWS Cognito, CloudFront, Grafana Cloud. Every release has a version
      number, shown at the bottom of this page.
    </p>
    <p className={aboutBodyClass}>
      The code is public under the MIT licence, including the agent instructions and the workflow rules. Read it, judge
      it, borrow the good parts.{" "}
      <AboutExternalLink href={GITHUB_REPO_URL} className={aboutLinkClass}>
        Source on GitHub
      </AboutExternalLink>{" "}
      &middot;{" "}
      <AboutExternalLink href={MEDIUM_STORY_URL} className={aboutLinkClass}>
        The longer story on Medium
      </AboutExternalLink>
    </p>
  </AboutSection>
);
