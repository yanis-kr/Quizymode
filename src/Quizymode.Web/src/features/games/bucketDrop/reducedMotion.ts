/** True when the browser asks for reduced motion (also false where matchMedia is missing). */
export function prefersReducedMotion(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    !!window.matchMedia("(prefers-reduced-motion: reduce)")?.matches
  );
}
