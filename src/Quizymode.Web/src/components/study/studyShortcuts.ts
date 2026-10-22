/** Shortcut lists shown in the Keyboard shortcuts dialog (AC 3.16.6). */
export interface StudyShortcutHelp {
  keys: string;
  description: string;
}

export const FLASHCARD_SHORTCUTS: StudyShortcutHelp[] = [
  { keys: "Space / Enter", description: "Flip the card" },
  { keys: "← / →", description: "Previous / next card" },
  { keys: "1 / 2", description: "Got it / Still learning (after flipping)" },
];

export const QUIZ_SHORTCUTS: StudyShortcutHelp[] = [
  { keys: "1-4 or A-D", description: "Choose an answer" },
  { keys: "← / →", description: "Previous / next question" },
  { keys: "Enter", description: "Next question, or view results when finished" },
];

export const LEARN_SHORTCUTS: StudyShortcutHelp[] = [
  { keys: "1-4 or A-D", description: "Choose an answer" },
  { keys: "Enter", description: "Continue (after answering, and between rounds)" },
];
