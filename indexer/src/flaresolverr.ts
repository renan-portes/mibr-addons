/**
 * FlareSolverr client with ultra-fast direct HTTP fetch fallback.
 *
 * Strategy:
 * 1. Try direct HTTP fetch first (fast — ~300ms).
 * 2. If direct fetch succeeds and isn't blocked by Cloudflare, return HTML immediately.
 * 3. Only if direct fetch fails or returns Cloudflare challenge (403/503), call FlareSolverr sidecar.
 */

const FLARESOLVERR_URL = (process.env.FLARESOLVERR_URL ?? "http://flaresolverr:8191").replace(/\/$/, "");
const FLARE_MAX_TIMEOUT_MS = 25_000;
const DIRECT_FETCH_TIMEOUT_MS = 5_000;

const USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

interface FlareSolverrOkResponse {
  status: "ok";
  solution: {
    url: string;
    status: number;
    response: string;
    cookies: Array<{ name: string; value: string; domain: string }>;
    userAgent: string;
  };
}

interface FlareSolverrErrorResponse {
  status: "error" | string;
  message: string;
}

type FlareSolverrResponse = FlareSolverrOkResponse | FlareSolverrErrorResponse;

export interface FlareResult {
  html: string;
  statusCode: number;
  resolvedUrl: string;
}

function isOk(r: FlareSolverrResponse): r is FlareSolverrOkResponse {
  return r.status === "ok";
}

function isCloudflareChallenge(html: string, status: number): boolean {
  if (status === 403 || status === 503) return true;
  const lower = html.toLowerCase();
  return lower.includes("just a moment") || lower.includes("cf-browser-verification") || lower.includes("enable_cookies");
}

/**
 * Smart GET request — attempts fast direct fetch first, falling back to FlareSolverr if challenged.
 */
export async function flareGet(url: string, signal: AbortSignal): Promise<FlareResult> {
  // Step 1: Fast direct HTTP fetch (5s timeout)
  try {
    const directController = new AbortController();
    const timer = setTimeout(() => directController.abort(), DIRECT_FETCH_TIMEOUT_MS);
    const onAbort = () => directController.abort();
    signal.addEventListener("abort", onAbort, { once: true });

    try {
      const resp = await fetch(url, {
        headers: {
          "User-Agent": USER_AGENT,
          "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
          "Accept-Language": "pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7",
        },
        signal: directController.signal,
      });

      const html = await resp.text();
      clearTimeout(timer);
      signal.removeEventListener("abort", onAbort);

      if (resp.ok && !isCloudflareChallenge(html, resp.status)) {
        return {
          html,
          statusCode: resp.status,
          resolvedUrl: url,
        };
      }
    } catch {
      clearTimeout(timer);
      signal.removeEventListener("abort", onAbort);
      // Fall through to FlareSolverr if direct fetch fails/times out
    }
  } catch {
    // Ignore outer errors
  }

  // Step 2: Fallback to FlareSolverr sidecar
  const controller = new AbortController();
  const linked = () => controller.abort();
  signal.addEventListener("abort", linked, { once: true });

  try {
    const resp = await fetch(`${FLARESOLVERR_URL}/v1`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        cmd: "request.get",
        url,
        maxTimeout: FLARE_MAX_TIMEOUT_MS,
      }),
      signal: controller.signal,
    });

    if (!resp.ok) {
      throw new Error(`FlareSolverr HTTP ${resp.status} for ${url}`);
    }

    const data = (await resp.json()) as FlareSolverrResponse;

    if (!isOk(data)) {
      throw new Error(`FlareSolverr error: ${(data as FlareSolverrErrorResponse).message ?? data.status}`);
    }

    return {
      html: data.solution.response,
      statusCode: data.solution.status,
      resolvedUrl: data.solution.url,
    };
  } finally {
    signal.removeEventListener("abort", linked);
  }
}
