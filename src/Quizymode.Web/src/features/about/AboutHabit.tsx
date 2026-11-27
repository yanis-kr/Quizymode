import { AboutSection } from "./AboutSection";
import { AboutScreenshot } from "./AboutScreenshot";
import { ABOUT_IMAGES } from "./aboutImages";

const HABITS: { label: string; text: string }[] = [
  { label: "Daily quiz", text: "Five questions a day, the same five for everybody." },
  { label: "Streak", text: "Counts days in a row and sits in the header, watching." },
  {
    label: "Review queue",
    text: "Miss a question and it comes back tomorrow, then in 3 days, then 7, 14 and 30. Get it right each time and it leaves you alone for good.",
  },
  {
    label: "Boss fight",
    text: "Let five or more reviews pile up and the queue offers you a boss fight, with an HP bar. We did say it got out of hand.",
  },
  {
    label: "Test date",
    text: "Tell a collection when your exam is and get one small step a day until then. Rest days included.",
  },
  { label: "Share", text: "Post your daily result without spoiling the answers for anyone." },
];

/** Keep it going: the habit tools (#883), next to a Daily quiz screenshot (#885). */
export const AboutHabit = () => (
  <AboutSection id="about-habit" title="Small habits, no guilt trips.">
    <div className="mt-2 flex flex-col gap-3 sm:flex-row sm:items-start">
      <ul className="min-w-0 flex-1 space-y-1.5 text-sm leading-relaxed text-slate-600">
        {HABITS.map((habit) => (
          <li key={habit.label}>
            <span className="font-semibold text-slate-700">{habit.label}:</span> {habit.text}
          </li>
        ))}
      </ul>
      <AboutScreenshot image={ABOUT_IMAGES.daily} className="mx-auto w-full max-w-[13rem] shrink-0" />
    </div>
  </AboutSection>
);
