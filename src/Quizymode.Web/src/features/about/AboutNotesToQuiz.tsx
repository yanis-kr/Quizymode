import { AboutSection } from "./AboutSection";
import { aboutBodyClass } from "./aboutStyles";

/** Your notes, your quiz: what notes-to-quiz does, its privacy and its limits (#883, AC-A8). */
export const AboutNotesToQuiz = () => (
  <AboutSection id="about-notes" title="Hand over your notes. Get a quiz back.">
    <p className={aboutBodyClass}>
      Upload a PDF, Word or PowerPoint file, paste text, or photograph a page. Quizymode drafts multiple-choice questions
      and shows the exact quote from your material behind each one, so you can check its homework. Nothing is saved
      until you say so.
    </p>
    <ol className="mt-2 list-decimal space-y-0.5 pl-5 text-sm text-slate-600">
      <li>Add your notes.</li>
      <li>Pick the sections that matter.</li>
      <li>Keep the good questions, bin the rest.</li>
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
