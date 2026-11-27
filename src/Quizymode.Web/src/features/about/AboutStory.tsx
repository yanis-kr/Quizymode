import { Link } from "react-router-dom";
import { USER_GUIDE_URL } from "@/utils/userGuideLink";
import { getDonationHost, getDonationUrl } from "@/utils/donationLink";
import { LINKEDIN_URL } from "@/utils/projectLinks";
import { AboutExternalLink, AboutSection } from "./AboutSection";
import { aboutBodyClass, aboutLinkClass } from "./aboutStyles";

/** Why it exists, then the compact block: User Guide, Support, Image credits (#883, AC-A12, AC-A13, AC-A20). */
export const AboutStory = () => {
  const donationUrl = getDonationUrl();
  return (
    <AboutSection id="about-story" title="Why this exists">
      <p className={aboutBodyClass}>
        I&rsquo;m Yanis, a software engineer and architect. I built Quizymode to study for my AWS exam and give my kids a
        place to practice what they were learning. It grew from there: first a study tool, then a way to make study
        material, then the sandbox where I find out how much real work AI agents can be trusted with.
      </p>
      <p className={aboutBodyClass}>
        The name is quiz plus easy mode. Any resemblance to a certain bell-ringer of Notre-Dame is intentional: not the
        prettiest from every angle, but strong, dependable, and carrying more than you would expect.
      </p>
      <p className={aboutBodyClass}>
        Questions, ideas, or a fact you think we got wrong?{" "}
        <Link to="/feedback" className={aboutLinkClass}>
          Send feedback
        </Link>{" "}
        or{" "}
        <AboutExternalLink href={LINKEDIN_URL} className={aboutLinkClass}>
          say hello on LinkedIn
        </AboutExternalLink>
        . No sales pitch at either end.
      </p>

      <div className="mt-6 border-t border-slate-200 pt-4">
        <p className="text-sm text-slate-600">
          New to Quizymode?{" "}
          <AboutExternalLink href={USER_GUIDE_URL} className={aboutLinkClass}>
            Open the User Guide
          </AboutExternalLink>{" "}
          for a desktop or mobile walkthrough with a built-in view switcher.
        </p>

        {donationUrl && (
          <p className="mt-4 text-sm text-slate-600">
            Quizymode is free to use. If it helps you study, you can support its development with a donation on{" "}
            <AboutExternalLink
              href={donationUrl}
              ariaLabel={`${getDonationHost(donationUrl)}: support Quizymode (opens in a new tab)`}
              className={aboutLinkClass}
            >
              {getDonationHost(donationUrl)}
            </AboutExternalLink>
            . Donations are voluntary, non-refundable by Quizymode, and do not grant extra features. Donations are not
            tax-deductible.
          </p>
        )}

        {/* Image credits from docs/about.md (AC 7.5.1), rendered at build time. */}
        <div
          data-testid="about-credits"
          className="mt-4 max-w-none text-sm text-slate-600 [&_p]:my-2 [&_p]:leading-relaxed [&_strong]:font-semibold [&_strong]:text-slate-700 [&_a]:font-medium [&_a]:text-indigo-ink [&_a]:underline"
          dangerouslySetInnerHTML={{ __html: __ABOUT_HTML__ }}
        />
      </div>
    </AboutSection>
  );
};
