/** Number keys are game controls, but not while typing, composing or with a modifier (AC 3.20.17). */
export function isGameKeyIgnored(event: KeyboardEvent): boolean {
  if (event.defaultPrevented || event.isComposing || event.repeat) return true;
  if (event.ctrlKey || event.metaKey || event.altKey || event.shiftKey) return true;
  const target = event.target as HTMLElement | null;
  if (!target) return false;
  if (target instanceof Element && target.closest('[role="dialog"]')) return true;
  const tag: string = target.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || target.isContentEditable === true;
}
