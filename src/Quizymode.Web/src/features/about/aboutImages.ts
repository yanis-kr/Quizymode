/**
 * About page screenshots (#885). Files live in `public/about/`; `docs/about-screenshots.md` records how each was captured.
 * `width` and `height` are the file's pixel size (captured at 2x), so the browser reserves the right box before it loads.
 */
export interface AboutImage {
  src: string;
  width: number;
  height: number;
  alt: string;
}

export const ABOUT_IMAGES = {
  quiz: {
    src: "/about/quiz.webp",
    width: 750,
    height: 940,
    alt: "Quiz mode on a phone: a question about what keeps for years in a sealed jar, answered correctly, with a Did you know? explanation and the score.",
  },
  flashcards: {
    src: "/about/flashcards.webp",
    width: 750,
    height: 640,
    alt: "Flashcards mode on a phone: a question card with a Shuffle switch and a hint to click the card to reveal the answer.",
  },
  learn: {
    src: "/about/learn.webp",
    width: 750,
    height: 820,
    alt: "Learn mode on a phone: the round counter, a Mastered progress bar and a question with four answer buttons.",
  },
  matchRace: {
    src: "/about/match-race.webp",
    width: 750,
    height: 784,
    alt: "The Match Race game on a phone: questions on the left, answers on the right, one pair already matched and the timer running.",
  },
  daily: {
    src: "/about/daily.webp",
    width: 750,
    height: 1444,
    alt: "The Daily quiz page on a phone: the first of today's five questions asks which country's flag is shown, with four answer choices.",
  },
  notesAdd: {
    src: "/about/notes-add.webp",
    width: 590,
    height: 580,
    alt: "The Photos or scan tab of Turn notes into a quiz, next to Upload file and Paste text, with Take photo and Choose files buttons and a note that text is read on your device.",
  },
  notesSections: {
    src: "/about/notes-sections.webp",
    width: 590,
    height: 570,
    alt: "Sections of sample notes on the water cycle to choose from: Evaporation, Condensation and clouds, and Precipitation, each with a checkbox and a short preview.",
  },
  notesReview: {
    src: "/about/notes-review.webp",
    width: 590,
    height: 644,
    alt: "A drafted question about evaporation with the right answer marked, a short explanation and the quote from the notes it came from.",
  },
} satisfies Record<string, AboutImage>;
