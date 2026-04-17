/**
 * Minimal browser-based text-to-speech utilities using the Web Speech API.
 * All functions are safe to call in environments where the API is absent.
 */

import type { SpeakableText } from "@/utils/itemSpeech";

let activeUtterance: SpeechSynthesisUtterance | null = null;
let activeTextKey: string | null = null;

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

  const speechSynthesis = window.speechSynthesis;
  const voices =
    typeof speechSynthesis.getVoices === "function" ? speechSynthesis.getVoices() : [];
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

  const utterance = createSpeechUtterance(resolvedInput);
  if (!utterance) {
    return;
  }

  activeUtterance = utterance;
  activeTextKey = activeKey;
  utterance.onend = () => clearActiveSpeech(utterance);
  utterance.onerror = () => clearActiveSpeech(utterance);
  speechSynthesis.speak(utterance);
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
