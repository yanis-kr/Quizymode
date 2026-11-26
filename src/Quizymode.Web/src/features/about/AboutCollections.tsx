import { Link } from "react-router-dom";
import {
  ABOUT_SAMPLE_COLLECTION_ID,
  ABOUT_SAMPLE_COLLECTION_NAME,
  ABOUT_SOUNDS_FAKE_COLLECTION_ID,
  ABOUT_SOUNDS_FAKE_COLLECTION_NAME,
} from "@/features/home/homePageData";
import { AboutSection } from "./AboutSection";
import { aboutBodyClass, aboutLinkClass } from "./aboutStyles";

const LINKS: { name: string; to: string }[] = [
  { name: ABOUT_SAMPLE_COLLECTION_NAME, to: `/collections/${ABOUT_SAMPLE_COLLECTION_ID}` },
  { name: ABOUT_SOUNDS_FAKE_COLLECTION_NAME, to: `/collections/${ABOUT_SOUNDS_FAKE_COLLECTION_ID}` },
  { name: "All featured sets", to: "/featured" },
];

/** Explore something fascinating: plain links, no fetch; live collection cards come later (#883, #708 part C). */
export const AboutCollections = () => (
  <AboutSection id="about-explore" title="Start with something odd.">
    <p className={aboutBodyClass}>Three sets that tend to end with &ldquo;wait, really?&rdquo;</p>
    <ul className="mt-2 flex flex-col gap-1 sm:flex-row sm:flex-wrap sm:gap-x-5">
      {LINKS.map((link) => (
        <li key={link.to}>
          <Link to={link.to} className={`${aboutLinkClass} inline-flex min-h-[44px] items-center text-sm`}>
            {link.name}
          </Link>
        </li>
      ))}
    </ul>
    <p className={aboutBodyClass}>
      Also in the building: certification prep (AWS and friends), 16 languages, and all 195 country flags, including the
      ones you will confuse with each other.
    </p>
  </AboutSection>
);
