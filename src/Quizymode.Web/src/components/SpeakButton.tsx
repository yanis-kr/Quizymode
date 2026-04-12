import { SpeakerWaveIcon } from "@heroicons/react/24/outline";

interface SpeakButtonProps {
  text: string;
  onSpeak: (text: string) => void;
  isSupported: boolean;
  label?: string;
}

/**
 * A compact icon button that reads `text` aloud via browser TTS.
 * Renders nothing when the Web Speech API is not available.
 */
export function SpeakButton({
  text,
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
        onSpeak(text);
      }}
      title={label}
      aria-label={label}
      className="inline-flex items-center justify-center rounded p-1 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600 focus:outline-none focus-visible:ring-1 focus-visible:ring-indigo-500"
    >
      <SpeakerWaveIcon className="h-4 w-4" />
    </button>
  );
}
