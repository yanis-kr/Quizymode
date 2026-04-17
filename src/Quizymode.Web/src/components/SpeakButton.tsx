import { SpeakerWaveIcon } from "@heroicons/react/24/outline";
import type { ItemSpeechSupport } from "@/types/api";
import type { SpeakableText } from "@/utils/itemSpeech";

interface SpeakButtonProps {
  text: string;
  speech?: ItemSpeechSupport | null;
  onSpeak: (text: string | SpeakableText) => void;
  isSupported: boolean;
  label?: string;
}

/**
 * A compact icon button that reads `text` aloud via browser TTS.
 * Renders nothing when the Web Speech API is not available.
 */
export function SpeakButton({
  text,
  speech,
  onSpeak,
  isSupported,
  label = "Read aloud",
}: SpeakButtonProps) {
  if (!isSupported) return null;

  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onSpeak({
          text,
          pronunciation: speech?.pronunciation ?? null,
          languageCode: speech?.languageCode ?? null,
        });
      }}
      title={label}
      aria-label={label}
      className="inline-flex items-center justify-center rounded p-1 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600 focus:outline-none focus-visible:ring-1 focus-visible:ring-indigo-500"
    >
      <SpeakerWaveIcon className="h-4 w-4" />
    </button>
  );
}
