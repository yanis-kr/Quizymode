/**
 * Minimal browser-based text-to-speech utilities using the Web Speech API.
 * All functions are safe to call in environments where the API is absent.
 */

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
export function speakText(text: string): void {
  if (!isSpeechSynthesisSupported()) return;
  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text.trim());
  window.speechSynthesis.speak(utterance);
}

/**
 * Cancels any in-progress speech.
 * If the API is not available, this is a no-op.
 */
export function stopSpeaking(): void {
  if (!isSpeechSynthesisSupported()) return;
  window.speechSynthesis.cancel();
}
