import { useEffect } from "react";
import {
  isSpeechSynthesisSupported,
  speakText,
  stopSpeaking,
} from "@/utils/speechSynthesis";

/**
 * Provides browser TTS helpers and cancels any in-progress speech on unmount.
 */
export function useSpeech() {
  useEffect(() => {
    return () => {
      stopSpeaking();
    };
  }, []);

  return {
    speak: speakText,
    stop: stopSpeaking,
    isSupported: isSpeechSynthesisSupported(),
  };
}
