import type { ItemSpeechSupport } from "@/types/api";

export interface SpeakableText {
  text: string;
  pronunciation?: string | null;
  languageCode?: string | null;
}

export function toSpeakableText(
  text: string,
  speech?: ItemSpeechSupport | null
): SpeakableText {
  return {
    text,
    pronunciation: speech?.pronunciation ?? null,
    languageCode: speech?.languageCode ?? null,
  };
}

export function getPronunciationHint(
  text: string,
  speech?: ItemSpeechSupport | null
): string | null {
  const normalizedText = text.trim().toLowerCase();
  const pronunciation = speech?.pronunciation?.trim();

  if (!pronunciation) {
    return null;
  }

  return pronunciation.toLowerCase() === normalizedText ? null : pronunciation;
}

export function getIndexedSpeech(
  speechByIndex?: Record<number, ItemSpeechSupport> | null,
  index?: number
): ItemSpeechSupport | null {
  if (speechByIndex == null || index == null) {
    return null;
  }

  return speechByIndex[index] ?? null;
}

export function normalizeSpeechSupportInput(
  speech?: ItemSpeechSupport | null
): ItemSpeechSupport | undefined {
  const pronunciation = speech?.pronunciation?.trim() ?? "";
  const languageCode = speech?.languageCode?.trim() ?? "";

  if (!pronunciation && !languageCode) {
    return undefined;
  }

  return {
    ...(pronunciation ? { pronunciation } : {}),
    ...(languageCode ? { languageCode } : {}),
  };
}

export function compactIncorrectAnswersWithSpeech(
  answers: string[],
  speechByIndex?: Record<number, ItemSpeechSupport> | null
): {
  incorrectAnswers: string[];
  incorrectAnswerSpeech: Record<number, ItemSpeechSupport> | undefined;
} {
  const incorrectAnswers: string[] = [];
  const speechMap: Record<number, ItemSpeechSupport> = {};

  answers.forEach((answer, originalIndex) => {
    if (answer.trim() === "") {
      return;
    }

    const newIndex = incorrectAnswers.length;
    incorrectAnswers.push(answer);

    const speech = normalizeSpeechSupportInput(speechByIndex?.[originalIndex]);
    if (speech) {
      speechMap[newIndex] = speech;
    }
  });

  return {
    incorrectAnswers,
    incorrectAnswerSpeech: Object.keys(speechMap).length > 0 ? speechMap : undefined,
  };
}
