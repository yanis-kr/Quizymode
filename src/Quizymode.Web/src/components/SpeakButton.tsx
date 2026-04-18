import { SpeakerWaveIcon } from "@heroicons/react/24/outline";
import type { ItemSpeechSupport } from "@/types/api";
import { toSpeakableText } from "@/utils/itemSpeech";
import { speakText } from "@/utils/speechSynthesis";

interface SpeakButtonProps {
  text: string;
  speech?: ItemSpeechSupport | null;
  isSupported: boolean;
  label?: string;
}

/**
 * A compact icon button that reads `text` aloud via browser TTS.
 * Automatically handles inline foreign-phrase markup ({{lang|native|...}}) by
 * speaking each segment in its own language voice.
 * Renders nothing when the Web Speech API is not available.
 */
export function SpeakButton({
  text,
  speech,
  isSupported,
  label = "Read aloud",
}: SpeakButtonProps) {
  if (!isSupported) return null;

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    speakText(toSpeakableText(text, speech));
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      title={label}
      aria-label={label}
      className="inline-flex items-center justify-center rounded p-1 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600 focus:outline-none focus-visible:ring-1 focus-visible:ring-indigo-500"
    >
      <SpeakerWaveIcon className="h-4 w-4" />
    </button>
  );
}
