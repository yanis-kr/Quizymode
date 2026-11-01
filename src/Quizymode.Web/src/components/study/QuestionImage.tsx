import { useEffect, useRef, useState } from "react";
import { ExclamationTriangleIcon } from "@heroicons/react/24/outline";
import { resolveCuratedImage } from "@/media/curatedImages";
import type { ItemImageReference } from "@/types/api";

export type QuestionImageSize = "lg" | "sm" | "xs";

interface QuestionImageProps {
  image?: ItemImageReference | null;
  /** lg: study surfaces; sm: list/review thumbnail; xs: recap thumbnail. */
  size?: QuestionImageSize;
  className?: string;
}

type LoadStatus = "loading" | "loaded" | "error";

const THUMB_BOX: Record<Exclude<QuestionImageSize, "lg">, string> = {
  sm: "relative h-12 w-[4.5rem] shrink-0 overflow-hidden rounded bg-slate-200 ring-1 ring-inset ring-gray-300 sm:h-16 sm:w-24",
  xs: "relative h-8 w-12 shrink-0 overflow-hidden rounded bg-slate-200 ring-1 ring-inset ring-gray-300",
};

const LARGE_BOX =
  "relative aspect-[3/2] w-full max-h-[30vh] overflow-hidden rounded-lg bg-slate-200 ring-1 ring-inset ring-gray-300 focus:outline-none sm:max-h-72";

/**
 * Curated question picture (#407). Renders nothing without an image. The alt text is always the image's
 * altText and is never shown as a visible caption. A failed or unknown picture never blocks answering.
 */
export function QuestionImage({ image, size = "lg", className = "" }: QuestionImageProps) {
  if (!image) return null;
  return <QuestionImageBox key={image.key} image={image} size={size} className={className} />;
}

function QuestionImageBox({
  image,
  size,
  className,
}: {
  image: ItemImageReference;
  size: QuestionImageSize;
  className: string;
}) {
  const url = resolveCuratedImage(image.key);
  const isUnknown = url === null;
  const [status, setStatus] = useState<LoadStatus>(isUnknown ? "error" : "loading");
  const [attempt, setAttempt] = useState(0);
  const boxRef = useRef<HTMLDivElement>(null);
  const focusAfterRetry = useRef(false);

  useEffect(() => {
    if (focusAfterRetry.current) {
      focusAfterRetry.current = false;
      boxRef.current?.focus();
    }
  }, [attempt]);

  const retry = () => {
    focusAfterRetry.current = true;
    setStatus("loading");
    setAttempt((current) => current + 1);
  };

  const isLarge = size === "lg";
  const message = isUnknown ? "Picture isn't available" : "Picture couldn't load";
  const src = url === null ? undefined : attempt > 0 ? `${url}?r=${attempt}` : url;

  const box = (
    <div
      ref={boxRef}
      data-testid="question-image"
      aria-busy={status === "loading"}
      tabIndex={isLarge ? -1 : undefined}
      className={isLarge ? LARGE_BOX : `${THUMB_BOX[size as Exclude<QuestionImageSize, "lg">]} ${className}`.trim()}
    >
      {status === "loading" && (
        <>
          <div className="absolute inset-0 bg-slate-300 motion-safe:animate-pulse" aria-hidden="true" />
          {isLarge && (
            <span className="sr-only" role="status">
              Loading picture
            </span>
          )}
        </>
      )}
      {!isUnknown && status !== "error" && (
        <img
          key={attempt}
          src={src}
          alt={image.altText}
          width={640}
          height={640}
          decoding="async"
          draggable={false}
          loading={isLarge ? "eager" : "lazy"}
          onLoad={() => setStatus("loaded")}
          onError={() => setStatus("error")}
          className={`h-full w-full object-contain ${isLarge ? "p-2" : "p-1"} motion-safe:transition-opacity motion-safe:duration-200 ${
            status === "loaded" ? "opacity-100" : "opacity-0"
          }`}
        />
      )}
      {status === "error" &&
        (isLarge ? (
          <div className="flex h-full flex-col items-center justify-center gap-2 p-3 text-center">
            <ExclamationTriangleIcon className="h-6 w-6 text-gray-500" aria-hidden="true" />
            <p role="status" className="text-sm font-medium text-gray-700">
              {message}
            </p>
            {!isUnknown && (
              <button
                type="button"
                onClick={retry}
                aria-label="Retry loading picture"
                data-testid="question-image-retry"
                className="min-h-[44px] rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2"
              >
                Retry
              </button>
            )}
          </div>
        ) : (
          <div className="flex h-full items-center justify-center" role="img" aria-label={message}>
            <ExclamationTriangleIcon className="h-5 w-5 text-gray-500" aria-hidden="true" />
          </div>
        ))}
    </div>
  );

  if (!isLarge) return box;
  return <div className={`mx-auto w-full max-w-md ${className}`.trim()}>{box}</div>;
}
