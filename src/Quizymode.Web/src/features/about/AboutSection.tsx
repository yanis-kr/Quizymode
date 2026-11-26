import type { ReactNode } from "react";
import { aboutH2Class } from "./aboutStyles";

interface AboutSectionProps {
  id: string;
  title: string;
  children: ReactNode;
}

/** One About section: a `section` labelled by its single `h2` (#883, AC-A6). */
export const AboutSection = ({ id, title, children }: AboutSectionProps) => (
  <section aria-labelledby={`${id}-title`} className="mt-8">
    <h2 id={`${id}-title`} className={aboutH2Class}>
      {title}
    </h2>
    {children}
  </section>
);

interface AboutExternalLinkProps {
  href: string;
  className: string;
  children: ReactNode;
  ariaLabel?: string;
}

/** External links open in a new tab without leaking the opener (AC-A15). */
export const AboutExternalLink = ({ href, className, children, ariaLabel }: AboutExternalLinkProps) => (
  <a href={href} target="_blank" rel="noopener noreferrer" aria-label={ariaLabel} className={className}>
    {children}
  </a>
);
