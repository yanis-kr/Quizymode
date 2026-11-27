import { Link } from "react-router-dom";
import { ABOUT_SAMPLE_COLLECTION_ID } from "@/features/home/homePageData";
import { buildCollectionStudyPath } from "@/utils/collectionPath";
import { AboutSection } from "./AboutSection";
import { AboutScreenshot } from "./AboutScreenshot";
import { ABOUT_IMAGES, type AboutImage } from "./aboutImages";
import { aboutBodyClass, aboutCardClass, aboutLinkClass } from "./aboutStyles";

interface ModeCard {
  name: string;
  text: string;
  to: string;
  cta: string;
  image: AboutImage;
}

const MODE_CARDS: ModeCard[] = [
  {
    name: "Quiz",
    text: "Answer, see why, move on. Feeling brave? Switch to Test: timed, no peeking, results at the end.",
    to: buildCollectionStudyPath("quiz", ABOUT_SAMPLE_COLLECTION_ID),
    cta: "Try Quiz",
    image: ABOUT_IMAGES.quiz,
  },
  {
    name: "Flashcards",
    text: "Flip the card. Be honest with yourself. Repeat.",
    to: buildCollectionStudyPath("explore", ABOUT_SAMPLE_COLLECTION_ID),
    cta: "Try Flashcards",
    image: ABOUT_IMAGES.flashcards,
  },
  {
    name: "Learn",
    text: "Keeps bringing back the ones you miss until you stop missing them. Stubborn on purpose.",
    to: buildCollectionStudyPath("learn", ABOUT_SAMPLE_COLLECTION_ID),
    cta: "Try Learn",
    image: ABOUT_IMAGES.learn,
  },
  {
    name: "Games",
    text: "Match Race, Swipe Blitz, Survival, Bucket Drop and Sort It. In Match Race and Survival you race a ghost of your own best run, so the only person you can lose to is you from last Tuesday.",
    to: buildCollectionStudyPath("games", ABOUT_SAMPLE_COLLECTION_ID),
    cta: "Try Games",
    image: ABOUT_IMAGES.matchRace,
  },
];

/** Learn your way: four mode cards, each with a screenshot (#885) and a public "Try" route on Aha Moment Trivia (#883). */
export const AboutLearnWays = () => (
  <AboutSection id="about-learn" title="Same questions, five moods.">
    <p className={aboutBodyClass}>Pick whatever your brain will tolerate today.</p>
    <ul className="mt-3 grid gap-3 sm:grid-cols-2">
      {MODE_CARDS.map((card) => (
        <li key={card.name} className={aboutCardClass}>
          <AboutScreenshot image={card.image} className="mx-auto mb-2 max-w-[16rem]" />
          <p className="text-sm font-semibold text-slate-900">{card.name}</p>
          <p className="mt-1 text-sm leading-relaxed text-slate-600">{card.text}</p>
          <Link to={card.to} className={`${aboutLinkClass} mt-2 inline-flex min-h-[44px] items-center`}>
            {card.cta}
          </Link>
        </li>
      ))}
    </ul>
    <p className={aboutBodyClass}>
      <span className="font-semibold text-slate-700">Listen:</span> Tap the speaker and the question is read aloud.
      Handy for languages, and for pretending to work.
    </p>
    <p className="mt-2 text-xs text-slate-500">
      Keyboard people: 1 to 4 or A to D answers, arrows move. The mouse is optional.
    </p>
  </AboutSection>
);
