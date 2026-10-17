/**
 * Captures first-load traffic-attribution signals (referrer, UTM tags, ad click ids) before any
 * SPA code can rewrite `location.search` (TRAFFIC-122). `QuizModePage` and `ExploreModePage`
 * rewrite the URL shortly after mount, so this module must run before the router mounts and must
 * read `window.location` / `document.referrer` directly rather than through a route match.
 */
const ATTRIBUTION_STORAGE_KEY = "quizymode.analytics.attribution";

const UTM_PARAMS = [
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_content",
  "utm_term",
] as const;

const CLICK_ID_PARAMS = ["gclid", "gbraid", "wbraid", "msclkid", "ttclid"] as const;

export interface CapturedAttribution {
  referrer: string | null;
  utmSource?: string;
  utmMedium?: string;
  utmCampaign?: string;
  utmContent?: string;
  utmTerm?: string;
  gclid?: string;
  gbraid?: string;
  wbraid?: string;
  msclkid?: string;
  ttclid?: string;
}

const PARAM_TO_FIELD: Record<string, keyof CapturedAttribution> = {
  utm_source: "utmSource",
  utm_medium: "utmMedium",
  utm_campaign: "utmCampaign",
  utm_content: "utmContent",
  utm_term: "utmTerm",
  gclid: "gclid",
  gbraid: "gbraid",
  wbraid: "wbraid",
  msclkid: "msclkid",
  ttclid: "ttclid",
};

/**
 * Reads `document.referrer` and the current `location.search`, and stores whatever attribution
 * signals are present in `sessionStorage` so a later page (after the URL has been rewritten) can
 * still read them. Safe to call unconditionally; never throws.
 */
export function captureAttribution(): void {
  try {
    const attribution: CapturedAttribution = {
      referrer: document.referrer || null,
    };

    const params = new URLSearchParams(window.location.search);
    for (const paramName of [...UTM_PARAMS, ...CLICK_ID_PARAMS]) {
      const value = params.get(paramName);
      if (value) {
        attribution[PARAM_TO_FIELD[paramName]] = value;
      }
    }

    window.sessionStorage.setItem(
      ATTRIBUTION_STORAGE_KEY,
      JSON.stringify(attribution)
    );
  } catch {
    // Storage blocked or unavailable: attribution is simply not captured for this tab load.
  }
}

/** Reads back whatever {@link captureAttribution} stored for this tab load, if anything. */
export function getCapturedAttribution(): CapturedAttribution | null {
  try {
    const raw = window.sessionStorage.getItem(ATTRIBUTION_STORAGE_KEY);
    if (!raw) {
      return null;
    }

    return JSON.parse(raw) as CapturedAttribution;
  } catch {
    return null;
  }
}
