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

export function normalizeSpeechSupportMapInput(
  speechByIndex?: Record<number, ItemSpeechSupport> | null
): Record<number, ItemSpeechSupport> | undefined {
  if (!speechByIndex) {
    return undefined;
  }

  const normalizedEntries = Object.entries(speechByIndex)
    .map(([index, speech]) => [Number(index), normalizeSpeechSupportInput(speech)] as const)
    .filter((entry): entry is readonly [number, ItemSpeechSupport] => Number.isInteger(entry[0]) && entry[1] != null);

  if (normalizedEntries.length === 0) {
    return undefined;
  }

  return Object.fromEntries(normalizedEntries) as Record<number, ItemSpeechSupport>;
}
