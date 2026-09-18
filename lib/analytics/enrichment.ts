// ============================================================
// Aletsch AI — Event context enrichment
// ------------------------------------------------------------
// Breakdowns by device, browser, OS and country need those dimensions to
// exist on the event. The generated tracker does not send them, and
// adding them to the tracker would mean regenerating instrumentation in
// every repository Aletsch has already touched.
//
// So they are derived on the server instead, from information the
// browser already puts on every request:
//
//   device / browser / os  ← the User-Agent header
//   country                ← the edge/CDN geo header, when one is present
//
// Nothing is guessed. A User-Agent that cannot be classified yields
// `undefined`, not "Unknown" — the analytics layer treats an absent
// dimension as unavailable and says so, which is the honest answer.
//
// All of these fields are optional on the event document. Events written
// before this module existed simply do not have them, and every reader
// already handles that.
// ============================================================

export interface EventContext {
  device?: string;
  browser?: string;
  os?: string;
  country?: string;
}

export type EventSource = "web" | "server" | "synthetic";

const VALID_SOURCES: EventSource[] = ["web", "server", "synthetic"];

/** Buckets the UI offers. Deliberately coarse: a long tail of exact
 *  device models is noise in a funnel breakdown. */
export const DEVICE_TYPES = ["desktop", "mobile", "tablet", "bot"] as const;

/**
 * Geo headers, in the order they are trusted.
 *
 * These are set by the edge before the request reaches application code
 * and cannot be forged by the browser. A deployment behind none of these
 * proxies simply has no country data, and the UI says so.
 */
const GEO_HEADERS = [
  "x-vercel-ip-country",
  "cf-ipcountry",
  "x-appengine-country",
  "x-country-code",
  "x-geo-country",
];

/**
 * Classify a User-Agent.
 *
 * Order matters throughout: Edge's UA contains "Chrome", Chrome's
 * contains "Safari", and nearly every mobile browser contains "Mobile".
 * The most specific test always comes first.
 */
export function parseUserAgent(userAgent: string | null | undefined): EventContext {
  if (!userAgent || typeof userAgent !== "string") return {};
  const ua = userAgent.slice(0, 500);

  return {
    device: detectDevice(ua),
    browser: detectBrowser(ua),
    os: detectOs(ua),
  };
}

function detectDevice(ua: string): string | undefined {
  if (/bot|crawler|spider|crawling|headlesschrome|lighthouse|pingdom|slurp/i.test(ua)) return "bot";
  if (/ipad|tablet|playbook|silk|kindle/i.test(ua)) return "tablet";
  // Android without "Mobile" is conventionally a tablet.
  if (/android/i.test(ua) && !/mobile/i.test(ua)) return "tablet";
  if (/mobi|iphone|ipod|phone|blackberry|iemobile|opera mini/i.test(ua)) return "mobile";
  if (/windows|macintosh|mac os x|linux|cros|x11/i.test(ua)) return "desktop";
  return undefined;
}

function detectBrowser(ua: string): string | undefined {
  if (/edg(e|a|ios)?\//i.test(ua)) return "Edge";
  if (/opr\/|opera/i.test(ua)) return "Opera";
  if (/samsungbrowser/i.test(ua)) return "Samsung Internet";
  if (/firefox|fxios/i.test(ua)) return "Firefox";
  if (/chrome|crios|chromium/i.test(ua)) return "Chrome";
  // Safari identifies itself only by absence, so it is tested last.
  if (/safari/i.test(ua)) return "Safari";
  if (/msie|trident/i.test(ua)) return "Internet Explorer";
  return undefined;
}

function detectOs(ua: string): string | undefined {
  if (/windows nt|windows phone|win64|win32/i.test(ua)) return "Windows";
  // iOS before macOS: an iPhone UA also contains "Mac OS X".
  if (/iphone|ipad|ipod|ios/i.test(ua)) return "iOS";
  if (/android/i.test(ua)) return "Android";
  if (/mac os x|macintosh/i.test(ua)) return "macOS";
  if (/cros/i.test(ua)) return "Chrome OS";
  if (/linux|x11|ubuntu|fedora|debian/i.test(ua)) return "Linux";
  return undefined;
}

/** Read a country from whichever edge header the deployment provides. */
export function readCountryHeader(headers: Headers): string | undefined {
  for (const name of GEO_HEADERS) {
    const value = headers.get(name);
    const code = normalizeCountry(value);
    if (code) return code;
  }
  return undefined;
}

/**
 * ISO 3166-1 alpha-2, uppercased.
 *
 * Cloudflare sends "XX" for anonymised addresses and "T1" for Tor; both
 * are placeholders rather than countries, so they are dropped.
 */
export function normalizeCountry(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const code = value.trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(code)) return undefined;
  if (code === "XX" || code === "T1") return undefined;
  return code;
}

/**
 * Normalise a context block declared by the caller.
 *
 * Used as a fallback when the request carries no usable User-Agent, and
 * by the synthetic generator, which has to be able to vary these
 * dimensions while still going through the real ingest pipeline.
 *
 * This is not a new trust boundary: a caller holding a project's write
 * key can already write arbitrary events to that project. Accepting a
 * declared device string lets it write a *less* accurate event about
 * itself, which is the caller's own data either way.
 */
export function normalizeDeclaredContext(raw: unknown): EventContext {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const input = raw as Record<string, unknown>;

  return {
    device: normalizeLabel(input.device, 40)?.toLowerCase(),
    browser: normalizeLabel(input.browser, 40),
    os: normalizeLabel(input.os, 40),
    country: normalizeCountry(input.country),
  };
}

function normalizeLabel(value: unknown, maxLength: number): string | undefined {
  if (typeof value !== "string") return undefined;
  // Constrained to a label-safe character set so a hostile value cannot
  // be mistaken for an operator inside an aggregation pipeline.
  const cleaned = value.trim().replace(/[^A-Za-z0-9 ._-]/g, "").slice(0, maxLength).trim();
  return cleaned || undefined;
}

/**
 * Resolve the final context for an event.
 *
 * Server-derived values win over client-declared ones wherever both
 * exist, because the headers are harder to get wrong than a hand-written
 * payload. Declared values fill the gaps.
 */
export function resolveEventContext(
  serverDerived: EventContext,
  declared: EventContext | undefined
): EventContext {
  const context: EventContext = {};
  const merged = { ...(declared ?? {}), ...stripUndefined(serverDerived) };

  if (merged.device) context.device = merged.device;
  if (merged.browser) context.browser = merged.browser;
  if (merged.os) context.os = merged.os;
  if (merged.country) context.country = merged.country;

  return context;
}

function stripUndefined(context: EventContext): EventContext {
  const out: EventContext = {};
  for (const [key, value] of Object.entries(context)) {
    if (value !== undefined && value !== "") out[key as keyof EventContext] = value;
  }
  return out;
}

/**
 * Normalise the declared traffic source.
 *
 * Only `synthetic` carries real weight, and it only ever makes data less
 * trusted — a caller cannot use it to gain anything, so it does not need
 * to be defended. Anything unrecognised falls back to "web".
 */
export function normalizeSource(raw: unknown): EventSource {
  if (typeof raw !== "string") return "web";
  const value = raw.trim().toLowerCase() as EventSource;
  return VALID_SOURCES.includes(value) ? value : "web";
}

/** Derive the full server-side context from a request. */
export function contextFromRequest(headers: Headers): EventContext {
  return {
    ...parseUserAgent(headers.get("user-agent")),
    country: readCountryHeader(headers),
  };
}
