/**
 * Minimal browser-based text-to-speech utilities using the Web Speech API.
 * All functions are safe to call in environments where the API is absent.
 */

import type { SpeakableText } from "@/utils/itemSpeech";
import {
  hasForeignPhrases,
  parseForeignPhrases,
  type Segment,
} from "@/utils/foreignPhrase";

let activeUtterance: SpeechSynthesisUtterance | null = null;
let activeTextKey: string | null = null;

// Voice list is populated asynchronously on most browsers.
// Cache it once and refresh when voiceschanged fires.
let cachedVoices: SpeechSynthesisVoice[] = [];
let voicesListenerAttached = false;

function getAvailableVoices(): SpeechSynthesisVoice[] {
  if (!isSpeechSynthesisSupported()) return [];
  if (!voicesListenerAttached) {
    voicesListenerAttached = true;
    cachedVoices = window.speechSynthesis.getVoices();
    window.speechSynthesis.addEventListener("voiceschanged", () => {
      cachedVoices = window.speechSynthesis.getVoices();
    });
  }
  return cachedVoices;
}

function clearActiveSpeech(expectedUtterance?: SpeechSynthesisUtterance): void {
  if (expectedUtterance && activeUtterance !== expectedUtterance) {
    return;
  }

  activeUtterance = null;
  activeTextKey = null;
}

export function isSpeechSynthesisSupported(): boolean {
  return (
    typeof window !== "undefined" &&
    "speechSynthesis" in window &&
    "SpeechSynthesisUtterance" in window
  );
}

/**
 * Cancels any in-progress speech, then speaks the given text.
 * If the API is not available, this is a no-op.
 */
export function createSpeechUtterance(input: string | SpeakableText): SpeechSynthesisUtterance | null {
  if (!isSpeechSynthesisSupported()) return null;

  const resolvedInput =
    typeof input === "string"
      ? { text: input }
      : input;
  const trimmedText = resolvedInput.text.trim();
  if (!trimmedText) return null;

  const utterance = new SpeechSynthesisUtterance(trimmedText);
  const requestedLanguage = resolvedInput.languageCode?.trim();
  const requestedPronunciation = resolvedInput.pronunciation?.trim();

  if (requestedLanguage) {
    utterance.lang = requestedLanguage;
  }

  const voices = getAvailableVoices();
  const resolvedVoice = findVoiceForLanguage(voices, requestedLanguage);

  if (resolvedVoice) {
    utterance.voice = resolvedVoice;
    utterance.lang = resolvedVoice.lang;
    return utterance;
  }

  if (requestedLanguage && requestedPronunciation) {
    utterance.text = requestedPronunciation;
    const fallbackVoice = findVoiceForLanguage(voices, window.navigator.language) ?? voices[0] ?? null;
    if (fallbackVoice) {
      utterance.voice = fallbackVoice;
      utterance.lang = fallbackVoice.lang;
    } else {
      utterance.lang = window.navigator.language || "en-US";
    }
  }

  return utterance;
}

function createSpeechUtterancesFromSegments(segments: Segment[]): SpeechSynthesisUtterance[] {
  return segments.flatMap((segment) => {
    const utterance =
      segment.type === "foreign"
        ? createSpeechUtterance({
            text: segment.text,
            languageCode: segment.lang,
            pronunciation: segment.pronunciation ?? segment.translit,
          })
        : createSpeechUtterance(segment.text);

    return utterance ? [utterance] : [];
  });
}

export function createSpeechUtterances(input: string | SpeakableText): SpeechSynthesisUtterance[] {
  if (!isSpeechSynthesisSupported()) return [];

  const resolvedInput =
    typeof input === "string"
      ? { text: input }
      : input;
  const trimmedText = resolvedInput.text.trim();
  if (!trimmedText) return [];

  if (hasForeignPhrases(trimmedText)) {
    return createSpeechUtterancesFromSegments(parseForeignPhrases(trimmedText));
  }

  const utterance = createSpeechUtterance(resolvedInput);
  return utterance ? [utterance] : [];
}

export function speakText(input: string | SpeakableText): void {
  if (!isSpeechSynthesisSupported()) return;

  const resolvedInput =
    typeof input === "string"
      ? { text: input }
      : input;
  const trimmedText = resolvedInput.text.trim();
  if (!trimmedText) return;

  const speechSynthesis = window.speechSynthesis;
  const activeKey = `${trimmedText}|${resolvedInput.languageCode ?? ""}|${resolvedInput.pronunciation ?? ""}`;
  const isSameTextActive =
    activeTextKey === activeKey &&
    (speechSynthesis.speaking || speechSynthesis.pending || speechSynthesis.paused);

  if (isSameTextActive) {
    speechSynthesis.cancel();
    clearActiveSpeech();
    return;
  }

  speechSynthesis.cancel();

  const utterances = createSpeechUtterances(resolvedInput);
  if (utterances.length === 0) {
    return;
  }

  activeUtterance = utterances[0];
  activeTextKey = activeKey;
  const lastUtterance = utterances[utterances.length - 1];
  lastUtterance.onend = () => clearActiveSpeech(lastUtterance);
  lastUtterance.onerror = () => clearActiveSpeech(lastUtterance);

  for (const utterance of utterances) {
    speechSynthesis.speak(utterance);
  }
}

/**
 * Cancels any in-progress speech.
 * If the API is not available, this is a no-op.
 */
export function stopSpeaking(): void {
  if (!isSpeechSynthesisSupported()) return;
  window.speechSynthesis.cancel();
  clearActiveSpeech();
}

/**
 * Speaks an array of parsed segments in sequence, giving each plain segment an
 * English voice and each foreign segment its target language voice (falling back
 * to the pronunciation hint if no matching voice is available).
 *
 * Clicking the same button again while speaking cancels playback (toggle behaviour).
 * `toggleKey` should be the original raw text string so the same button always
 * toggles the same speech session.
 */
export function speakPhrases(segments: Segment[], toggleKey: string): void {
  if (!isSpeechSynthesisSupported()) return;

  const synthesis = window.speechSynthesis;
  const isSameActive =
    activeTextKey === toggleKey &&
    (synthesis.speaking || synthesis.pending || synthesis.paused);

  synthesis.cancel();
  clearActiveSpeech();

  if (isSameActive) return;

  const utterances = createSpeechUtterancesFromSegments(segments);

  if (utterances.length === 0) return;

  activeTextKey = toggleKey;
  activeUtterance = utterances[0];
  const last = utterances[utterances.length - 1];
  last.onend = () => clearActiveSpeech(last);
  last.onerror = () => clearActiveSpeech(last);

  for (const u of utterances) {
    synthesis.speak(u);
  }
}

function findVoiceForLanguage(
  voices: SpeechSynthesisVoice[],
  languageCode?: string | null
): SpeechSynthesisVoice | null {
  if (!languageCode) {
    return null;
  }

  const normalized = languageCode.toLowerCase();
  const baseLanguage = normalized.split("-")[0];

  return (
    voices.find((voice) => voice.lang.toLowerCase() === normalized) ??
    voices.find((voice) => voice.lang.toLowerCase().startsWith(`${normalized}-`)) ??
    voices.find((voice) => voice.lang.toLowerCase().split("-")[0] === baseLanguage) ??
    null
  );
}
