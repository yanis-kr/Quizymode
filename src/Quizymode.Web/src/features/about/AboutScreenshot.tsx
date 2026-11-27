import type { AboutImage } from "./aboutImages";

/**
 * One About screenshot in a bordered, neutral frame (#885). The images are light-theme captures; the frame keeps them
 * readable on both page themes. Every About image is below the fold, so all of them load lazily.
 */
export const AboutScreenshot = ({ image, className = "" }: { image: AboutImage; className?: string }) => (
  <div className={`overflow-hidden rounded-lg border border-slate-300 bg-slate-100 p-1 ${className}`}>
    <img
      src={image.src}
      width={image.width}
      height={image.height}
      alt={image.alt}
      loading="lazy"
      decoding="async"
      className="block h-auto w-full rounded-md"
    />
  </div>
);
