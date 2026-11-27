/** Action styles on the default quiz results (#898): one filled primary, outlined review buttons, the rest text links. */
const FOCUS_RING = "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2";
const BUTTON = `inline-flex min-h-[44px] items-center justify-center rounded-md px-4 py-2 font-semibold ${FOCUS_RING}`;

export const PRIMARY_ACTION_CLASS = `${BUTTON} bg-indigo-600 text-white hover:bg-indigo-700`;
export const SECONDARY_ACTION_CLASS = `${BUTTON} border border-indigo-600 text-indigo-ink hover:bg-indigo-50`;
export const LINK_ACTION_CLASS = `inline-flex min-h-[44px] items-center justify-center rounded px-2 py-2 font-semibold text-indigo-ink underline ${FOCUS_RING}`;
