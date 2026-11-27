import { AboutSection } from "./AboutSection";
import { AboutScreenshot } from "./AboutScreenshot";
import { ABOUT_IMAGES } from "./aboutImages";
import { aboutBodyClass } from "./aboutStyles";

const STEPS = [
  { text: "Add your notes.", image: ABOUT_IMAGES.notesAdd },
  { text: "Pick the sections that matter.", image: ABOUT_IMAGES.notesSections },
  { text: "Keep the good questions, bin the rest.", image: ABOUT_IMAGES.notesReview },
];

/**
 * Your notes, your quiz: what notes-to-quiz does, its privacy and its limits (#883), with the three numbered steps
 * each shown on sample material (#885). The numbers come from the list markers, not the text.
 */
export const AboutNotesToQuiz = () => (
  <AboutSection id="about-notes" title="Hand over your notes. Get a quiz back.">
    <p className={aboutBodyClass}>
      Upload a PDF, Word or PowerPoint file, paste text, or photograph a page. Quizymode drafts multiple-choice questions
      and shows the exact quote from your material behind each one, so you can check its homework. Nothing is saved
      until you say so.
    </p>
    <ol className="mt-3 grid list-inside list-decimal gap-3 text-sm text-slate-600 sm:grid-cols-3" data-testid="about-notes-steps">
      {STEPS.map((step) => (
        <li key={step.text}>
          <span>{step.text}</span>
          <AboutScreenshot image={step.image} className="mx-auto mt-2 max-w-[15rem]" />
        </li>
      ))}
    </ol>
    <p className={aboutBodyClass}>
      Your original file is not kept. The extracted text is, and it expires 30 days after you last use it. Photos and
      scanned pages are read on your device, in English; only the text you confirm is sent.
    </p>
    <p className={aboutBodyClass} data-testid="about-notes-limits">
      Sign-in required. Daily and monthly limits apply. Photos and scans are limited to 20 pages at a time and are read
      with on-device text recognition, so check the recognized text. Always check generated questions before you rely
      on them.
    </p>
  </AboutSection>
);
