import { useEffect, useRef, useState } from "react";
import { PICTURE_REQUIRED_NOTE_ID, type QuestionPictureControls } from "@/components/study/pictureGate";

/**
 * Screen-reader notes for a blocked question: the reason answers are off while blocked, and a one-shot confirmation
 * when the picture finally loads. Rendered next to the answer controls.
 */
export function PictureGateNotes({ controls }: { controls: QuestionPictureControls | undefined }) {
  const blocked = controls?.blocked ?? false;
  const hadProblem = controls?.status === "error" || controls?.status === "stuck" || controls?.status === "unknown";
  const wasBlocked = useRef(false);
  const [recovered, setRecovered] = useState(false);

  useEffect(() => {
    if (blocked) {
      // Only a failure or a stall is worth announcing again once the picture finally shows.
      if (hadProblem) wasBlocked.current = true;
      return;
    }
    if (!wasBlocked.current) return;
    wasBlocked.current = false;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setRecovered(true);
    const timer = window.setTimeout(() => setRecovered(false), 2000);
    return () => window.clearTimeout(timer);
  }, [blocked, hadProblem]);

  return (
    <>
      {blocked && (
        <p id={PICTURE_REQUIRED_NOTE_ID} className="sr-only">
          Answers are unavailable until the picture loads.
        </p>
      )}
      {recovered && !blocked && (
        <p role="status" className="sr-only">
          Picture loaded. Answers are available.
        </p>
      )}
    </>
  );
}
